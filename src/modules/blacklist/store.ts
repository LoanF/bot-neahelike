import { sql, type Tables } from "@/db";
import { PAGE_SIZE } from "./logic";

/** Ligne de `blacklist` (table partagée, créée par les migrations du site). La table fait foi. */
export type BlacklistEntry = Tables<"blacklist">;

/** Inscrit l'ID ; `null` s'il est déjà blacklisté. */
export async function addToBlacklist(input: { discordId: string; reason: string | null; createdById: string }): Promise<BlacklistEntry | null> {
  const [created] = await sql()<BlacklistEntry[]>`
    insert into blacklist (discord_id, reason, created_by_id, source)
    values (${input.discordId}, ${input.reason}, ${input.createdById}, 'bot')
    on conflict do nothing
    returning *
  `;
  return created ?? null;
}

/** Retire l'ID ; `null` s'il n'était pas (ou plus) blacklisté. */
export async function removeFromBlacklist(discordId: string): Promise<BlacklistEntry | null> {
  const [removed] = await sql()<BlacklistEntry[]>`delete from blacklist where discord_id = ${discordId} returning *`;
  return removed ?? null;
}

export async function blacklistEntry(discordId: string): Promise<BlacklistEntry | undefined> {
  const [entry] = await sql()<BlacklistEntry[]>`select * from blacklist where discord_id = ${discordId}`;
  return entry;
}

export interface BlacklistListEntry extends BlacklistEntry {
  /** Nom du compte du site, s'il existe. */
  name: string | null;
}

/** Une page de la liste, la plus récente d'abord, avec le nom du compte du site quand il existe. */
export async function blacklistPage(page: number): Promise<{ entries: BlacklistListEntry[]; total: number }> {
  const [count] = await sql()<{ total: number }[]>`select count(*)::int as total from blacklist`;
  const entries = await sql()<BlacklistListEntry[]>`
    select b.*, coalesce(u.global_name, u.username) as name
    from blacklist b left join users u on u.id = b.discord_id
    order by b.created_at desc, b.discord_id
    limit ${PAGE_SIZE} offset ${page * PAGE_SIZE}
  `;
  return { entries, total: count?.total ?? 0 };
}

/** Rang du compte sur le site (`null` sans compte). Le bot le lit seulement : c'est le site qui l'écrit. */
export async function siteRank(discordId: string): Promise<Tables<"users">["rank"] | null> {
  const [user] = await sql()<Pick<Tables<"users">, "rank">[]>`select rank from users where id = ${discordId}`;
  return user?.rank ?? null;
}

/**
 * Événement du journal du site (`compte.blacklist`, `compte.blacklist_levee`).
 * `events` pointe vers `users` : sans compte sur le site (ID saisi à la main), rien n'est écrit.
 */
export async function logBlacklistEvent(type: "compte.blacklist" | "compte.blacklist_levee", subjectId: string, actorId: string, reason: string | null) {
  await sql()`
    insert into events (type, subject_id, actor_id, data)
    select ${type}, ${subjectId}, a.id, ${sql().json(reason ? { raison: reason } : {})}
    from users s left join users a on a.id = ${actorId}
    where s.id = ${subjectId}
  `;
}
