import { ButtonBuilder, ButtonStyle, type Guild } from "discord.js";
import { getSettings } from "@/config/store";
import { isModuleEnabled } from "@/core/access";
import { embed, type Tone } from "@/core/embeds";
import { row } from "@/core/panels";
import { sql, type Tables } from "@/db";
import { logger } from "@/logger";
import { profileUrl } from "./fiche";
import { CRITERION_LABELS, labelList, STEP_LABELS } from "./labels";
import { MODULE, siteSettings, updateSiteSettings, type JournalCursor } from "./settings";
import { staffLog } from "./staff-log";

/** Événements de candidature écrits par le site et relayés au staff. */
export const RELAYED_EVENTS = [
  "candidature.envoyee",
  "candidature.validee",
  "candidature.modification",
  "candidature.refusee",
  "entretien.valide",
  "candidature.supprimee",
] as const;

export type JournalEvent = Pick<Tables<"events">, "id" | "type" | "subject_id" | "actor_id" | "data" | "created_at">;

const POLL_INTERVAL = 20_000;
const BATCH = 50;

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
    case "candidature.supprimee":
      return { title: "🗑️ Candidature effacée", tone: "bronze", text: `${actor} a effacé la candidature de ${player}.` };
    default:
      return null;
  }
}

async function publish(guild: Guild, event: JournalEvent) {
  const described = describeEvent(event);
  if (!described) return;
  await staffLog(
    guild,
    settings => {
      const result = embed(settings, described.tone).setTitle(described.title).setDescription(described.text).setTimestamp(new Date(event.created_at));
      if (described.detail) result.addFields({ name: "Détail", value: described.detail });
      return result;
    },
    event.subject_id ? [row(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(profileUrl(event.subject_id)).setLabel("Fiche sur le site"))] : [],
  );
}

/** Événements relayés postérieurs au curseur, dans l'ordre où le site les a écrits. */
export async function eventsAfter(cursor: JournalCursor, limit = BATCH): Promise<JournalEvent[]> {
  return sql()<JournalEvent[]>`
    select id, type, subject_id, actor_id, data, created_at
    from events
    where type in ${sql()([...RELAYED_EVENTS])}
      and (created_at, id) > (${cursor.at}::timestamptz, ${cursor.id}::uuid)
    order by created_at, id
    limit ${limit}
  `;
}

/** Point de départ : maintenant, pour ne pas déverser l'historique dans le salon à la première mise en route. */
async function startCursor(): Promise<JournalCursor> {
  const [now] = await sql()<{ at: string }[]>`select now()::text as at`;
  return { at: now!.at, id: "00000000-0000-0000-0000-000000000000" };
}

/** Relaie un lot de nouveaux événements, puis avance le curseur pour ne rien publier deux fois. */
export async function relayJournal(guild: Guild) {
  let current = await getSettings(guild.id);
  const site = siteSettings(current);
  if (!site.journal) {
    await updateSiteSettings(current, { journal: await startCursor() });
    return 0;
  }
  // Module désactivé ou sans salon, le curseur suit quand même : les réactiver plus tard ne republie pas le passé.
  const events = await eventsAfter(site.journal);
  if (events.length === 0) return 0;
  if (site.salonLogs && isModuleEnabled(current, MODULE)) for (const event of events) await publish(guild, event);
  const last = events.at(-1)!;
  current = await getSettings(guild.id);
  await updateSiteSettings(current, { journal: { at: last.created_at, id: last.id } });
  return events.length;
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
