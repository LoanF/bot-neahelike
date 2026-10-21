import type { APIEmbed } from "discord.js";
import { normalizeHexColor, hexToInt } from "@/core/args";
import { UserError } from "@/core/errors";

/** Brouillon d'un embed en cours de création, avec la mention éventuelle placée au-dessus. */
export interface EmbedDraft {
  embed: APIEmbed;
  /** ID du rôle à mentionner au-dessus de l'embed. */
  mention: string | null;
}

/** Historique pour Défaire / Refaire. */
export interface DraftState {
  current: EmbedDraft;
  past: EmbedDraft[];
  future: EmbedDraft[];
}

const HISTORY = 30;

/** Limites de Discord pour un embed. */
export const LIMITS = { title: 256, description: 4096, fields: 25, fieldName: 256, fieldValue: 1024, footer: 2048, author: 256, total: 6000 } as const;

export function createState(color: number): DraftState {
  return { current: { embed: { color }, mention: null }, past: [], future: [] };
}

/** Nombre de caractères comptés par Discord (limite de 6 000 par embed). */
export function embedLength(embed: APIEmbed): number {
  return (
    (embed.title?.length ?? 0) +
    (embed.description?.length ?? 0) +
    (embed.footer?.text.length ?? 0) +
    (embed.author?.name.length ?? 0) +
    (embed.fields ?? []).reduce((total, field) => total + field.name.length + field.value.length, 0)
  );
}

/** Un embed sans texte ni image ne peut pas être publié. */
export function isEmpty(embed: APIEmbed): boolean {
  return embedLength(embed) === 0 && !embed.image && !embed.thumbnail;
}

export function checkLimits(embed: APIEmbed) {
  if ((embed.fields?.length ?? 0) > LIMITS.fields) throw new UserError(`Un embed ne peut pas avoir plus de ${LIMITS.fields} champs.`);
  const length = embedLength(embed);
  if (length > LIMITS.total) throw new UserError(`L'embed dépasserait ${LIMITS.total} caractères au total (${length}) : raccourcis un texte.`);
}

/** Applique une modification ; elle peut être défaite. */
export function edit(state: DraftState, change: (draft: EmbedDraft) => EmbedDraft): DraftState {
  const next = change(structuredClone(state.current));
  checkLimits(next.embed);
  return { current: next, past: [...state.past, state.current].slice(-HISTORY), future: [] };
}

export function undo(state: DraftState): DraftState {
  const previous = state.past.at(-1);
  if (!previous) return state;
  return { current: previous, past: state.past.slice(0, -1), future: [state.current, ...state.future] };
}

export function redo(state: DraftState): DraftState {
  const next = state.future[0];
  if (!next) return state;
  return { current: next, past: [...state.past, state.current], future: state.future.slice(1) };
}

/** Retire une clé de l'embed quand la valeur est vide. */
export function setOrClear<K extends keyof APIEmbed>(embed: APIEmbed, key: K, value: APIEmbed[K] | null | undefined): APIEmbed {
  const result = { ...embed };
  if (value === null || value === undefined) delete result[key];
  else result[key] = value;
  return result;
}

const NAMED_COLORS: Record<string, string> = {
  or: "#d1a64a",
  bronze: "#1a150f",
  parchemin: "#f1ece2",
  rouge: "#c0392b",
  vert: "#27ae60",
  bleu: "#2980b9",
  violet: "#8e44ad",
  orange: "#e67e22",
  noir: "#111111",
  blanc: "#ffffff",
  gris: "#7f8c8d",
};

export const COLOR_NAMES = Object.keys(NAMED_COLORS);

/** « or », « rouge »… ou un code hexadécimal ; `null` si la couleur est inconnue. */
export function parseColor(input: string): number | null {
  const hex = NAMED_COLORS[input.trim().toLowerCase()] ?? normalizeHexColor(input);
  return hex ? hexToInt(hex) : null;
}

/** Adresse https d'une image, `null` si vide. */
export function parseUrl(input: string | null, what: string): string | null {
  if (!input) return null;
  try {
    const url = new URL(input);
    if (url.protocol !== "https:") throw new Error();
    return url.toString();
  } catch {
    throw new UserError(`${what} : l'adresse doit commencer par https://.`);
  }
}
