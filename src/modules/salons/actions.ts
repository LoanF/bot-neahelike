import { ButtonStyle, ChannelType, PermissionFlagsBits, type Guild, type GuildBasedChannel, type NewsChannel, type TextChannel } from "discord.js";
import type { GuildSettings } from "@/config/store";
import { customId } from "@/core/components";
import type { Payload } from "@/core/context";
import { embed, notice } from "@/core/embeds";
import { UserError } from "@/core/errors";
import { button, ICON, row } from "@/core/panels";
import { deletable, SnipeStore, type Sniped } from "./logic";

/** Dernier message supprimé de chaque salon (mémoire seulement). */
export const snipes = new SnipeStore();
/** Salons en cours de recréation : un double clic ne crée pas deux copies. */
export const nuking = new Set<string>();

export const NUKE_PREFIX = "nuk";

export type ManagedChannel = TextChannel | NewsChannel;

/** Salons que Discord réserve (règles, mises à jour de la communauté, alertes, messages système, widget) : jamais recréés. */
export function isProtectedChannel(guild: Pick<Guild, "rulesChannelId" | "publicUpdatesChannelId" | "safetyAlertsChannelId" | "systemChannelId" | "widgetChannelId">, channelId: string) {
  return [guild.rulesChannelId, guild.publicUpdatesChannelId, guild.safetyAlertsChannelId, guild.systemChannelId, guild.widgetChannelId].includes(channelId);
}

/** Salon textuel dont le bot peut gérer les réglages et les permissions. */
export function manageableChannel(guild: Guild, channel: GuildBasedChannel | null | undefined): ManagedChannel {
  if (channel?.type !== ChannelType.GuildText && channel?.type !== ChannelType.GuildAnnouncement) throw new UserError("Choisissez un salon textuel.");
  const me = guild.members.me;
  // Modifier les permissions d'un salon demande aussi « Gérer les permissions » (Gérer les rôles) sur ce salon.
  if (!me || !channel.permissionsFor(me).has([PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles])) {
    throw new UserError(`Le bot doit pouvoir gérer le salon ${channel} et ses permissions.`);
  }
  return channel;
}

export const LOCK_MESSAGES = {
  lock: "🔒 Salon verrouillé par l'équipe.",
  unlock: "🔓 Salon déverrouillé : l'écriture pour @everyone suit de nouveau la catégorie.",
  hide: "👁️ Salon caché à @everyone : seuls les rôles qui ont une autorisation propre à ce salon (et les administrateurs) le voient.",
  unhide: "👁️ Salon de nouveau visible.",
} as const;

/**
 * Verrouiller (écriture) ou cacher (lecture) un salon pour @everyone ; `null` rend la main aux permissions de la catégorie.
 * Un verrouillage est annoncé dans le salon.
 */
export async function setEveryone(settings: GuildSettings, channel: ManagedChannel, permission: "SendMessages" | "ViewChannel", allow: false | null, reason: string, message: string) {
  const guild = channel.guild;
  // Cacher un salon à @everyone le cache aussi au bot s'il n'a pas d'autorisation propre : il la reçoit d'abord, pour pouvoir le rendre visible ensuite.
  if (permission === "ViewChannel" && allow === false && guild.members.me) {
    await channel.permissionOverwrites.edit(guild.members.me, { ViewChannel: true, ManageChannels: true, ManageRoles: true }, { reason: "Le bot garde l'accès au salon caché" });
  }
  const overwrite = permission === "SendMessages" ? { SendMessages: allow, SendMessagesInThreads: allow, CreatePublicThreads: allow, AddReactions: allow } : { ViewChannel: allow };
  await channel.permissionOverwrites.edit(guild.roles.everyone, overwrite, { reason: reason.slice(0, 512) });
  if (permission === "SendMessages") await channel.send({ embeds: [notice(settings, message)] }).catch(() => {});
}

/** Supprime les derniers messages (récents, non épinglés, d'un membre si précisé). Renvoie le nombre supprimé. */
export async function clearMessages(channel: ManagedChannel, count: number, authorId?: string, skipId?: string): Promise<number> {
  const me = channel.guild.members.me;
  if (!me || !channel.permissionsFor(me).has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages])) {
    throw new UserError("Le bot doit pouvoir lire l'historique et gérer les messages de ce salon.");
  }
  const fetched = await channel.messages.fetch({ limit: 100 });
  const targets = deletable([...fetched.values()].filter(message => message.id !== skipId), count, authorId);
  if (targets.length === 0) throw new UserError("Aucun message récent à supprimer (Discord n'efface en masse que les messages de moins de 14 jours).");
  return (await channel.bulkDelete(targets, true)).size;
}

/** État du salon pour @everyone, lu dans ses permissions propres. */
export function channelState(channel: Pick<ManagedChannel, "guild" | "permissionOverwrites" | "rateLimitPerUser">) {
  const everyone = channel.permissionOverwrites.cache.get(channel.guild.roles.everyone.id);
  return {
    locked: Boolean(everyone?.deny.has(PermissionFlagsBits.SendMessages)),
    hidden: Boolean(everyone?.deny.has(PermissionFlagsBits.ViewChannel)),
    slowmode: channel.rateLimitPerUser ?? 0,
  };
}

export function snipeEmbed(settings: GuildSettings, item: Sniped) {
  const result = embed(settings, "bronze")
    .setAuthor({ name: item.authorTag, iconURL: item.avatarUrl })
    .setDescription(item.content.slice(0, 4000) || "*Sans texte*")
    .setFooter({ text: "Supprimé" })
    .setTimestamp(item.deletedAt);
  if (item.attachments.length) result.addFields({ name: "Pièces jointes", value: item.attachments.join("\n").slice(0, 1024) });
  return result;
}

/** Demande de confirmation avant de recréer un salon. */
export function nukeConfirmation(channel: ManagedChannel, userId: string): Payload {
  return {
    content:
      `${ICON.attention} **Recréer ${channel} ?** Tous ses messages seront perdus définitivement ; ses réglages et permissions sont gardés.\n` +
      "Le nouveau salon aura un autre identifiant : s'il sert au bot (logs, bienvenue, statut, compteurs, tickets…), choisissez-le de nouveau dans le panneau concerné.",
    components: [
      row(
        button(customId(NUKE_PREFIX, userId, "ok", channel.id), "Recréer le salon", { emoji: "💥", style: ButtonStyle.Danger }),
        button(customId(NUKE_PREFIX, userId, "annuler"), "Annuler", { emoji: ICON.annuler, style: ButtonStyle.Secondary }),
      ),
    ],
  };
}
