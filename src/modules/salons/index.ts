import { ChannelType, Events, MessageFlags, type ButtonInteraction, type Client, type GuildBasedChannel, type NewsChannel, type TextChannel } from "discord.js";
import type { GuildSettings } from "@/config/store";
import { getSettings } from "@/config/store";
import { isModuleEnabled } from "@/core/access";
import { defineCommand, PERMISSION, type OptionDef } from "@/core/command";
import type { ComponentHandler } from "@/core/components";
import type { CommandContext } from "@/core/context";
import { formatDuration } from "@/core/duration";
import { notice } from "@/core/embeds";
import { UserError } from "@/core/errors";
import { ICON } from "@/core/panels";
import type { BotModule } from "@/core/registry";
import { env } from "@/env";
import { logger } from "@/logger";
import { clearMessages, isProtectedChannel, LOCK_MESSAGES, manageableChannel, nukeConfirmation, NUKE_PREFIX, nuking, setEveryone, snipeEmbed, snipes } from "./actions";
import { MAX_CLEAR, MODULE, parseSlowmode } from "./logic";
import { accessOf, salonPanel, salonView } from "./panel";

export { isProtectedChannel } from "./actions";

const channelOption: OptionDef = { name: "salon", description: "Salon (par défaut : celui-ci)", type: "channel" };
const reasonOption: OptionDef = { name: "raison", description: "Raison (journal d'audit)", type: "string", maxLength: 300, rest: true };

/** Salon textuel visé : l'option, sinon celui de la commande. */
const textChannel = (ctx: CommandContext) => manageableChannel(ctx.guild, (ctx.channelArg("salon") ?? ctx.channel) as GuildBasedChannel | null);

const audit = (ctx: CommandContext) => `${ctx.string("raison")?.trim() || "Sans raison"} (par ${ctx.user.tag})`;

async function everyone(ctx: CommandContext, permission: "SendMessages" | "ViewChannel", allow: false | null, message: string) {
  const channel = textChannel(ctx);
  await ctx.defer({ private: true });
  await setEveryone(ctx.settings, channel, permission, allow, audit(ctx), message);
  await ctx.reply({ embeds: [notice(ctx.settings, `${channel} : ${message.charAt(0).toLowerCase()}${message.slice(1)}`)] }, { private: true });
}

/** Panneau qui regroupe les outils d'un salon. */
const salon = defineCommand({
  name: "salon",
  aliases: ["salons", "channel"],
  description: "Ouvre le panneau d'un salon : verrouiller, cacher, mode lent, supprimer des messages, dernier supprimé, recréer.",
  module: MODULE,
  defaultPermission: PERMISSION.salons,
  options: [channelOption],
  async run(ctx) {
    const channel = textChannel(ctx);
    await ctx.reply(salonView({ settings: ctx.settings, owner: ctx.user.id, allowed: accessOf(ctx.settings, ctx.member) }, channel), { private: true });
  },
});

const clear = defineCommand({
  name: "clear",
  aliases: ["purge"],
  description: "Supprime les derniers messages du salon (100 au plus, de moins de 14 jours), d'un membre si précisé.",
  module: MODULE,
  defaultPermission: PERMISSION.messages,
  options: [
    { name: "nombre", description: `Nombre de messages (1 à ${MAX_CLEAR})`, type: "integer", required: true, minValue: 1, maxValue: MAX_CLEAR },
    { name: "membre", description: "Seulement les messages de ce membre", type: "user" },
  ],
  async run(ctx) {
    const channel = ctx.channel;
    if (channel?.type !== ChannelType.GuildText && channel?.type !== ChannelType.GuildAnnouncement) throw new UserError("Cette commande s'utilise dans un salon textuel.");
    await ctx.defer({ private: true });
    const author = ctx.userArg("membre");
    // En préfixe, la commande elle-même ne compte pas dans le nombre demandé.
    const deleted = await clearMessages(channel, ctx.integer("nombre", true), author?.id, ctx.message?.id);
    await ctx.reply({ embeds: [notice(ctx.settings, `${deleted} message(s) supprimé(s)${author ? ` de ${author}` : ""}.`)] }, { private: true });
  },
});

const lock = defineCommand({
  name: "lock",
  aliases: ["verrouiller"],
  description: "Verrouille un salon : plus personne ne peut y écrire, sauf les rôles autorisés.",
  module: MODULE,
  defaultPermission: PERMISSION.salons,
  options: [channelOption, reasonOption],
  run: ctx => everyone(ctx, "SendMessages", false, LOCK_MESSAGES.lock),
});

const unlock = defineCommand({
  name: "unlock",
  aliases: ["deverrouiller"],
  description: "Déverrouille un salon verrouillé.",
  module: MODULE,
  defaultPermission: PERMISSION.salons,
  options: [channelOption, reasonOption],
  run: ctx => everyone(ctx, "SendMessages", null, LOCK_MESSAGES.unlock),
});

const hide = defineCommand({
  name: "hide",
  aliases: ["cacher"],
  description: "Cache un salon à @everyone (les rôles autorisés le voient toujours).",
  module: MODULE,
  defaultPermission: PERMISSION.salons,
  options: [channelOption, reasonOption],
  run: ctx => everyone(ctx, "ViewChannel", false, LOCK_MESSAGES.hide),
});

const unhide = defineCommand({
  name: "unhide",
  aliases: ["montrer"],
  description: "Rend visible un salon caché.",
  module: MODULE,
  defaultPermission: PERMISSION.salons,
  options: [channelOption, reasonOption],
  run: ctx => everyone(ctx, "ViewChannel", null, LOCK_MESSAGES.unhide),
});

const slowmode = defineCommand({
  name: "slowmode",
  aliases: ["lent"],
  description: "Règle le mode lent d'un salon (6 heures au plus ; 0 pour le retirer).",
  module: MODULE,
  defaultPermission: PERMISSION.salons,
  options: [{ name: "duree", description: "Délai entre deux messages : 5s, 1m, 2h ; 0 pour retirer", type: "string", required: true, maxLength: 20 }, channelOption],
  async run(ctx) {
    const channel = textChannel(ctx);
    const seconds = parseSlowmode(ctx.string("duree", true));
    await ctx.defer({ private: true });
    await channel.setRateLimitPerUser(seconds, `Mode lent (par ${ctx.user.tag})`);
    await ctx.reply({ embeds: [notice(ctx.settings, seconds ? `Mode lent de ${formatDuration(seconds * 1000)} dans ${channel}.` : `Mode lent retiré dans ${channel}.`)] }, { private: true });
  },
});

const nuke = defineCommand({
  name: "nuke",
  description: "Recrée un salon à l'identique et vide (après confirmation) : tous ses messages disparaissent.",
  module: MODULE,
  defaultPermission: PERMISSION.gestion,
  protected: true,
  options: [channelOption],
  async run(ctx) {
    const channel = textChannel(ctx);
    if (isProtectedChannel(ctx.guild, channel.id)) throw new UserError(`${channel} est un salon réservé par Discord (règles, annonces de la communauté, messages système…) : il ne peut pas être recréé.`);
    await ctx.reply(nukeConfirmation(channel, ctx.user.id), { private: true });
  },
});

const nukeHandler: ComponentHandler = {
  prefix: NUKE_PREFIX,
  command: "nuke",
  async handle(interaction, { action, args, settings }) {
    if (!interaction.isButton()) throw new Error("Bouton attendu.");
    if (action === "annuler") return interaction.update({ content: "Annulé.", components: [] });
    const channel = interaction.guild.channels.cache.get(args[0] ?? "");
    if (channel?.type !== ChannelType.GuildText && channel?.type !== ChannelType.GuildAnnouncement) throw new UserError("Ce salon n'existe plus.");
    if (isProtectedChannel(interaction.guild, channel.id)) throw new UserError("Ce salon est réservé par Discord : il ne peut pas être recréé.");
    if (nuking.has(channel.id)) return interaction.update({ content: "Recréation déjà en cours.", components: [] });
    nuking.add(channel.id);
    try {
      await interaction.update({ content: "💥 Recréation du salon…", components: [] });
      const clone = await channel.clone({ position: channel.rawPosition, reason: `Nuke par ${interaction.user.tag}` });
      try {
        await channel.delete(`Nuke par ${interaction.user.tag}`);
      } catch (error) {
        // Discord refuse : on retire la copie pour ne pas laisser deux salons.
        await clone.delete("Recréation annulée").catch(() => {});
        throw error;
      }
      await finishNuke(clone, interaction, settings);
    } finally {
      nuking.delete(channel.id);
    }
  },
};

async function finishNuke(clone: TextChannel | NewsChannel, interaction: ButtonInteraction<"cached">, settings: GuildSettings) {
  await clone.send({ embeds: [notice(settings, `💥 Salon recréé par <@${interaction.user.id}>.`)], allowedMentions: { parse: [] } });
  // Le message éphémère vivait dans l'ancien salon : on répond à nouveau si c'est encore possible.
  await interaction.followUp({ content: `${ICON.valider} Salon recréé : ${clone}.`, flags: MessageFlags.Ephemeral }).catch(() => {});
}

const snipe = defineCommand({
  name: "snipe",
  description: "Affiche le dernier message supprimé du salon (gardé 10 minutes).",
  module: MODULE,
  defaultPermission: PERMISSION.messages,
  async run(ctx) {
    const item = ctx.channel ? snipes.get(ctx.channel.id) : undefined;
    if (!item) throw new UserError("Aucun message supprimé récemment dans ce salon.");
    await ctx.reply({ embeds: [snipeEmbed(ctx.settings, item)] }, { private: true });
  },
});

function setup(client: Client) {
  const guildId = env().DISCORD_GUILD_ID;
  client.on(Events.MessageDelete, async message => {
    if (message.guildId !== guildId || message.partial || message.author.bot) return;
    try {
      const settings = await getSettings(guildId);
      if (!isModuleEnabled(settings, MODULE)) return;
      snipes.remember(message.channelId, {
        authorId: message.author.id,
        authorTag: message.author.tag,
        avatarUrl: message.author.displayAvatarURL(),
        content: message.content,
        attachments: [...message.attachments.values()].map(attachment => attachment.url),
        createdAt: message.createdTimestamp,
        deletedAt: Date.now(),
      });
    } catch (error) {
      logger.warn({ err: error }, "Mémorisation d'un message supprimé impossible");
    }
  });
  setInterval(() => snipes.prune(), 60 * 1000).unref();
}

export const channelsModule: BotModule = {
  id: MODULE,
  label: "Outils de salon",
  icon: "🧹",
  description: "Panneau /salon et commandes : suppression de messages, verrouillage, salon caché, mode lent, recréation d'un salon et dernier message supprimé.",
  commands: [salon, clear, lock, unlock, hide, unhide, slowmode, nuke, snipe],
  components: [salonPanel, nukeHandler],
  setup,
};
