import { randomInt } from "node:crypto";
import { UserError } from "@/core/errors";

export const MODULE = "giveaways";
export const MIN_DURATION_MS = 60 * 1000;
export const MAX_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_WINNERS = 20;

const UNITS: Record<string, number> = {
  m: 60 * 1000,
  min: 60 * 1000,
  h: 60 * 60 * 1000,
  j: 24 * 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  sem: 7 * 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
};

/** Durée saisie (« 2j », « 1h30 », « 45m », « 1sem 2j ») en millisecondes, entre une minute et 30 jours. */
export function parseDuration(input: string): number {
  const text = input.trim().toLowerCase().replace(/\s+/g, "");
  // « 1h30 » : les minutes sans unité suivent les heures.
  const normalized = text.replace(/(\d+)h(\d+)$/, "$1h$2m");
  const parts = [...normalized.matchAll(/(\d+)(sem|min|m|h|j|d|w)/g)];
  if (parts.length === 0 || parts.map(part => part[0]).join("") !== normalized) {
    throw new UserError("Durée invalide : utilisez par exemple 30m, 2h, 1h30, 3j ou 1sem.");
  }
  const total = parts.reduce((sum, [, value, unit]) => sum + Number(value) * UNITS[unit!]!, 0);
  if (total < MIN_DURATION_MS) throw new UserError("Un giveaway dure au moins une minute.");
  if (total > MAX_DURATION_MS) throw new UserError("Un giveaway dure au plus 30 jours.");
  return total;
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
