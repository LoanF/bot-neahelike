import type postgres from "postgres";
import { sql, type Tables } from "@/db";
import { PAGE_SIZE } from "./logic";

/** Ligne de `blacklist` (table partagée, créée par les migrations du site). La table fait foi. */
export type BlacklistEntry = Tables<"blacklist">;

/** Connexion ou transaction en cours. */
type Db = postgres.Sql | postgres.TransactionSql;

/** Inscrit l'ID ; `null` s'il est déjà blacklisté. */
export async function addToBlacklist(input: { discordId: string; reason: string | null; createdById: string }, db: Db = sql()): Promise<BlacklistEntry | null> {
  const [created] = await db<BlacklistEntry[]>`
    insert into blacklist (discord_id, reason, created_by_id, source)
    values (${input.discordId}, ${input.reason}, ${input.createdById}, 'bot')
    on conflict do nothing
    returning *
  `;
  return created ?? null;
}

/** Retire l'ID ; `null` s'il n'était pas (ou plus) blacklisté. */
export async function removeFromBlacklist(discordId: string, db: Db = sql()): Promise<BlacklistEntry | null> {
  const [removed] = await db<BlacklistEntry[]>`delete from blacklist where discord_id = ${discordId} returning *`;
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
export async function logBlacklistEvent(type: "compte.blacklist" | "compte.blacklist_levee", subjectId: string, actorId: string, reason: string | null, db: Db = sql()) {
  await db`
    insert into events (type, subject_id, actor_id, data)
    select ${type}, ${subjectId}, a.id, ${db.json(reason ? { raison: reason } : {})}
    from users s left join users a on a.id = ${actorId}
    where s.id = ${subjectId}
  `;
}

/**
 * Comme le site : une blacklist retire la whitelist de la dernière candidature si elle est encore active,
 * sinon une levée de blacklist rendrait une whitelist sans recandidater. L'auteur n'est noté que s'il a un compte.
 */
export async function revokeWhitelistForBlacklist(userId: string, actorId: string, db: Db = sql()): Promise<boolean> {
  const revoked = await db`
    update applications set
      whitelist_revoked_at = now(),
      whitelist_revoke_reason = 'Blacklist',
      whitelist_revoked_by_id = (select id from users where id = ${actorId})
    where id = (select id from applications where user_id = ${userId} order by created_at desc limit 1)
      and status = 'whitelistee' and whitelist_revoked_at is null
  `;
  return revoked.count > 0;
}

/**
 * Blacklist complète en une transaction : la ligne, le retrait de la whitelist et l'événement du site.
 * Tout ou rien : une ligne sans le reste ne pourrait plus être refaite (« déjà blacklisté »). `null` si déjà blacklisté.
 */
export async function recordBlacklist(input: { discordId: string; reason: string | null; createdById: string }): Promise<BlacklistEntry | null> {
  return sql().begin(async tx => {
    const entry = await addToBlacklist(input, tx);
    if (!entry) return null;
    await revokeWhitelistForBlacklist(input.discordId, input.createdById, tx);
    await logBlacklistEvent("compte.blacklist", input.discordId, input.createdById, input.reason, tx);
    return entry;
  }) as Promise<BlacklistEntry | null>;
}

/** Levée en une transaction : la ligne retirée et l'événement du site. `null` si la personne n'était pas blacklistée. */
export async function recordLift(discordId: string, actorId: string): Promise<BlacklistEntry | null> {
  return sql().begin(async tx => {
    const removed = await removeFromBlacklist(discordId, tx);
    if (removed) await logBlacklistEvent("compte.blacklist_levee", discordId, actorId, null, tx);
    return removed;
  }) as Promise<BlacklistEntry | null>;
}
