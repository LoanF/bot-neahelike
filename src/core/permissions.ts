import { PermissionFlagsBits } from "discord.js";

export interface PermissionLevel {
  id: string;
  name: string;
  /** Sert seulement à ordonner les accès : jamais affiché. */
  weight: number;
  roleIds: string[];
}

/**
 * Poids d'un membre : le plus élevé des accès dont il porte au moins un rôle (0 sans aucun).
 * Un accès plus haut dans l'échelle hérite donc de tous les droits des accès inférieurs.
 */
export function memberWeight(levels: PermissionLevel[], roleIds: Iterable<string>): number {
  const roles = new Set(roleIds);
  return levels.reduce((best, level) => (level.weight > best && level.roleIds.some(id => roles.has(id)) ? level.weight : best), 0);
}

export interface Requirement {
  /** Permission Discord demandée tant que rien n'est réglé (la même qui rend la commande slash visible) ; null : tout le monde. */
  defaultPermission: bigint | null;
  /** Commande de configuration : ne peut jamais être ouverte à tout le monde. */
  protected?: boolean;
  /** Accès requis pour tout le module (`null` : non réglé). */
  moduleLevelId?: string | null;
  /** Réglage propre à la commande : `levelId: null` signifie « tout le monde ». */
  override?: { levelId: string | null };
}

export type Resolved =
  | { kind: "everyone" }
  | { kind: "level"; level: PermissionLevel }
  | { kind: "permission"; permission: bigint };

function byDefault(requirement: Requirement): Resolved {
  return requirement.defaultPermission === null ? { kind: "everyone" } : { kind: "permission", permission: requirement.defaultPermission };
}

/** Réglage de la commande, sinon accès du module, sinon permission Discord par défaut. Un accès supprimé est ignoré. */
export function resolveRequirement(levels: PermissionLevel[], requirement: Requirement): Resolved {
  const find = (id: string) => levels.find(level => level.id === id);

  if (requirement.override) {
    if (requirement.override.levelId === null) return requirement.protected ? byDefault(requirement) : { kind: "everyone" };
    const level = find(requirement.override.levelId);
    if (level) return { kind: "level", level };
  }
  if (requirement.moduleLevelId) {
    const level = find(requirement.moduleLevelId);
    if (level) return { kind: "level", level };
  }
  return byDefault(requirement);
}

export interface MemberAccess {
  weight: number;
  /** Permission Discord « Administrateur » : passe toujours, pour ne jamais perdre l'accès à la configuration. */
  administrator: boolean;
  hasPermission: (permission: bigint) => boolean;
}

export function allows(resolved: Resolved, member: MemberAccess): boolean {
  if (member.administrator) return true;
  switch (resolved.kind) {
    case "everyone":
      return true;
    case "level":
      return member.weight >= resolved.level.weight;
    case "permission":
      return member.hasPermission(resolved.permission);
  }
}

const PERMISSION_NAMES = new Map<bigint, string>([
  [PermissionFlagsBits.Administrator, "Administrateur"],
  [PermissionFlagsBits.ManageGuild, "Gérer le serveur"],
  [PermissionFlagsBits.ManageMessages, "Gérer les messages"],
  [PermissionFlagsBits.ManageChannels, "Gérer les salons"],
  [PermissionFlagsBits.ManageRoles, "Gérer les rôles"],
  [PermissionFlagsBits.ModerateMembers, "Exclure temporairement des membres"],
  [PermissionFlagsBits.KickMembers, "Expulser des membres"],
  [PermissionFlagsBits.BanMembers, "Bannir des membres"],
]);

export function permissionName(permission: bigint): string {
  return PERMISSION_NAMES.get(permission) ?? "Permission Discord";
}

/** Libellé lisible : « Tout le monde », « Accès Staff et au-dessus », « Permission Discord « Gérer le serveur » ». */
export function describeResolved(resolved: Resolved): string {
  switch (resolved.kind) {
    case "everyone":
      return "Tout le monde";
    case "level":
      return `Accès ${resolved.level.name} et au-dessus`;
    case "permission":
      return `Permission Discord « ${permissionName(resolved.permission)} »`;
  }
}

/** Échelle des accès, du plus haut au plus bas. */
export function ladder(levels: PermissionLevel[]): PermissionLevel[] {
  return [...levels].sort((a, b) => b.weight - a.weight);
}

/** Nouveaux poids pour un ordre donné (du plus haut au plus bas) : 10, 20, 30… en partant du bas. */
export function weightsFor(orderedIds: string[]): Map<string, number> {
  return new Map(orderedIds.map((id, index) => [id, (orderedIds.length - index) * 10]));
}

/** Ordre après avoir monté ou descendu un accès d'un cran ; inchangé s'il est déjà en bout d'échelle. */
export function move(orderedIds: string[], id: string, direction: "monter" | "descendre"): string[] {
  const index = orderedIds.indexOf(id);
  const target = direction === "monter" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= orderedIds.length) return orderedIds;
  const result = [...orderedIds];
  [result[index], result[target]] = [result[target]!, result[index]!];
  return result;
}
