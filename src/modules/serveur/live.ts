import { ActivityType, ButtonBuilder, ButtonStyle, ChannelType, OverwriteType, PermissionFlagsBits, type Guild, type GuildMember, type Presence, type VoiceState } from "discord.js";
import { getSettings, type GuildSettings } from "@/config/store";
import { isModuleEnabled } from "@/core/access";
import type { Payload } from "@/core/context";
import { embed } from "@/core/embeds";
import { row } from "@/core/panels";
import { env } from "@/env";
import { logger } from "@/logger";
import { COUNTERS, counterName, MODULE, parseAddress, parseDynamic, saveServerSettings, serverSettings, supports, voiceName, type CounterId, type FivemStatus, type ServerSettings } from "./settings";

const FETCH_TIMEOUT_MS = 5000;

/** Dernier statut connu du serveur FiveM, partagé par le message de statut, le compteur et /statut. */
let lastStatus: (FivemStatus & { checkedAt: Date }) | null = null;

export function lastFivemStatus() {
  return lastStatus;
}

/** Interroge `dynamic.json` du serveur FiveM ; injoignable ou réponse invalide : hors ligne. */
export async function fetchFivem(address: string): Promise<FivemStatus> {
  const { host, port } = parseAddress(address);
  try {
    const response = await fetch(`http://${host}:${port}/dynamic.json`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!response.ok) return { online: false, players: 0, max: 0 };
    return parseDynamic(await response.json());
  } catch {
    return { online: false, players: 0, max: 0 };
  }
}

export async function refreshFivem(server: ServerSettings) {
  if (!server.fivemAdresse) {
    lastStatus = null;
    return null;
  }
  lastStatus = { ...(await fetchFivem(server.fivemAdresse)), checkedAt: new Date() };
  return lastStatus;
}

/** Statut du serveur FiveM : en ligne ou non, joueurs, lien de connexion. */
export function statusPayload(settings: GuildSettings, server: ServerSettings, status: (FivemStatus & { checkedAt: Date }) | null, guildName: string): Payload {
  const result = embed(settings, status?.online ? "or" : "bronze").setTitle(`🎮 ${status?.hostname ?? guildName}`);
  if (!server.fivemAdresse) result.setDescription("*Aucune adresse de serveur FiveM n'est réglée.*");
  else if (!status) result.setDescription("*Vérification en cours…*");
  else {
    result
      .setDescription(status.online ? "🟢 **En ligne**" : "🔴 **Hors ligne**")
      .addFields({ name: "Joueurs", value: status.online ? `${status.players} / ${status.max}` : "—", inline: true }, { name: "Vérifié", value: `<t:${Math.floor(status.checkedAt.getTime() / 1000)}:R>`, inline: true });
  }
  const components = server.fivemLien ? [row(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(server.fivemLien).setLabel("Se connecter").setEmoji("🎮"))] : [];
  return { embeds: [result], components };
}

async function fetchMessage(guild: Guild, ref: { channelId: string; messageId: string }) {
  const channel = guild.channels.cache.get(ref.channelId);
  return channel?.isTextBased() ? channel.messages.fetch(ref.messageId).catch(() => null) : null;
}

/** Met à jour le message de statut publié ; l'oublie s'il a été supprimé. */
export async function updateStatusMessage(guild: Guild, settings: GuildSettings, server: ServerSettings) {
  if (!server.statutMessage) return;
  const message = await fetchMessage(guild, server.statutMessage);
  if (!message) {
    await saveServerSettings(settings, { ...server, statutMessage: undefined });
    return;
  }
  await message.edit(statusPayload(settings, server, lastStatus, guild.name));
}

/** Valeur de chaque compteur. */
export function counterValues(guild: Guild): Record<CounterId, number> {
  const citizenRole = env().DISCORD_ROLE_HELIKEEN;
  return {
    membres: guild.memberCount,
    joueurs: lastStatus?.online ? lastStatus.players : 0,
    citoyens: citizenRole ? (guild.roles.cache.get(citizenRole)?.members.size ?? 0) : 0,
  };
}

/** Renomme les salons compteurs dont la valeur a changé (Discord limite à 2 renommages par salon et par 10 minutes). */
export async function updateCounters(guild: Guild, server: ServerSettings) {
  const values = counterValues(guild);
  for (const id of Object.keys(COUNTERS) as CounterId[]) {
    const counter = server.compteurs?.[id];
    if (!counter) continue;
    const channel = guild.channels.cache.get(counter.channelId);
    const name = counterName(counter.name, values[id]);
    if (!channel || channel.name === name || !("setName" in channel)) continue;
    await channel.setName(name, "Compteur").catch(error => logger.warn({ err: error, compteur: id }, "Renommage du compteur impossible"));
  }
}

// ─── Rôle soutien ───────────────────────────────────────────────────────────

function customStatus(presence: Presence | null | undefined) {
  return presence?.activities.find(activity => activity.type === ActivityType.Custom)?.state ?? null;
}

/** Donne ou retire le rôle soutien selon le tag de serveur et le statut du membre. */
export async function reconcileSupport(member: GuildMember, server: ServerSettings, presence: Presence | null = member.presence) {
  const roleId = server.soutienRoleId;
  if (!roleId || member.user.bot) return;
  const wanted = supports(server, { guildId: member.guild.id, primaryGuild: member.user.primaryGuild, customStatus: customStatus(presence) });
  const has = member.roles.cache.has(roleId);
  if (wanted === has) return;
  // Statut inconnu (membre hors ligne) : on ne retire pas un rôle obtenu par le texte du statut.
  if (!wanted && !presence && server.soutienTexte) return;
  await (wanted ? member.roles.add(roleId, "Soutien : tag ou statut du serveur") : member.roles.remove(roleId, "Soutien : tag ou statut retiré")).catch(error =>
    logger.warn({ err: error, user: member.id }, "Rôle soutien impossible à mettre à jour"),
  );
}

export async function reconcileAllSupport(guild: Guild, server: ServerSettings) {
  if (!server.soutienRoleId) return;
  for (const member of guild.members.cache.values()) await reconcileSupport(member, server);
}

// ─── Vocaux temporaires ─────────────────────────────────────────────────────

/** Crée le salon d'un membre qui rejoint le salon créateur et l'y déplace ; supprime les salons temporaires vidés. */
export async function handleVoice(before: VoiceState, after: VoiceState) {
  const guild = after.guild;
  const settings = await getSettings(guild.id);
  if (!isModuleEnabled(settings, MODULE)) return;
  const server = serverSettings(settings);
  const temporaries = new Set(server.vocalTemporaires ?? []);

  if (before.channelId && before.channelId !== after.channelId && temporaries.has(before.channelId) && before.channel?.members.size === 0) {
    await before.channel.delete("Salon vocal temporaire vide").catch(error => logger.warn({ err: error }, "Suppression du vocal temporaire impossible"));
    temporaries.delete(before.channelId);
    await saveServerSettings(settings, { ...server, vocalTemporaires: [...temporaries] });
  }

  const member = after.member;
  const creator = after.channel;
  if (!member || !creator || after.channelId !== server.vocalCreateurId || creator.type !== ChannelType.GuildVoice) return;
  const channel = await guild.channels.create({
    name: voiceName(server.vocalNom, { displayName: member.displayName, username: member.user.username }),
    type: ChannelType.GuildVoice,
    parent: creator.parentId,
    userLimit: server.vocalLimite ?? 0,
    // Le salon reprend les permissions de la catégorie ; son créateur peut le renommer, le limiter et déplacer les membres.
    permissionOverwrites: [
      ...(creator.parent?.permissionOverwrites.cache.values() ?? []),
      { id: member.id, type: OverwriteType.Member, allow: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers, PermissionFlagsBits.Connect] },
    ],
    reason: `Vocal temporaire de ${member.user.tag}`,
  });
  const fresh = serverSettings(await getSettings(guild.id));
  await saveServerSettings(settings, { ...fresh, vocalTemporaires: [...(fresh.vocalTemporaires ?? []), channel.id].slice(-200) });
  await member.voice.setChannel(channel).catch(async () => {
    // Le membre est parti entre-temps : le salon ne sert à rien.
    await channel.delete("Membre parti avant le déplacement").catch(() => {});
  });
}

/** Au démarrage : supprime les vocaux temporaires vides ou disparus pendant que le bot était éteint. */
export async function cleanTemporaries(guild: Guild, settings: GuildSettings) {
  const server = serverSettings(settings);
  const kept: string[] = [];
  for (const channelId of server.vocalTemporaires ?? []) {
    const channel = guild.channels.cache.get(channelId);
    if (!channel?.isVoiceBased()) continue;
    if (channel.members.size === 0) await channel.delete("Salon vocal temporaire vide").catch(() => kept.push(channelId));
    else kept.push(channelId);
  }
  if (kept.length !== (server.vocalTemporaires ?? []).length) await saveServerSettings(settings, { ...server, vocalTemporaires: kept });
}
