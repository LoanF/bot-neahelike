import { sql, type Enums, type Tables } from "@/db";

export type GiveawayStatus = Enums<"giveaway_status">;

/** Ligne de `bot_giveaways` (table créée par les migrations du site). */
export type Giveaway = Tables<"bot_giveaways">;

export async function createGiveaway(input: {
  guildId: string;
  channelId: string;
  prize: string;
  description: string | null;
  winnerCount: number;
  requiredRoleId: string | null;
  hostId: string;
  endsAt: Date;
}): Promise<Giveaway> {
  const [giveaway] = await sql()<Giveaway[]>`
    insert into bot_giveaways (guild_id, channel_id, prize, description, winner_count, required_role_id, host_id, ends_at)
    values (${input.guildId}, ${input.channelId}, ${input.prize}, ${input.description}, ${input.winnerCount}, ${input.requiredRoleId}, ${input.hostId}, ${input.endsAt.toISOString()})
    returning *
  `;
  return giveaway!;
}

export async function setGiveawayMessage(id: string, messageId: string) {
  await sql()`update bot_giveaways set message_id = ${messageId} where id = ${id}`;
}

/** Retire un giveaway dont le message n'a pas pu être publié. */
export async function dropGiveaway(id: string) {
  await sql()`delete from bot_giveaways where id = ${id} and message_id is null`;
}

export async function giveawayById(id: string): Promise<Giveaway | undefined> {
  const [giveaway] = await sql()<Giveaway[]>`select * from bot_giveaways where id = ${id}`;
  return giveaway;
}

export async function countEntries(id: string): Promise<number> {
  const [row] = await sql()<{ count: number }[]>`select count(*)::int as count from bot_giveaway_entries where giveaway_id = ${id}`;
  return row?.count ?? 0;
}

export async function entriesOf(id: string): Promise<string[]> {
  const rows = await sql()<{ user_id: string }[]>`select user_id from bot_giveaway_entries where giveaway_id = ${id}`;
  return rows.map(row => row.user_id);
}

/** Inscrit ou désinscrit un membre, seulement tant que le giveaway est en cours. `null` : giveaway terminé. */
export async function toggleEntry(id: string, userId: string): Promise<{ entered: boolean; count: number } | null> {
  return sql().begin(async tx => {
    // Verrou partagé : la clôture (update) attend la fin de l'inscription en cours.
    const [giveaway] = await tx<{ status: GiveawayStatus; ends_at: string }[]>`select status, ends_at from bot_giveaways where id = ${id} for share`;
    if (!giveaway || giveaway.status !== "en_cours" || new Date(giveaway.ends_at) <= new Date()) return null;
    const removed = await tx`delete from bot_giveaway_entries where giveaway_id = ${id} and user_id = ${userId}`;
    if (removed.count === 0) await tx`insert into bot_giveaway_entries (giveaway_id, user_id) values (${id}, ${userId}) on conflict do nothing`;
    const [row] = await tx<{ count: number }[]>`select count(*)::int as count from bot_giveaway_entries where giveaway_id = ${id}`;
    return { entered: removed.count === 0, count: row?.count ?? 0 };
  });
}

/** Giveaways publiés arrivés à échéance. */
export async function dueGiveaways(guildId: string): Promise<Giveaway[]> {
  return sql()<Giveaway[]>`
    select * from bot_giveaways
    where guild_id = ${guildId} and status = 'en_cours' and message_id is not null and ends_at <= now()
    order by ends_at limit 20
  `;
}

/** Clôt le giveaway avec ses gagnants ; une seule fois, même si deux tirages se croisent. */
export async function finishGiveaway(id: string, winnerIds: string[]): Promise<Giveaway | undefined> {
  const [giveaway] = await sql()<Giveaway[]>`
    update bot_giveaways set status = 'termine', winner_ids = ${winnerIds}, ended_at = now()
    where id = ${id} and status = 'en_cours' returning *
  `;
  return giveaway;
}

/** Nouveau tirage d'un giveaway terminé : remplace les gagnants. */
export async function setWinners(id: string, winnerIds: string[]): Promise<Giveaway | undefined> {
  const [giveaway] = await sql()<Giveaway[]>`update bot_giveaways set winner_ids = ${winnerIds} where id = ${id} and status = 'termine' returning *`;
  return giveaway;
}

export async function cancelGiveaway(id: string): Promise<Giveaway | undefined> {
  const [giveaway] = await sql()<Giveaway[]>`update bot_giveaways set status = 'annule', ended_at = now() where id = ${id} and status = 'en_cours' returning *`;
  return giveaway;
}

/** Giveaways du panneau : en cours, puis terminés ou annulés depuis moins de 7 jours. */
export async function recentGiveaways(guildId: string): Promise<Giveaway[]> {
  return sql()<Giveaway[]>`
    select * from bot_giveaways
    where guild_id = ${guildId} and message_id is not null
      and (status = 'en_cours' or ended_at > now() - interval '7 days')
    order by (status = 'en_cours') desc, coalesce(ended_at, ends_at) desc
    limit 25
  `;
}
