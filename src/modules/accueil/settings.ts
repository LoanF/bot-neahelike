import { randomBytes } from "node:crypto";
import { PermissionFlagsBits, type Role } from "discord.js";
import { z } from "zod";
import { setModuleSettings, type GuildSettings } from "@/config/store";
import { UserError } from "@/core/errors";

export const MODULE = "accueil";

/** Rôles donnés à l'arrivée. */
export const MAX_AUTOROLES = 5;
/** Panneaux de rôles en libre-service. */
export const MAX_ROLE_PANELS = 10;
/** Un menu déroulant a 25 options au plus ; 5 rangées de 5 boutons aussi. */
export const MAX_PANEL_ROLES = 25;

const snowflake = z.string().regex(/^\d{17,20}$/);
const messageRef = z.object({ channelId: snowflake, messageId: snowflake });

const rolePanelSchema = z.object({
  id: z.string().regex(/^[a-z0-9]{1,16}$/),
  title: z.string().min(1).max(100),
  description: z.string().max(1000),
  /** Boutons (un clic ajoute ou retire le rôle) ou menu déroulant (on coche ses rôles). */
  style: z.enum(["boutons", "menu"]),
  /** Un seul rôle du panneau à la fois (par exemple une couleur). */
  unique: z.boolean(),
  roleIds: z.array(snowflake).max(MAX_PANEL_ROLES),
  message: messageRef.optional(),
});

export type RolePanel = z.infer<typeof rolePanelSchema>;

const schema = z.object({
  /** Salon du message de bienvenue ; absent : pas de message. */
  bienvenueId: snowflake.optional(),
  /** Message privé de bienvenue envoyé au nouveau membre. */
  bienvenueMp: z.boolean().optional(),
  /** Salon du message de départ ; absent : pas de message. */
  departId: snowflake.optional(),
  autoroles: z.array(snowflake).max(MAX_AUTOROLES).optional(),
  /** Rôle donné en acceptant le règlement. */
  reglementRoleId: snowflake.optional(),
  /** Message du règlement publié, mis à jour quand son texte change. */
  reglementMessage: messageRef.optional(),
  panneaux: z.array(rolePanelSchema).max(MAX_ROLE_PANELS).optional(),
});

export type WelcomeSettings = Omit<z.infer<typeof schema>, "autoroles" | "panneaux"> & { autoroles: string[]; panneaux: RolePanel[] };

/** Réglages de l'accueil ; une valeur invalide en base est ignorée plutôt que de bloquer le bot. */
export function welcomeSettings(settings: GuildSettings): WelcomeSettings {
  const parsed = schema.safeParse(settings.modules.get(MODULE)?.settings ?? {});
  const data = parsed.success ? parsed.data : {};
  return { ...data, autoroles: data.autoroles ?? [], panneaux: data.panneaux ?? [] };
}

export async function saveWelcomeSettings(settings: GuildSettings, next: WelcomeSettings) {
  await setModuleSettings(settings.guildId, MODULE, schema.parse(next));
}

export function findPanel(welcome: WelcomeSettings, id: string): RolePanel {
  const panel = welcome.panneaux.find(item => item.id === id);
  if (!panel) throw new UserError("Ce panneau de rôles n'existe plus.");
  return panel;
}

export function newPanelId(): string {
  return `p${randomBytes(4).toString("hex")}`;
}

/** Permissions qu'un rôle distribué librement ne doit jamais porter. */
const DANGEROUS =
  PermissionFlagsBits.Administrator |
  PermissionFlagsBits.ManageGuild |
  PermissionFlagsBits.ManageRoles |
  PermissionFlagsBits.ManageChannels |
  PermissionFlagsBits.ManageMessages |
  PermissionFlagsBits.ManageWebhooks |
  PermissionFlagsBits.ManageNicknames |
  PermissionFlagsBits.ManageGuildExpressions |
  PermissionFlagsBits.ManageEvents |
  PermissionFlagsBits.ManageThreads |
  PermissionFlagsBits.KickMembers |
  PermissionFlagsBits.BanMembers |
  PermissionFlagsBits.ModerateMembers |
  PermissionFlagsBits.MentionEveryone |
  PermissionFlagsBits.ViewAuditLog;

type RoleLike = Pick<Role, "id" | "name" | "managed" | "position"> & { permissions: { bitfield: bigint } };

/**
 * Raison pour laquelle le bot ne peut pas distribuer ce rôle tout seul, ou `null` s'il le peut :
 * rôle géré par une intégration, @everyone, placé au-dessus du bot, ou porteur de permissions de modération.
 */
export function roleProblem(role: RoleLike, guildId: string, botHighestPosition: number): string | null {
  if (role.id === guildId) return "@everyone ne se distribue pas.";
  if (role.managed) return `${role.name} est géré par une intégration (bot, boost…) : Discord interdit de le donner.`;
  if (role.position >= botHighestPosition) return `${role.name} est placé au-dessus du rôle du bot : montez le rôle du bot dans la liste des rôles du serveur.`;
  if ((role.permissions.bitfield & DANGEROUS) !== 0n) return `${role.name} donne des permissions de gestion ou de modération : il ne peut pas être distribué automatiquement.`;
  return null;
}

/** Rôles à ajouter et retirer quand un membre clique sur le bouton d'un rôle. */
export function toggleRole(panel: Pick<RolePanel, "roleIds" | "unique">, held: Iterable<string>, roleId: string): { add: string[]; remove: string[] } {
  const current = new Set(held);
  if (current.has(roleId)) return { add: [], remove: [roleId] };
  const remove = panel.unique ? panel.roleIds.filter(id => id !== roleId && current.has(id)) : [];
  return { add: [roleId], remove };
}

/** Rôles à ajouter et retirer après un choix dans le menu : le menu reflète exactement les rôles du panneau portés. */
export function applyMenuChoice(panel: Pick<RolePanel, "roleIds" | "unique">, held: Iterable<string>, selected: string[]): { add: string[]; remove: string[] } {
  const current = new Set(held);
  const wanted = new Set(selected.filter(id => panel.roleIds.includes(id)).slice(0, panel.unique ? 1 : undefined));
  return {
    add: [...wanted].filter(id => !current.has(id)),
    remove: panel.roleIds.filter(id => current.has(id) && !wanted.has(id)),
  };
}
