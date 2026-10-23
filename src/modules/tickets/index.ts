import { ChannelType, Events, type Client, type Guild, type TextChannel } from "discord.js";
import { getSettings } from "@/config/store";
import { defineCommand, PERMISSION } from "@/core/command";
import type { CommandContext } from "@/core/context";
import { UserError } from "@/core/errors";
import type { BotModule } from "@/core/registry";
import { env } from "@/env";
import { logger } from "@/logger";
import { autoClose, categoryOf, isTicketStaff, openChannels, ticketButtons, ticketSummary } from "./actions";
import { renderTicketsPanel, ticketsPanel } from "./panel";
import { MODULE } from "./settings";
import { closeTicket, openTicketChannels, ticketByChannel, touchTicket } from "./store";
import { ticketHandler } from "./ui";

/** Activité écrite en base au plus toutes les 5 minutes par ticket. */
const TOUCH_EVERY_MS = 5 * 60 * 1000;
/** Vérification des tickets inactifs toutes les heures. */
const AUTO_CLOSE_EVERY_MS = 60 * 60 * 1000;

const lastTouch = new Map<string, number>();

/** Ticket du salon où la commande est lancée. */
async function ticketHere(ctx: CommandContext) {
  const channel = ctx.channel;
  const ticket = channel ? await ticketByChannel(channel.id) : undefined;
  if (!ticket || channel?.type !== ChannelType.GuildText) throw new UserError("Cette commande s'utilise dans le salon d'un ticket.");
  return { ticket, channel: channel as TextChannel };
}

const tickets = defineCommand({
  name: "tickets",
  description: "Ouvre le panneau des tickets : catégories, rôles, questions, archives et publication.",
  module: MODULE,
  defaultPermission: PERMISSION.gestion,
  protected: true,
  async run(ctx) {
    await ctx.reply(renderTicketsPanel({ settings: ctx.settings, guild: ctx.guild, owner: ctx.user.id }), { private: true });
  },
});

const ticket = defineCommand({
  name: "ticket",
  description: "Dans un ticket : son état et ses boutons (prendre en charge, fermer, ajouter ou retirer un membre).",
  module: MODULE,
  defaultPermission: PERMISSION.tous,
  async run(ctx) {
    const { ticket: current } = await ticketHere(ctx);
    const staff = isTicketStaff(ctx.member, categoryOf(ctx.settings, current));
    if (!staff && current.opener_id !== ctx.user.id) throw new UserError("Seuls l'auteur du ticket et l'équipe peuvent le gérer.");
    await ctx.reply({ embeds: [ticketSummary(ctx.settings, current)], components: ticketButtons(current) }, { private: true });
  },
});

function setup(client: Client) {
  const guildId = env().DISCORD_GUILD_ID;

  // L'activité d'un ticket repousse sa fermeture automatique.
  client.on(Events.MessageCreate, message => {
    if (message.guildId !== guildId || message.author.bot || !openChannels.has(message.channelId)) return;
    const now = Date.now();
    if (now - (lastTouch.get(message.channelId) ?? 0) < TOUCH_EVERY_MS) return;
    lastTouch.set(message.channelId, now);
    touchTicket(message.channelId).catch(error => logger.warn({ err: error }, "Suivi de l'activité du ticket impossible"));
  });

  // Salon supprimé à la main : le ticket est fermé en base pour libérer la catégorie.
  client.on(Events.ChannelDelete, async channel => {
    if (channel.isDMBased() || channel.guildId !== guildId || !openChannels.has(channel.id)) return;
    openChannels.delete(channel.id);
    const current = await ticketByChannel(channel.id).catch(() => undefined);
    if (current?.status === "ouvert") {
      await closeTicket(current.id, { closedById: client.user?.id ?? "", reason: "Salon supprimé", transcript: "" }).catch(error =>
        logger.error({ err: error }, "Fermeture du ticket au salon supprimé impossible"),
      );
    }
  });
}

async function onReady(guild: Guild) {
  for (const channelId of await openTicketChannels(guild.id)) openChannels.add(channelId);
  const settings = await getSettings(guild.id);
  logger.info({ ouverts: openChannels.size, enabled: settings.modules.get(MODULE)?.enabled ?? true }, "Tickets chargés");
  const run = () => autoClose(guild).catch(error => logger.error({ err: error }, "Fermeture automatique des tickets impossible"));
  setInterval(run, AUTO_CLOSE_EVERY_MS).unref();
  void run();
}

export const ticketsModule: BotModule = {
  id: MODULE,
  label: "Tickets",
  icon: "🎫",
  description: "Demandes privées des joueurs : un salon par ticket, prise en charge, transcription et note.",
  tables: ["bot_tickets"],
  commands: [tickets, ticket],
  components: [ticketsPanel, ticketHandler],
  setup,
  onReady,
  messages: [
    {
      key: "tickets.panneau",
      module: MODULE,
      label: "Texte du panneau des tickets",
      defaultContent: "Besoin de l'équipe de la cité ? Choisis la catégorie de ta demande : un salon privé s'ouvrira, visible de toi et des personnes qui la traitent.",
    },
    {
      key: "tickets.bienvenue",
      module: MODULE,
      label: "Accueil dans un ticket",
      defaultContent: "Bienvenue {user}. Un membre de l'équipe va te répondre ici. Ajoute tout ce qui peut aider : captures, liens, détails.",
    },
    {
      key: "tickets.fermeture-mp",
      module: MODULE,
      label: "MP à la fermeture d'un ticket",
      defaultContent: "Ton ticket {ticket} ({categorie}) a été fermé.\n**Raison :** {raison}\n\nComment s'est passé l'échange ? Donne une note de 1 à 5 étoiles.",
      variables: { "{ticket}": "numéro du ticket", "{categorie}": "catégorie", "{raison}": "raison de la fermeture" },
    },
  ],
};
