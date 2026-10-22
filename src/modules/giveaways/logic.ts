import { randomInt } from "node:crypto";
import { parseDuration } from "@/core/duration";
import { UserError } from "@/core/errors";

export const MODULE = "giveaways";
export const MIN_DURATION_MS = 60 * 1000;
export const MAX_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_WINNERS = 20;

/** Durée d'un giveaway (« 2j », « 1h30 », « 45m », « 1sem 2j »), entre une minute et 30 jours. */
export function parseGiveawayDuration(input: string): number {
  return parseDuration(input, { min: MIN_DURATION_MS, max: MAX_DURATION_MS, what: "Un giveaway" });
}

/** Tire `count` gagnants distincts au hasard (aléatoire cryptographique), en écartant les exclus. */
export function pickWinners(entries: string[], count: number, exclude: Iterable<string> = [], random: (max: number) => number = randomInt): string[] {
  const excluded = new Set(exclude);
  const pool = [...new Set(entries)].filter(id => !excluded.has(id));
  const winners: string[] = [];
  while (winners.length < count && pool.length > 0) {
    const index = random(pool.length);
    winners.push(pool.splice(index, 1)[0]!);
  }
  return winners;
}

/** Giveaway en cours de préparation dans le panneau (gardé en mémoire, jamais en base avant la publication). */
export interface GiveawayDraft {
  prize: string | null;
  description: string | null;
  durationMs: number;
  winners: number;
  channelId: string | null;
  roleId: string | null;
}

export const DEFAULT_DURATION_MS = 24 * 60 * 60 * 1000;

export function newDraft(channelId: string | null = null): GiveawayDraft {
  return { prize: null, description: null, durationMs: DEFAULT_DURATION_MS, winners: 1, channelId, roleId: null };
}

/** Durées proposées dans le menu du panneau ; une autre durée se saisit dans le formulaire. */
export const DURATION_CHOICES: { label: string; ms: number }[] = [
  { label: "10 minutes", ms: 10 * 60 * 1000 },
  { label: "1 heure", ms: 60 * 60 * 1000 },
  { label: "6 heures", ms: 6 * 60 * 60 * 1000 },
  { label: "1 jour", ms: 24 * 60 * 60 * 1000 },
  { label: "3 jours", ms: 3 * 24 * 60 * 60 * 1000 },
  { label: "1 semaine", ms: 7 * 24 * 60 * 60 * 1000 },
  { label: "2 semaines", ms: 14 * 24 * 60 * 60 * 1000 },
  { label: "30 jours", ms: MAX_DURATION_MS },
];

/** Ce qui manque encore pour publier le brouillon (vide : prêt). */
export function draftMissing(draft: GiveawayDraft): string[] {
  const missing: string[] = [];
  if (!draft.prize) missing.push("le lot");
  if (!draft.channelId) missing.push("le salon de publication");
  return missing;
}

/** Nombre de gagnants saisi : entier de 1 à 20. */
export function parseWinners(input: string | null, fallback: number): number {
  if (!input) return fallback;
  const value = Number(input.trim());
  if (!Number.isInteger(value) || value < 1 || value > MAX_WINNERS) {
    throw new UserError(`Le nombre de gagnants doit être un nombre entier de 1 à ${MAX_WINNERS}.`);
  }
  return value;
}
