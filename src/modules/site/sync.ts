import type { Guild, GuildMember } from "discord.js";
import { sql } from "@/db";
import { env } from "@/env";
import { rankFromRoles, type Rank } from "./ranks";

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

function rankOf(member: MemberSnapshot | null): Rank {
  const { DISCORD_ROLE_STAFF, DISCORD_ROLE_RECRUTEUR } = env();
  return member ? rankFromRoles(member.roles, { staff: DISCORD_ROLE_STAFF, recruteur: DISCORD_ROLE_RECRUTEUR }) : "joueur";
}

export interface SyncResult {
  rank: Rank;
  inGuild: boolean;
  /** Rang précédent, si le rang a changé. */
  previousRank?: Rank;
  /** Présence sur le serveur, si elle a changé. */
  presence?: "rejoint" | "quitte";
}

/**
 * Met à jour rang et présence d'un compte lié au site, comme `syncMember` du site,
 * et journalise les changements (`rang.change`, `discord.rejoint`, `discord.quitte`).
 * `member` null : absent du serveur, donc rang joueur. Sans compte sur le site, rien n'est créé.
 */
export async function syncUser(userId: string, member: MemberSnapshot | null): Promise<SyncResult | null> {
  const rank = rankOf(member);
  const inGuild = member !== null;

  return sql().begin(async tx => {
    // Verrou : un sync simultané du site attend, et l'événement n'est écrit qu'une fois.
    const [previous] = await tx<{ rank: Rank; in_guild: boolean }[]>`select rank, in_guild from users where id = ${userId} for update`;
    if (!previous) return null;

    await tx`
      update users set
        rank = ${rank}::rank,
        in_guild = ${inGuild},
        roles_synced_at = now(),
        updated_at = now()
        ${member ? tx`, username = ${member.username}, global_name = ${member.globalName}, avatar = ${member.avatar}` : tx``}
      where id = ${userId}
    `;

    const result: SyncResult = { rank, inGuild };
    if (previous.rank !== rank) {
      result.previousRank = previous.rank;
      await tx`
        insert into events (type, subject_id, actor_id, data)
        values ('rang.change', ${userId}, ${userId}, ${tx.json({ avant: previous.rank, apres: rank })})
      `;
    }
    if (previous.in_guild !== inGuild) {
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

/** Resynchronisation complète : tous les comptes du site comparés aux membres du serveur ; seuls les écarts sont écrits. */
export async function resyncGuild(guild: Guild): Promise<ResyncReport> {
  const members = await guild.members.fetch();
  const accounts = await sql()<{ id: string; rank: Rank; in_guild: boolean }[]>`select id, rank, in_guild from users`;

  const updated: ResyncReport["updated"] = [];
  for (const account of accounts) {
    const member = members.get(account.id);
    const current = member ? snapshot(member) : null;
    if (rankOf(current) === account.rank && (current !== null) === account.in_guild) continue;
    const result = await syncUser(account.id, current);
    if (result) updated.push({ userId: account.id, result });
  }

  // Tous les comptes viennent d'être vérifiés : le site peut se fier à ces valeurs sans relire Discord.
  if (accounts.length > 0) {
    await sql()`update users set roles_synced_at = now() where id = any(${accounts.map(account => account.id)})`;
  }
  return { members: members.size, accounts: accounts.length, updated };
}
