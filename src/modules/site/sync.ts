import type { Guild, GuildMember } from "discord.js";
import { loadAllMembers } from "@/core/members";
import { sql } from "@/db";

export interface MemberSnapshot {
  id: string;
  roles: string[];
  username: string;
  globalName: string | null;
  avatar: string | null;
}

export function snapshot(member: GuildMember): MemberSnapshot {
  return {
    id: member.id,
    roles: [...member.roles.cache.keys()],
    username: member.user.username,
    globalName: member.user.globalName,
    avatar: member.user.avatar,
  };
}

export interface SyncResult {
  inGuild: boolean;
  /** Présence sur le serveur, si elle a changé. */
  presence?: "rejoint" | "quitte";
}

/**
 * Met à jour la présence et le profil d'un compte lié au site, et journalise `discord.rejoint` / `discord.quitte`
 * comme `syncMember` du site. Le rang n'est jamais écrit ici : le site le calcule seul (owners, rôles réglés sur le site).
 * `rolesChanged` (ou un départ) remet `roles_synced_at` à vide : le site relit le rang à la page suivante.
 * `member` null : absent du serveur. Sans compte sur le site, rien n'est créé.
 */
export async function syncUser(userId: string, member: MemberSnapshot | null, { rolesChanged = false } = {}): Promise<SyncResult | null> {
  const inGuild = member !== null;

  return sql().begin(async tx => {
    // Verrou : un sync simultané du site attend, et l'événement n'est écrit qu'une fois.
    const [previous] = await tx<{ in_guild: boolean }[]>`select in_guild from users where id = ${userId} for update`;
    if (!previous) return null;

    const presenceChanged = previous.in_guild !== inGuild;
    await tx`
      update users set
        in_guild = ${inGuild},
        updated_at = now()
        ${rolesChanged || presenceChanged ? tx`, roles_synced_at = null` : tx``}
        ${member ? tx`, username = ${member.username}, global_name = ${member.globalName}, avatar = ${member.avatar}` : tx``}
      where id = ${userId}
    `;

    const result: SyncResult = { inGuild };
    if (presenceChanged) {
      result.presence = inGuild ? "rejoint" : "quitte";
      await tx`
        insert into events (type, subject_id, actor_id)
        values (${inGuild ? "discord.rejoint" : "discord.quitte"}, ${userId}, ${userId})
      `;
    }
    return result;
  });
}

export interface ResyncReport {
  members: number;
  accounts: number;
  updated: { userId: string; result: SyncResult }[];
}

/**
 * Resynchronisation complète de la présence : tous les comptes du site comparés aux membres du serveur ;
 * seuls les écarts sont écrits. Les rangs sont relus par le site lui-même toutes les 5 minutes.
 */
export async function resyncGuild(guild: Guild, { refresh = false } = {}): Promise<ResyncReport> {
  const members = await loadAllMembers(guild, { refresh });
  const accounts = await sql()<{ id: string; in_guild: boolean }[]>`select id, in_guild from users`;

  const updated: ResyncReport["updated"] = [];
  for (const account of accounts) {
    const member = members.get(account.id);
    if (Boolean(member) === account.in_guild) continue;
    const result = await syncUser(account.id, member ? snapshot(member) : null);
    if (result) updated.push({ userId: account.id, result });
  }
  return { members: members.size, accounts: accounts.length, updated };
}
