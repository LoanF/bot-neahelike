import { AttachmentBuilder, AuditLogEvent, Events, type Client, type EmbedBuilder, type Guild, type GuildAuditLogsEntry } from "discord.js";
import { getSettings } from "@/config/store";
import { isModuleEnabled } from "@/core/access";
import { hexToInt } from "@/core/args";
import { env } from "@/env";
import { logger } from "@/logger";
import {
  boosted,
  memberJoined,
  memberLeft,
  memberRolesChanged,
  messageDeleted,
  messageEdited,
  messagesPurged,
  nicknameChanged,
  purgeTranscript,
  sanction,
  serverChange,
  voiceMoved,
  type Change,
} from "./format";
import { logSettings, MODULE } from "./settings";
import type { LogTypeId } from "./types";

type Build = (color: number) => EmbedBuilder | { embed: EmbedBuilder; files: AttachmentBuilder[] } | null;

/** Publie un log dans le salon choisi pour son type ; rien si le type est désactivé. Un échec est journalisé sans bloquer le bot. */
export async function sendLog(guild: Guild, type: LogTypeId, build: Build) {
  try {
    const settings = await getSettings(guild.id);
    if (!isModuleEnabled(settings, MODULE)) return;
    const channelId = logSettings(settings).salons[type];
    if (!channelId) return;
    const built = build(hexToInt(settings.config.embed_color));
    if (!built) return;
    const channel = guild.channels.cache.get(channelId) ?? (await guild.channels.fetch(channelId).catch(() => null));
    if (!channel?.isSendable()) {
      logger.warn({ type, channel: channelId }, "Salon de logs introuvable ou inaccessible");
      return;
    }
    const payload = "embed" in built ? { embeds: [built.embed], files: built.files } : { embeds: [built] };
    await channel.send({ ...payload, allowedMentions: { parse: [] } });
  } catch (error) {
    logger.error({ err: error, type }, "Envoi d'un log impossible");
  }
}

/** Les messages des salons de logs eux-mêmes ne sont jamais journalisés (pas de boucle). */
async function isLogChannel(guildId: string, channelId: string) {
  const salons = logSettings(await getSettings(guildId)).salons;
  return Object.values(salons).includes(channelId);
}

const tagOf = (target: unknown) => (target && typeof target === "object" && "tag" in target && typeof target.tag === "string" ? target.tag : null);
const changeOf = (entry: GuildAuditLogsEntry, key: string) => entry.changes.find(change => change.key === key);
const nameOf = (entry: GuildAuditLogsEntry) => {
  const change = changeOf(entry, "name");
  const name = (change?.new ?? change?.old) as string | undefined;
  return name ? `« ${name} »` : null;
};
const idsOf = (entry: GuildAuditLogsEntry, key: "$add" | "$remove") =>
  entry.changes.filter(change => change.key === key).flatMap(change => ((change.new ?? []) as { id: string }[]).map(role => role.id));

/** Modération et changements du serveur, à partir du journal d'audit (auteur et raison fournis par Discord). */
function onAuditEntry(entry: GuildAuditLogsEntry, guild: Guild) {
  const { executorId, targetId, reason } = entry;
  const changes = entry.changes as Change[];
  const target = { targetId: targetId ?? "0", targetTag: tagOf(entry.target), executorId, reason };

  switch (entry.action) {
    case AuditLogEvent.MemberBanAdd:
      return sendLog(guild, "bannissement", color => sanction(color, "bannissement", "Membre banni", target));
    case AuditLogEvent.MemberBanRemove:
      return sendLog(guild, "bannissement", color => sanction(color, "bannissement", "Bannissement levé", target));
    case AuditLogEvent.MemberKick:
      return sendLog(guild, "expulsion", color => sanction(color, "expulsion", "Membre expulsé", target));
    case AuditLogEvent.MemberUpdate: {
      const timeout = changeOf(entry, "communication_disabled_until");
      if (timeout) {
        const until = timeout.new ? new Date(timeout.new as string) : null;
        void sendLog(guild, "exclusion", color => sanction(color, "exclusion", until ? "Exclusion temporaire" : "Exclusion levée", { ...target, until }));
      }
      const nick = changeOf(entry, "nick");
      if (nick && targetId) {
        void sendLog(guild, "pseudo", color => nicknameChanged(color, { id: targetId, before: nick.old as string | null, after: nick.new as string | null, executorId }));
      }
      return;
    }
    case AuditLogEvent.MemberRoleUpdate:
      if (!targetId) return;
      return sendLog(guild, "roles-membre", color => memberRolesChanged(color, { id: targetId, added: idsOf(entry, "$add"), removed: idsOf(entry, "$remove"), executorId }));

    case AuditLogEvent.ChannelCreate:
      return sendLog(guild, "salons", color => serverChange(color, "salons", "Salon créé", { subject: `<#${targetId}> ${nameOf(entry) ?? ""}`, executorId, reason }));
    case AuditLogEvent.ChannelDelete:
      return sendLog(guild, "salons", color => serverChange(color, "salons", "Salon supprimé", { subject: nameOf(entry) ?? "Salon inconnu", executorId, reason }));
    case AuditLogEvent.ChannelUpdate:
      return sendLog(guild, "salons", color => serverChange(color, "salons", "Salon modifié", { subject: `<#${targetId}>`, executorId, changes, reason }));
    case AuditLogEvent.ChannelOverwriteCreate:
    case AuditLogEvent.ChannelOverwriteUpdate:
    case AuditLogEvent.ChannelOverwriteDelete:
      return sendLog(guild, "salons", color => serverChange(color, "salons", "Permissions d'un salon modifiées", { subject: `<#${targetId}>`, executorId, reason }));

    case AuditLogEvent.RoleCreate:
      return sendLog(guild, "roles", color => serverChange(color, "roles", "Rôle créé", { subject: `<@&${targetId}> ${nameOf(entry) ?? ""}`, executorId, reason }));
    case AuditLogEvent.RoleDelete:
      return sendLog(guild, "roles", color => serverChange(color, "roles", "Rôle supprimé", { subject: nameOf(entry) ?? "Rôle inconnu", executorId, reason }));
    case AuditLogEvent.RoleUpdate:
      return sendLog(guild, "roles", color => serverChange(color, "roles", "Rôle modifié", { subject: `<@&${targetId}>`, executorId, changes, reason }));

    case AuditLogEvent.InviteCreate:
    case AuditLogEvent.InviteDelete: {
      const code = (changeOf(entry, "code")?.new ?? changeOf(entry, "code")?.old) as string | undefined;
      const created = entry.action === AuditLogEvent.InviteCreate;
      return sendLog(guild, "invitations", color =>
        serverChange(color, "invitations", created ? "Invitation créée" : "Invitation supprimée", {
          subject: code ? `discord.gg/${code}` : "Invitation",
          executorId,
          changes: created ? changes.filter(change => change.key !== "code") : undefined,
        }),
      );
    }

    case AuditLogEvent.ThreadCreate:
      return sendLog(guild, "fils", color => serverChange(color, "fils", "Fil créé", { subject: `<#${targetId}> ${nameOf(entry) ?? ""}`, executorId }));
    case AuditLogEvent.ThreadDelete:
      return sendLog(guild, "fils", color => serverChange(color, "fils", "Fil supprimé", { subject: nameOf(entry) ?? "Fil inconnu", executorId }));
  }
}

export function setupLogs(client: Client) {
  const guildId = env().DISCORD_GUILD_ID;

  client.on(Events.GuildAuditLogEntryCreate, (entry, guild) => {
    if (guild.id === guildId) void onAuditEntry(entry, guild);
  });

  // Messages
  client.on(Events.MessageDelete, async message => {
    if (!message.inGuild() || message.guildId !== guildId || message.author?.id === client.user?.id) return;
    if (await isLogChannel(message.guildId, message.channelId)) return;
    void sendLog(message.guild, "message-supprime", color =>
      messageDeleted(color, {
        authorId: message.author?.id,
        authorTag: message.author?.tag,
        channelId: message.channelId,
        content: message.partial ? null : message.content,
        attachments: message.attachments.map(attachment => attachment.name),
      }),
    );
  });

  client.on(Events.MessageUpdate, async (before, after) => {
    if (!after.inGuild() || after.guildId !== guildId) return;
    const current = after.partial ? await after.fetch().catch(() => null) : after;
    if (!current || current.author.bot) return;
    // Discord renvoie aussi une mise à jour quand un lien se déploie : seule une vraie modification du texte compte.
    if (!current.editedTimestamp) return;
    if (!before.partial && before.content === current.content) return;
    if (await isLogChannel(guildId, current.channelId)) return;
    void sendLog(current.guild, "message-modifie", color =>
      messageEdited(color, {
        authorId: current.author.id,
        authorTag: current.author.tag,
        channelId: current.channelId,
        before: before.partial ? null : before.content,
        after: current.content,
        url: current.url,
      }),
    );
  });

  client.on(Events.MessageBulkDelete, async (messages, channel) => {
    if (channel.guildId !== guildId || (await isLogChannel(guildId, channel.id))) return;
    const known = messages.filter(message => !message.partial).map(message => ({
      createdAt: message.createdAt,
      authorTag: message.author?.tag ?? "inconnu",
      content: message.content ?? "",
    }));
    void sendLog(channel.guild, "messages-purges", color => {
      const embed = messagesPurged(color, { channelId: channel.id, count: messages.size, saved: known.length });
      if (known.length === 0) return embed;
      return { embed, files: [new AttachmentBuilder(Buffer.from(purgeTranscript(known), "utf8"), { name: "messages-supprimes.txt" })] };
    });
  });

  // Membres
  client.on(Events.GuildMemberAdd, member => {
    if (member.guild.id !== guildId) return;
    void sendLog(member.guild, "arrivee", color =>
      memberJoined(color, {
        id: member.id,
        tag: member.user.tag,
        createdAt: member.user.createdAt,
        memberCount: member.guild.memberCount,
        avatarUrl: member.displayAvatarURL(),
      }),
    );
  });

  client.on(Events.GuildMemberRemove, member => {
    if (member.guild.id !== guildId) return;
    void sendLog(member.guild, "depart", color =>
      memberLeft(color, {
        id: member.id,
        tag: member.user?.tag,
        joinedAt: member.joinedAt,
        roleIds: member.roles.cache.filter(role => role.id !== member.guild.id).map(role => role.id),
        memberCount: member.guild.memberCount,
      }),
    );
  });

  client.on(Events.GuildMemberUpdate, (before, after) => {
    if (after.guild.id !== guildId || before.partial || before.premiumSince || !after.premiumSince) return;
    void sendLog(after.guild, "boost", color => boosted(color, { id: after.id, boosts: after.guild.premiumSubscriptionCount ?? 0 }));
  });

  // Vocal
  client.on(Events.VoiceStateUpdate, (before, after) => {
    if (after.guild.id !== guildId || before.channelId === after.channelId) return;
    void sendLog(after.guild, "vocal", color => voiceMoved(color, { id: after.id, from: before.channelId, to: after.channelId }));
  });
}
