import { ButtonBuilder, ButtonStyle, type Guild } from "discord.js";
import { getSettings } from "@/config/store";
import { isModuleEnabled } from "@/core/access";
import { embed, type Tone } from "@/core/embeds";
import { row } from "@/core/panels";
import { sql, type Tables } from "@/db";
import { logger } from "@/logger";
import { profileUrl, RANK_LABELS } from "./fiche";
import { CRITERION_LABELS, label, labelList, STEP_LABELS } from "./labels";
import { MODULE, siteSettings, updateSiteSettings, type JournalCursor } from "./settings";
import { staffLog, type StaffLogResult } from "./staff-log";

/** Événements écrits par le site et relayés au staff : candidatures et changements de rang. */
export const RELAYED_EVENTS = [
  "candidature.envoyee",
  "candidature.validee",
  "candidature.modification",
  "candidature.refusee",
  "entretien.valide",
  "candidature.supprimee",
  "rang.change",
  "compte.blacklist",
  "compte.blacklist_levee",
] as const;

export type JournalEvent = Pick<Tables<"events">, "id" | "type" | "subject_id" | "actor_id" | "data" | "created_at">;

const POLL_INTERVAL = 20_000;
const BATCH = 50;
/** Fenêtre de rattrapage : un événement validé jusqu'à 2 minutes après un plus récent est encore relayé. */
const OVERLAP_MS = 2 * 60 * 1000;

const list = (value: unknown) => (Array.isArray(value) ? value : []);
const clip = (value: string, max = 1000) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

/** Titre, couleur et détail d'un événement ; `null` pour un type non relayé. */
export function describeEvent(event: JournalEvent): { title: string; tone: Tone; text: string; detail?: string } | null {
  const data = (event.data && typeof event.data === "object" && !Array.isArray(event.data) ? event.data : {}) as Record<string, unknown>;
  const player = event.subject_id ? `<@${event.subject_id}>` : "Un joueur";
  const actor = event.actor_id && event.actor_id !== event.subject_id ? `<@${event.actor_id}>` : "L'équipe";
  const comment = typeof data.commentaire === "string" && data.commentaire.trim() ? clip(data.commentaire.trim()) : undefined;
  switch (event.type) {
    case "candidature.envoyee":
      return data.renvoi
        ? { title: "📨 Candidature renvoyée", tone: "bronze", text: `${player} a renvoyé sa candidature corrigée.` }
        : { title: "📨 Nouvelle candidature", tone: "bronze", text: `${player} a envoyé sa candidature.` };
    case "candidature.validee":
      return { title: "✅ Candidature validée", tone: "or", text: `${actor} a validé la candidature écrite de ${player}. Entretien vocal à passer.` };
    case "candidature.modification":
      return {
        title: "✏️ Modification demandée",
        tone: "parchemin",
        text: `${actor} a demandé une modification à ${player} : ${labelList(STEP_LABELS, list(data.etapes)).join(", ") || "—"}.`,
        detail: comment,
      };
    case "candidature.refusee": {
      const criteria = labelList(CRITERION_LABELS, list(data.criteres)).map(item => `• ${item}`);
      return {
        title: "❌ Candidature refusée",
        tone: "bronze",
        text: `${actor} a refusé la candidature de ${player}.`,
        detail: [...criteria, comment].filter(Boolean).join("\n") || undefined,
      };
    }
    case "entretien.valide":
      return { title: "🏛️ Entretien validé", tone: "or", text: `${actor} a validé l'entretien de ${player} : joueur whitelisté.` };
    case "rang.change":
      return { title: "🛡️ Rang du site modifié", tone: "bronze", text: `${player} : ${label(RANK_LABELS, data.avant)} → **${label(RANK_LABELS, data.apres)}**` };
    case "candidature.supprimee":
      return { title: "🗑️ Candidature effacée", tone: "bronze", text: `${actor} a effacé la candidature de ${player}.` };
    case "compte.blacklist": {
      const reason = typeof data.raison === "string" && data.raison.trim() ? clip(data.raison.trim()) : undefined;
      return { title: "⛔ Joueur blacklisté", tone: "bronze", text: `${actor} a blacklisté ${player} : banni du Discord et bloqué sur le site.`, detail: reason };
    }
    case "compte.blacklist_levee":
      return { title: "🔓 Blacklist levée", tone: "parchemin", text: `${actor} a levé la blacklist de ${player}.` };
    default:
      return null;
  }
}

async function publish(guild: Guild, event: JournalEvent): Promise<StaffLogResult> {
  const described = describeEvent(event);
  if (!described) return "ignore";
  return staffLog(
    guild,
    settings => {
      const result = embed(settings, described.tone).setTitle(described.title).setDescription(described.text).setTimestamp(new Date(event.created_at));
      if (described.detail) result.addFields({ name: "Détail", value: described.detail });
      return result;
    },
    event.subject_id ? [row(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(profileUrl(event.subject_id)).setLabel("Fiche sur le site"))] : [],
  );
}

/** Événement lu du journal, avec sa position par rapport au curseur (calculée par Postgres, à la microseconde). */
export interface RelayedEvent extends JournalEvent {
  after_cursor: boolean;
}

/** Instant en millisecondes d'une date renvoyée en texte par Postgres (« 2026-10-23 20:11:12.123456+00 »). */
export function pgTime(text: string): number {
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?(Z|[+-]\d{2})(?::?(\d{2}))?$/.exec(text);
  if (!match) return Date.parse(text);
  const [, day, clock, fraction = "", zone, minutes = "00"] = match;
  return Date.parse(`${day}T${clock}${fraction.slice(0, 4)}${zone === "Z" ? "Z" : `${zone}:${minutes}`}`);
}

/**
 * Événements relayés postérieurs au curseur, dans l'ordre où le site les a écrits, plus ceux des dernières
 * minutes avant le curseur qui n'ont pas encore été traités (validés en retard).
 */
export async function eventsAfter(cursor: JournalCursor, limit = BATCH): Promise<RelayedEvent[]> {
  const seen = (cursor.recent ?? []).map(item => item.id);
  return sql()<RelayedEvent[]>`
    select id, type, subject_id, actor_id, data, created_at,
      (created_at, id) > (${cursor.at}::timestamptz, ${cursor.id}::uuid) as after_cursor
    from events
    where type in ${sql()([...RELAYED_EVENTS])}
      and (
        (created_at, id) > (${cursor.at}::timestamptz, ${cursor.id}::uuid)
        ${cursor.recent ? sql()`or (created_at > ${cursor.at}::timestamptz - ${`${OVERLAP_MS} milliseconds`}::interval and not (id = any(${seen}::uuid[])))` : sql()``}
      )
    order by created_at, id
    limit ${limit}
  `;
}

/** Ancien curseur sans liste `recent` : tout ce qui le précède a déjà été traité. */
async function seenBefore(cursor: JournalCursor): Promise<NonNullable<JournalCursor["recent"]>> {
  return sql()<{ id: string; at: string }[]>`
    select id, created_at as at from events
    where type in ${sql()([...RELAYED_EVENTS])}
      and created_at > ${cursor.at}::timestamptz - ${`${OVERLAP_MS} milliseconds`}::interval
      and (created_at, id) <= (${cursor.at}::timestamptz, ${cursor.id}::uuid)
  `;
}

/** Nouveau curseur après le traitement de `handled` (dans l'ordre du journal) : le plus récent, et la fenêtre de rattrapage. */
export function advanceCursor(cursor: JournalCursor, handled: RelayedEvent[]): JournalCursor {
  const last = handled.filter(event => event.after_cursor).at(-1);
  const next = last ? { at: last.created_at, id: last.id } : { at: cursor.at, id: cursor.id };
  const floor = pgTime(next.at) - OVERLAP_MS;
  const recent = [...(cursor.recent ?? []), ...handled.map(event => ({ id: event.id, at: event.created_at }))].filter(item => pgTime(item.at) > floor);
  return { ...next, recent: [...new Map(recent.map(item => [item.id, item])).values()].slice(-500) };
}

/** Point de départ : maintenant, pour ne pas déverser l'historique dans le salon à la première mise en route. */
async function startCursor(): Promise<JournalCursor> {
  const [now] = await sql()<{ at: string }[]>`select now()::text as at`;
  const start = { at: now!.at, id: "00000000-0000-0000-0000-000000000000" };
  return { ...start, recent: await seenBefore(start) };
}

/**
 * Relaie un lot de nouveaux événements, puis avance le curseur pour ne rien publier deux fois.
 * Un envoi en échec arrête le lot : l'événement et les suivants sont retentés au prochain passage.
 */
export async function relayJournal(guild: Guild) {
  let current = await getSettings(guild.id);
  const site = siteSettings(current);
  if (!site.journal) {
    await updateSiteSettings(current, { journal: await startCursor() });
    return 0;
  }
  const cursor = site.journal.recent ? site.journal : { ...site.journal, recent: await seenBefore(site.journal) };
  const events = await eventsAfter(cursor);
  // Module désactivé ou sans salon, le curseur suit quand même : les réactiver plus tard ne republie pas le passé.
  const relaying = Boolean(site.salonLogs && isModuleEnabled(current, MODULE));
  const handled: RelayedEvent[] = [];
  for (const event of events) {
    if (relaying && (await publish(guild, event)) === "echec") break;
    handled.push(event);
  }
  if (handled.length === 0 && cursor === site.journal) return 0;
  current = await getSettings(guild.id);
  await updateSiteSettings(current, { journal: advanceCursor(cursor, handled) });
  return handled.length;
}

/** Sonde le journal du site à intervalle régulier ; une erreur est journalisée et la boucle continue. */
export function startJournalRelay(guild: Guild) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      while ((await relayJournal(guild)) === BATCH);
    } catch (error) {
      logger.error({ err: error }, "Relais du journal du site impossible");
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), POLL_INTERVAL);
  timer.unref();
  return () => clearInterval(timer);
}
