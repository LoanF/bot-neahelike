import { Events, type Client, type Guild } from "discord.js";
import { env } from "@/env";
import { logger } from "@/logger";
import { resyncGuild, snapshot, syncUser, type MemberSnapshot, type SyncResult } from "./sync";

function report(userId: string, result: SyncResult) {
  if (result.presence) logger.info({ user: userId, presence: result.presence }, "Présence sur le serveur modifiée");
}

async function sync(userId: string, member: MemberSnapshot | null, rolesChanged = false) {
  try {
    const result = await syncUser(userId, member, { rolesChanged });
    if (result) report(userId, result);
  } catch (error) {
    logger.error({ err: error, user: userId }, "Synchronisation du membre impossible");
  }
}

/**
 * Resynchronisation complète, journalisée.
 * `refresh` : recharger la liste des membres (après une coupure, ou à la demande) plutôt que se fier au cache.
 */
export async function resync(guild: Guild, { refresh = false } = {}) {
  const started = Date.now();
  const result = await resyncGuild(guild, { refresh });
  for (const { userId, result: change } of result.updated) report(userId, change);
  logger.info(
    { membres: result.members, comptes: result.accounts, corriges: result.updated.length, duree: Date.now() - started },
    "Présence des comptes du site resynchronisée",
  );
  return result;
}

/**
 * Présence en temps réel sur `users` (arrivée, départ) ; un changement de rôles demande au site de relire le rang.
 * Aucun rôle n'est donné ici et aucun rang n'est écrit : le site s'en charge.
 */
export function setupMemberSync(client: Client) {
  const guildId = env().DISCORD_GUILD_ID;

  client.on(Events.GuildMemberUpdate, (before, after) => {
    if (after.guild.id !== guildId) return;
    // Rôles changés : le site relira le rang. Le profil (pseudo, avatar) suit au prochain changement ou à la connexion au site.
    if (!before.partial && before.roles.cache.equals(after.roles.cache)) return;
    void sync(after.id, snapshot(after), true);
  });

  client.on(Events.GuildMemberAdd, member => {
    if (member.guild.id === guildId) void sync(member.id, snapshot(member));
  });

  client.on(Events.GuildMemberRemove, member => {
    if (member.guild.id === guildId) void sync(member.id, null);
  });

  // Nouvelle session passerelle après une coupure : les événements manqués sont rattrapés par une resynchronisation complète.
  let firstSession = true;
  client.on(Events.ShardReady, () => {
    if (firstSession) {
      firstSession = false;
      return;
    }
    const guild = client.guilds.cache.get(guildId);
    if (guild) resync(guild, { refresh: true }).catch(error => logger.error({ err: error }, "Resynchronisation après reconnexion impossible"));
  });
}
