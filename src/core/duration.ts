import { UserError } from "./errors";

export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
export const WEEK = 7 * DAY;

const UNITS: Record<string, number> = { s: 1000, m: MINUTE, min: MINUTE, h: HOUR, j: DAY, d: DAY, sem: WEEK, w: WEEK };

/**
 * Durée saisie (« 30m », « 2h », « 1h30 », « 3j », « 1sem 2j », « 45s ») en millisecondes,
 * bornée par `min` et `max`. `what` nomme ce qui dure, pour les messages d'erreur (« Un giveaway »).
 */
export function parseDuration(input: string, { min, max, what }: { min: number; max: number; what: string }): number {
  const text = input.trim().toLowerCase().replace(/\s+/g, "");
  // « 1h30 » : les minutes sans unité suivent les heures.
  const normalized = text.replace(/(\d+)h(\d+)$/, "$1h$2m");
  const parts = [...normalized.matchAll(/(\d+)(sem|min|s|m|h|j|d|w)/g)];
  if (parts.length === 0 || parts.map(part => part[0]).join("") !== normalized) {
    throw new UserError("Durée invalide : utilisez par exemple 30m, 2h, 1h30, 3j ou 1sem.");
  }
  const total = parts.reduce((sum, [, value, unit]) => sum + Number(value) * UNITS[unit!]!, 0);
  if (total < min) throw new UserError(`${what} dure au moins ${formatDuration(min)}.`);
  if (total > max) throw new UserError(`${what} dure au plus ${formatDuration(max)}.`);
  return total;
}

/** Durée lisible : « 2 jours 3 heures », « 2 semaines », « 30 secondes ». Les deux plus grandes unités suffisent. */
export function formatDuration(ms: number): string {
  const units: [number, string, string][] = [
    [WEEK, "semaine", "semaines"],
    [DAY, "jour", "jours"],
    [HOUR, "heure", "heures"],
    [MINUTE, "minute", "minutes"],
    [1000, "seconde", "secondes"],
  ];
  const parts: string[] = [];
  let rest = Math.round(ms / 1000) * 1000;
  for (const [size, one, many] of units) {
    // Les semaines seulement pour un compte rond : « 30 jours » se lit mieux que « 4 semaines 2 jours ».
    if (size === WEEK && rest % WEEK !== 0) continue;
    const count = Math.floor(rest / size);
    if (count > 0) {
      parts.push(`${count} ${count > 1 ? many : one}`);
      rest -= count * size;
    }
    if (parts.length === 2) break;
  }
  return parts.join(" ") || "0 seconde";
}
