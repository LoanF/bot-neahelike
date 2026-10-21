import type { Enums } from "@/db";

export type Rank = Enums<"rank">;

/** Le rang du site découle uniquement des rôles Discord : staff > recruteur > joueur (même règle que le site). */
export function rankFromRoles(roles: Iterable<string>, config: { staff: string[]; recruteur: string[] }): Rank {
  const held = new Set(roles);
  if (config.staff.some(role => held.has(role))) return "staff";
  if (config.recruteur.some(role => held.has(role))) return "recruteur";
  return "joueur";
}

export type Journey = "whiteliste" | "attente-vocal" | "aucune";

/** Étape du parcours whitelist lisible depuis les rôles Discord. */
export function journeyFromRoles(roles: Iterable<string>, config: { aspirant?: string; helikeen?: string }): Journey {
  const held = new Set(roles);
  if (config.helikeen && held.has(config.helikeen)) return "whiteliste";
  if (config.aspirant && held.has(config.aspirant)) return "attente-vocal";
  return "aucune";
}
