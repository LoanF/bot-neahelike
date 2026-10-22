import { DAY, formatDuration, parseDuration } from "@/core/duration";
import type { Enums } from "@/db";

export const MODULE = "moderation";

/** Discord limite une exclusion temporaire à 28 jours. */
export const MAX_TIMEOUT_MS = 28 * DAY;
export const MAX_TEMPBAN_MS = 365 * DAY;

export type SanctionType = Enums<"sanction_type">;

export const SANCTION_LABELS: Record<SanctionType, { label: string; emoji: string }> = {
  avertissement: { label: "Avertissement", emoji: "⚠️" },
  exclusion: { label: "Exclusion temporaire", emoji: "⏳" },
  expulsion: { label: "Expulsion", emoji: "👢" },
  bannissement: { label: "Bannissement", emoji: "🔨" },
};

export function parseTimeout(input: string): number {
  return parseDuration(input, { min: 1000, max: MAX_TIMEOUT_MS, what: "Une exclusion temporaire" });
}

export function parseTempban(input: string): number {
  return parseDuration(input, { min: 60 * 1000, max: MAX_TEMPBAN_MS, what: "Un bannissement temporaire" });
}

export interface HierarchyInput {
  actorId: string;
  /** Position du plus haut rôle de l'auteur ; ignorée pour le propriétaire du serveur. */
  actorTop: number;
  targetId: string;
  /** Position du plus haut rôle de la cible ; `null` si elle n'est pas (ou plus) sur le serveur. */
  targetTop: number | null;
  ownerId: string;
  botId: string;
  botTop: number;
}

/**
 * Raison pour laquelle cette sanction est impossible, ou `null` : on ne se sanctionne pas soi-même,
 * on ne touche ni au propriétaire ni au bot, ni à un membre de rang égal ou supérieur (à soi ou au bot).
 */
export function hierarchyProblem(input: HierarchyInput): string | null {
  if (input.targetId === input.actorId) return "Vous ne pouvez pas vous sanctionner vous-même.";
  if (input.targetId === input.ownerId) return "Le propriétaire du serveur ne peut pas être sanctionné.";
  if (input.targetId === input.botId) return "Le bot ne peut pas se sanctionner lui-même.";
  if (input.targetTop === null) return null;
  if (input.actorId !== input.ownerId && input.targetTop >= input.actorTop) return "Ce membre a un rôle égal ou supérieur au vôtre.";
  if (input.targetTop >= input.botTop) return "Le rôle de ce membre est au-dessus de celui du bot : montez le rôle du bot dans la liste des rôles.";
  return null;
}

export interface SanctionLike {
  type: SanctionType;
  ends_at: string | null;
  revoked_at: string | null;
}

/** État d'une sanction dans le casier. */
export function sanctionState(sanction: SanctionLike, now = new Date()): "levee" | "expiree" | "active" | "definitive" {
  if (sanction.revoked_at) return "levee";
  if (sanction.ends_at && new Date(sanction.ends_at) <= now) return "expiree";
  if (sanction.type === "avertissement" || sanction.type === "expulsion") return "definitive";
  return "active";
}

/** Texte de durée pour le message privé et le casier : « (2 jours) », vide sans durée. */
export function durationSuffix(ms: number | null | undefined): string {
  return ms ? ` (${formatDuration(ms)})` : "";
}

/** Raison saisie, ou une raison par défaut ; bornée sous la limite du journal d'audit de Discord (512). */
export function cleanReason(reason: string | undefined | null): string {
  const text = reason?.trim() || "Aucune raison précisée";
  return text.slice(0, 500);
}
