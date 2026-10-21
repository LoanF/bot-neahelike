import { isUniqueViolation, UserError } from "@/core/errors";
import { sql, type Tables } from "@/db";

export type Ticket = Tables<"bot_tickets">;
export type Answer = { question: string; answer: string };

/** Index qui garantit un seul ticket ouvert par membre et par catégorie. */
const ONE_OPEN_PER_CATEGORY = "bot_tickets_un_ouvert_par_categorie";

function isOpenConflict(error: unknown) {
  return isUniqueViolation(error) && (error as { constraint_name?: string }).constraint_name === ONE_OPEN_PER_CATEGORY;
}

export async function openTicket(data: { guildId: string; channelId: string; categoryId: string; categoryLabel: string; openerId: string; answers: Answer[] }): Promise<Ticket> {
  try {
    const [ticket] = await sql()<Ticket[]>`
      insert into bot_tickets (guild_id, channel_id, category_id, category_label, opener_id, answers)
      values (${data.guildId}, ${data.channelId}, ${data.categoryId}, ${data.categoryLabel}, ${data.openerId}, ${sql().json(data.answers)})
      returning *
    `;
    return ticket!;
  } catch (error) {
    if (isOpenConflict(error)) throw new UserError("Tu as déjà un ticket ouvert dans cette catégorie.");
    throw error;
  }
}

export async function findOpenTicket(guildId: string, openerId: string, categoryId: string): Promise<Ticket | undefined> {
  const [ticket] = await sql()<Ticket[]>`
    select * from bot_tickets where guild_id = ${guildId} and opener_id = ${openerId} and category_id = ${categoryId} and status = 'ouvert'
  `;
  return ticket;
}

export async function ticketByChannel(channelId: string): Promise<Ticket | undefined> {
  const [ticket] = await sql()<Ticket[]>`select * from bot_tickets where channel_id = ${channelId}`;
  return ticket;
}

export async function claimTicket(id: string, staffId: string): Promise<Ticket | undefined> {
  const [ticket] = await sql()<Ticket[]>`
    update bot_tickets set claimed_by_id = ${staffId}, last_activity_at = now() where id = ${id} and status = 'ouvert' returning *
  `;
  return ticket;
}

/** Ferme un ticket ouvert ; `undefined` s'il était déjà fermé (double clic, fermeture automatique simultanée). */
export async function closeTicket(id: string, data: { closedById: string; reason: string | null; transcript: string }): Promise<Ticket | undefined> {
  const [ticket] = await sql()<Ticket[]>`
    update bot_tickets set
      status = 'ferme',
      closed_by_id = ${data.closedById},
      close_reason = ${data.reason},
      transcript = ${data.transcript},
      closed_at = now()
    where id = ${id} and status = 'ouvert'
    returning *
  `;
  return ticket;
}

export async function reopenTicket(id: string): Promise<Ticket | undefined> {
  try {
    const [ticket] = await sql()<Ticket[]>`
      update bot_tickets set status = 'ouvert', closed_by_id = null, close_reason = null, closed_at = null, rating = null, last_activity_at = now()
      where id = ${id} and status = 'ferme'
      returning *
    `;
    return ticket;
  } catch (error) {
    if (isOpenConflict(error)) throw new UserError("Ce membre a déjà un autre ticket ouvert dans cette catégorie : ferme-le d'abord.");
    throw error;
  }
}

/** Enregistre la note du membre, une seule fois par fermeture. */
export async function rateTicket(id: string, openerId: string, rating: number): Promise<Ticket | undefined> {
  const [ticket] = await sql()<Ticket[]>`
    update bot_tickets set rating = ${rating}
    where id = ${id} and opener_id = ${openerId} and status = 'ferme' and rating is null
    returning *
  `;
  return ticket;
}

export async function touchTicket(channelId: string) {
  await sql()`update bot_tickets set last_activity_at = now() where channel_id = ${channelId} and status = 'ouvert'`;
}

export async function inactiveTickets(guildId: string, days: number): Promise<Ticket[]> {
  return sql()<Ticket[]>`
    select * from bot_tickets
    where guild_id = ${guildId} and status = 'ouvert' and last_activity_at < now() - make_interval(days => ${days})
  `;
}

export async function openTicketChannels(guildId: string): Promise<string[]> {
  const rows = await sql()<{ channel_id: string }[]>`select channel_id from bot_tickets where guild_id = ${guildId} and status = 'ouvert'`;
  return rows.map(row => row.channel_id);
}
