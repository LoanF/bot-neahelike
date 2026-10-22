import { sql } from "@/db";
import type { SanctionType } from "./logic";

/** Ligne de `bot_sanctions` (table créée par le site, voir docs/schema-site.md, étape 5). */
export interface Sanction {
  id: string;
  number: number;
  guild_id: string;
  user_id: string;
  moderator_id: string;
  type: SanctionType;
  reason: string;
  ends_at: string | null;
  created_at: string;
  revoked_at: string | null;
  revoked_by_id: string | null;
  revoke_reason: string | null;
}

export async function addSanction(input: { guildId: string; userId: string; moderatorId: string; type: SanctionType; reason: string; endsAt?: Date | null }): Promise<Sanction> {
  const [sanction] = await sql()<Sanction[]>`
    insert into bot_sanctions (guild_id, user_id, moderator_id, type, reason, ends_at)
    values (${input.guildId}, ${input.userId}, ${input.moderatorId}, ${input.type}, ${input.reason}, ${input.endsAt?.toISOString() ?? null})
    returning *
  `;
  return sanction!;
}

/** Casier d'un membre, du plus récent au plus ancien. */
export async function sanctionsOf(guildId: string, userId: string, limit = 25): Promise<Sanction[]> {
  return sql()<Sanction[]>`
    select * from bot_sanctions where guild_id = ${guildId} and user_id = ${userId} order by created_at desc limit ${limit}
  `;
}

export async function countSanctions(guildId: string, userId: string): Promise<Record<SanctionType, number>> {
  const rows = await sql()<{ type: SanctionType; count: number }[]>`
    select type, count(*)::int as count from bot_sanctions where guild_id = ${guildId} and user_id = ${userId} and revoked_at is null group by type
  `;
  const counts: Record<SanctionType, number> = { avertissement: 0, exclusion: 0, expulsion: 0, bannissement: 0 };
  for (const row of rows) counts[row.type] = row.count;
  return counts;
}

export async function sanctionByNumber(guildId: string, number: number): Promise<Sanction | undefined> {
  const [sanction] = await sql()<Sanction[]>`select * from bot_sanctions where guild_id = ${guildId} and number = ${number}`;
  return sanction;
}

/** Lève une sanction ; une seule fois. */
export async function revokeSanction(id: string, byId: string, reason: string): Promise<Sanction | undefined> {
  const [sanction] = await sql()<Sanction[]>`
    update bot_sanctions set revoked_at = now(), revoked_by_id = ${byId}, revoke_reason = ${reason}
    where id = ${id} and revoked_at is null returning *
  `;
  return sanction;
}

/** Lève les sanctions encore en cours d'un type (débannissement, fin d'exclusion anticipée). */
export async function revokeActive(guildId: string, userId: string, type: "bannissement" | "exclusion", byId: string, reason: string): Promise<number> {
  const rows = await sql()`
    update bot_sanctions set revoked_at = now(), revoked_by_id = ${byId}, revoke_reason = ${reason}
    where guild_id = ${guildId} and user_id = ${userId} and type = ${type} and revoked_at is null and (ends_at is null or ends_at > now())
  `;
  return rows.count;
}

/** Bannissements temporaires arrivés à échéance et pas encore levés. */
export async function dueTempBans(guildId: string): Promise<Sanction[]> {
  return sql()<Sanction[]>`
    select * from bot_sanctions
    where guild_id = ${guildId} and type = 'bannissement' and revoked_at is null and ends_at is not null and ends_at <= now()
    order by ends_at limit 25
  `;
}
