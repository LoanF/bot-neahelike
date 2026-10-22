export type Journey = "whiteliste" | "attente-vocal" | "aucune";

/** Étape du parcours whitelist lisible depuis les rôles Discord. */
export function journeyFromRoles(roles: Iterable<string>, config: { aspirant?: string; helikeen?: string }): Journey {
  const held = new Set(roles);
  if (config.helikeen && held.has(config.helikeen)) return "whiteliste";
  if (config.aspirant && held.has(config.aspirant)) return "attente-vocal";
  return "aucune";
}
