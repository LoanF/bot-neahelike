import { ButtonStyle, ChannelType, Events, MessageFlags, PermissionFlagsBits, type ButtonInteraction, type Client, type Guild, type GuildBasedChannel, type NewsChannel, type TextChannel } from "discord.js";
import type { GuildSettings } from "@/config/store";
import { getSettings } from "@/config/store";
import { isModuleEnabled } from "@/core/access";
import { defineCommand, PERMISSION, type OptionDef } from "@/core/command";
import { customId, type ComponentHandler } from "@/core/components";
import type { CommandContext } from "@/core/context";
import { formatDuration } from "@/core/duration";
import { embed, notice } from "@/core/embeds";
import { UserError } from "@/core/errors";
import { button, ICON, row } from "@/core/panels";
import type { BotModule } from "@/core/registry";
import { env } from "@/env";
import { logger } from "@/logger";
import { deletable, MAX_CLEAR, MODULE, parseSlowmode, SnipeStore } from "./logic";

const snipes = new SnipeStore();
/** Salons en cours de recréation : un double clic ne crée pas deux copies. */
const nuking = new Set<string>();

/** Salons que Discord réserve (règles, mises à jour de la communauté, alertes, messages système, widget) : jamais recréés. */
export function isProtectedChannel(guild: Pick<Guild, "rulesChannelId" | "publicUpdatesChannelId" | "safetyAlertsChannelId" | "systemChannelId" | "widgetChannelId">, channelId: string) {
  return [guild.rulesChannelId, guild.publicUpdatesChannelId, guild.safetyAlertsChannelId, guild.systemChannelId, guild.widgetChannelId].includes(channelId);
}
const NUKE_PREFIX = "nuk";

const channelOption: OptionDef = { name: "salon", description: "Salon (par défaut : celui-ci)", type: "channel" };
const reasonOption: OptionDef = { name: "raison", description: "Raison (journal d'audit)", type: "string", maxLength: 300, rest: true };

/** Salon textuel visé : l'option, sinon celui de la commande. */
function textChannel(ctx: CommandContext): TextChannel {
  const channel = (ctx.channelArg("salon") ?? ctx.channel) as GuildBasedChannel | null;
  if (channel?.type !== ChannelType.GuildText && channel?.type !== ChannelType.GuildAnnouncement) throw new UserError("Choisissez un salon textuel.");
  const me = ctx.guild.members.me;
  // Modifier les permissions d'un salon demande aussi « Gérer les permissions » (Gérer les rôles) sur ce salon.
  if (!me || !channel.permissionsFor(me).has([PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles])) {
    throw new UserError(`Le bot doit pouvoir gérer le salon ${channel} et ses permissions.`);
  }
  return channel as TextChannel;
}

const audit = (ctx: CommandContext) => `${ctx.string("raison")?.trim() || "Sans raison"} (par ${ctx.user.tag})`.slice(0, 512);

/** Verrouiller (écriture) ou cacher (lecture) un salon pour @everyone ; `null` rend la main aux permissions de la catégorie. */
async function setEveryone(ctx: CommandContext, permission: "SendMessages" | "ViewChannel", allow: false | null, message: string) {
  const channel = textChannel(ctx);
  await ctx.defer({ private: true });
  // Cacher un salon à @everyone le cache aussi au bot s'il n'a pas d'autorisation propre : il la reçoit d'abord, pour pouvoir le rendre visible ensuite.
  if (permission === "ViewChannel" && allow === false && ctx.guild.members.me) {
    await channel.permissionOverwrites.edit(ctx.guild.members.me, { ViewChannel: true, ManageChannels: true, ManageRoles: true }, { reason: "Le bot garde l'accès au salon caché" });
  }
  const overwrite = permission === "SendMessages" ? { SendMessages: allow, SendMessagesInThreads: allow, CreatePublicThreads: allow, AddReactions: allow } : { ViewChannel: allow };
  await channel.permissionOverwrites.edit(ctx.guild.roles.everyone, overwrite, { reason: audit(ctx) });
  if (permission === "SendMessages") await channel.send({ embeds: [notice(ctx.settings, message)] }).catch(() => {});
  await ctx.reply({ embeds: [notice(ctx.settings, `${channel} : ${message.charAt(0).toLowerCase()}${message.slice(1)}`)] }, { private: true });
}

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
    if (!channel || !("bulkDelete" in channel)) throw new UserError("Cette commande s'utilise dans un salon textuel.");
    const me = ctx.guild.members.me;
    if (!me || !channel.permissionsFor(me).has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages])) {
      throw new UserError("Le bot doit pouvoir lire l'historique et gérer les messages de ce salon.");
    }
    await ctx.defer({ private: true });
    const count = ctx.integer("nombre", true);
    const author = ctx.userArg("membre");
    const fetched = await channel.messages.fetch({ limit: 100 });
    // En préfixe, la commande elle-même ne compte pas dans le nombre demandé.
    const candidates = [...fetched.values()].filter(message => message.id !== ctx.message?.id);
    const targets = deletable(candidates, count, author?.id);
    if (targets.length === 0) throw new UserError("Aucun message récent à supprimer (Discord n'efface en masse que les messages de moins de 14 jours).");
    const deleted = await channel.bulkDelete(targets, true);
    await ctx.reply({ embeds: [notice(ctx.settings, `${deleted.size} message(s) supprimé(s)${author ? ` de ${author}` : ""}.`)] }, { private: true });
  },
});

const lock = defineCommand({
  name: "lock",
  aliases: ["verrouiller"],
  description: "Verrouille un salon : plus personne ne peut y écrire, sauf les rôles autorisés.",
  module: MODULE,
  defaultPermission: PERMISSION.salons,
  options: [channelOption, reasonOption],
  run: ctx => setEveryone(ctx, "SendMessages", false, "🔒 Salon verrouillé par l'équipe."),
});

const unlock = defineCommand({
  name: "unlock",
  aliases: ["deverrouiller"],
  description: "Déverrouille un salon verrouillé.",
  module: MODULE,
  defaultPermission: PERMISSION.salons,
  options: [channelOption, reasonOption],
  run: ctx => setEveryone(ctx, "SendMessages", null, "🔓 Salon déverrouillé : l'écriture pour @everyone suit de nouveau la catégorie."),
});

const hide = defineCommand({
  name: "hide",
  aliases: ["cacher"],
  description: "Cache un salon à @everyone (les rôles autorisés le voient toujours).",
  module: MODULE,
  defaultPermission: PERMISSION.salons,
  options: [channelOption, reasonOption],
  run: ctx => setEveryone(ctx, "ViewChannel", false, "👁️ Salon caché à @everyone : seuls les rôles qui ont une autorisation propre à ce salon (et les administrateurs) le voient."),
});

const unhide = defineCommand({
  name: "unhide",
  aliases: ["montrer"],
  description: "Rend visible un salon caché.",
  module: MODULE,
  defaultPermission: PERMISSION.salons,
  options: [channelOption, reasonOption],
  run: ctx => setEveryone(ctx, "ViewChannel", null, "👁️ Salon de nouveau visible."),
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
    await ctx.reply(
      {
        content:
          `${ICON.attention} **Recréer ${channel} ?** Tous ses messages seront perdus définitivement ; ses réglages et permissions sont gardés.\n` +
          "Le nouveau salon aura un autre identifiant : s'il sert au bot (logs, bienvenue, statut, compteurs, tickets…), choisissez-le de nouveau dans le panneau concerné.",
        components: [
          row(
            button(customId(NUKE_PREFIX, ctx.user.id, "ok", channel.id), "Recréer le salon", { emoji: "💥", style: ButtonStyle.Danger }),
            button(customId(NUKE_PREFIX, ctx.user.id, "annuler"), "Annuler", { emoji: ICON.annuler, style: ButtonStyle.Secondary }),
          ),
        ],
      },
      { private: true },
    );
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
    const result = embed(ctx.settings, "bronze")
      .setAuthor({ name: item.authorTag, iconURL: item.avatarUrl })
      .setDescription(item.content.slice(0, 4000) || "*Sans texte*")
      .setFooter({ text: `Supprimé` })
      .setTimestamp(item.deletedAt);
    if (item.attachments.length) result.addFields({ name: "Pièces jointes", value: item.attachments.join("\n").slice(0, 1024) });
    await ctx.reply({ embeds: [result] }, { private: true });
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
  description: "Suppression de messages, verrouillage, salon caché, mode lent, recréation d'un salon et dernier message supprimé.",
  commands: [clear, lock, unlock, hide, unhide, slowmode, nuke, snipe],
  components: [nukeHandler],
  setup,
};
