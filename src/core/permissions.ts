export interface PermissionLevel {
  id: string;
  name: string;
  weight: number;
  roleIds: string[];
}

/** Poids requis par une commande ouverte à tous. */
export const EVERYONE = 0;

/**
 * Poids d'un membre : le plus élevé des niveaux dont il porte au moins un rôle.
 * Un niveau de poids supérieur hérite donc de tous les droits des niveaux inférieurs.
 * La permission Discord « Administrateur » passe toujours, pour ne jamais perdre l'accès à la configuration.
 */
export function memberWeight(levels: PermissionLevel[], roleIds: Iterable<string>, isAdministrator: boolean): number {
  if (isAdministrator) return Number.POSITIVE_INFINITY;
  const roles = new Set(roleIds);
  return levels.reduce((best, level) => (level.weight > best && level.roleIds.some(id => roles.has(id)) ? level.weight : best), EVERYONE);
}

export interface Requirement {
  /** Poids fixé par le code si rien n'est configuré. */
  defaultWeight: number;
  /** Commande de configuration : jamais ouverte à tous. */
  protected?: boolean;
  /** Niveau requis par le module de la commande (`null` : non réglé). */
  moduleLevelId?: string | null;
  /** Réglage propre à la commande : `levelId: null` signifie « tout le monde ». */
  override?: { levelId: string | null };
}

/** Résolution : réglage de la commande, sinon réglage du module, sinon valeur par défaut. */
export function requiredWeight(levels: PermissionLevel[], requirement: Requirement): number {
  const weightOf = (levelId: string) => levels.find(level => level.id === levelId)?.weight;

  let weight = requirement.defaultWeight;
  if (requirement.override) {
    weight = requirement.override.levelId === null ? EVERYONE : (weightOf(requirement.override.levelId) ?? requirement.defaultWeight);
  } else if (requirement.moduleLevelId) {
    weight = weightOf(requirement.moduleLevelId) ?? requirement.defaultWeight;
  }

  if (requirement.protected && weight === EVERYONE) return requirement.defaultWeight;
  return weight;
}

/** Libellé lisible d'un poids requis. */
export function describeWeight(levels: PermissionLevel[], weight: number): string {
  if (weight === EVERYONE) return "Tout le monde";
  const exact = levels.find(level => level.weight === weight);
  if (exact) return exact.name;
  const above = [...levels].sort((a, b) => a.weight - b.weight).find(level => level.weight >= weight);
  return above ? `${above.name} (poids ${weight})` : `Administrateurs Discord (poids ${weight})`;
}
