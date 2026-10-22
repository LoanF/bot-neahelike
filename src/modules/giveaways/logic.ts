import { randomInt } from "node:crypto";
import { parseDuration } from "@/core/duration";

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
