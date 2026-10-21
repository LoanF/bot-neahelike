import { Events, type Client, type Guild } from "discord.js";
import { embed } from "@/core/embeds";
import { env } from "@/env";
import { logger } from "@/logger";
import { staffLog } from "./staff-log";
import { resyncGuild, snapshot, syncUser, type MemberSnapshot, type SyncResult } from "./sync";

const RANK_LABELS = { joueur: "Joueur", recruteur: "Recruteur", staff: "Staff" } as const;

async function report(guild: Guild, userId: string, result: SyncResult) {
  if (result.previousRank) {
    logger.info({ user: userId, avant: result.previousRank, apres: result.rank }, "Rang du site modifié");
    await staffLog(guild, settings =>
      embed(settings, "bronze")
        .setTitle("Rang du site modifié")
        .setDescription(`<@${userId}> : ${RANK_LABELS[result.previousRank!]} → **${RANK_LABELS[result.rank]}**`)
        .setTimestamp(),
    );
  }
  if (result.presence) logger.info({ user: userId, presence: result.presence }, "Présence sur le serveur modifiée");
}

async function sync(guild: Guild, userId: string, member: MemberSnapshot | null) {
  try {
    const result = await syncUser(userId, member);
    if (result) await report(guild, userId, result);
  } catch (error) {
    logger.error({ err: error, user: userId }, "Synchronisation du membre impossible");
  }
}

/** Resynchronisation complète, journalisée. */
export async function resync(guild: Guild) {
  const started = Date.now();
  const result = await resyncGuild(guild);
  for (const { userId, result: change } of result.updated) await report(guild, userId, change);
  logger.info(
    { membres: result.members, comptes: result.accounts, corriges: result.updated.length, duree: Date.now() - started },
    "Rangs et présence resynchronisés",
  );
  return result;
}

/**
 * Le site tire ses permissions des rôles Discord : chaque changement est répercuté aussitôt sur `users`.
 * Aucun rôle n'est donné ici : le site attribue lui-même les rôles du parcours.
 */
export function setupMemberSync(client: Client) {
  const guildId = env().DISCORD_GUILD_ID;

  client.on(Events.GuildMemberUpdate, (before, after) => {
    if (after.guild.id !== guildId) return;
    // Seuls les rôles déterminent le rang ; le profil (pseudo, avatar) suit lors du prochain changement ou de la connexion au site.
    if (!before.partial && before.roles.cache.equals(after.roles.cache)) return;
    void sync(after.guild, after.id, snapshot(after));
  });

  client.on(Events.GuildMemberAdd, member => {
    if (member.guild.id === guildId) void sync(member.guild, member.id, snapshot(member));
  });

  client.on(Events.GuildMemberRemove, member => {
    if (member.guild.id === guildId) void sync(member.guild, member.id, null);
  });

  // Nouvelle session passerelle après une coupure : les événements manqués sont rattrapés par une resynchronisation complète.
  let firstSession = true;
  client.on(Events.ShardReady, () => {
    if (firstSession) {
      firstSession = false;
      return;
    }
    const guild = client.guilds.cache.get(guildId);
    if (guild) resync(guild).catch(error => logger.error({ err: error }, "Resynchronisation après reconnexion impossible"));
  });
}
