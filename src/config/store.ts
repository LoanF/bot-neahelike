import type { PermissionLevel } from "@/core/permissions";
import { isUniqueViolation, UserError } from "@/core/errors";
import { sql, type Json, type Tables, type TablesUpdate } from "@/db";

export type GuildConfig = Tables<"bot_guild_config">;

export interface ModuleState {
  enabled: boolean;
  levelId: string | null;
  settings: Json;
}

/** Toute la configuration d'un serveur, telle que stockée en base. */
export interface GuildSettings {
  guildId: string;
  config: GuildConfig;
  /** Triés par poids croissant. */
  levels: PermissionLevel[];
  modules: Map<string, ModuleState>;
  commandOverrides: Map<string, { levelId: string | null }>;
  messages: Map<string, string>;
}

/** Niveaux créés au premier démarrage, modifiables ensuite depuis Discord. */
export const DEFAULT_LEVELS = [
  { name: "Joueur", weight: 10 },
  { name: "Staff", weight: 50 },
  { name: "Admin", weight: 100 },
];

export const MAX_LEVELS = 20;

const cache = new Map<string, GuildSettings>();

async function load(guildId: string): Promise<GuildSettings> {
  const db = sql();
  const [configs, levels, levelRoles, modules, overrides, messages] = await Promise.all([
    db<GuildConfig[]>`select * from bot_guild_config where guild_id = ${guildId}`,
    db<Tables<"bot_permission_levels">[]>`select * from bot_permission_levels where guild_id = ${guildId} order by weight`,
    db<Tables<"bot_permission_level_roles">[]>`
      select r.* from bot_permission_level_roles r
      join bot_permission_levels l on l.id = r.level_id
      where l.guild_id = ${guildId}
    `,
    db<Tables<"bot_modules">[]>`select * from bot_modules where guild_id = ${guildId}`,
    db<Tables<"bot_command_permissions">[]>`select * from bot_command_permissions where guild_id = ${guildId}`,
    db<Tables<"bot_messages">[]>`select * from bot_messages where guild_id = ${guildId}`,
  ]);

  const config = configs[0];
  if (!config) throw new Error(`Configuration absente pour le serveur ${guildId} : ensureGuild() doit être appelé au démarrage.`);

  return {
    guildId,
    config,
    levels: levels.map(level => ({
      id: level.id,
      name: level.name,
      weight: level.weight,
      roleIds: levelRoles.filter(role => role.level_id === level.id).map(role => role.role_id),
    })),
    modules: new Map(modules.map(row => [row.module, { enabled: row.enabled, levelId: row.level_id, settings: row.settings }])),
    commandOverrides: new Map(overrides.map(row => [row.command, { levelId: row.level_id }])),
    messages: new Map(messages.map(row => [row.key, row.content])),
  };
}

/** Configuration du serveur, mise en cache jusqu'à la prochaine modification. */
export async function getSettings(guildId: string): Promise<GuildSettings> {
  const cached = cache.get(guildId);
  if (cached) return cached;
  const settings = await load(guildId);
  cache.set(guildId, settings);
  return settings;
}

function invalidate(guildId: string) {
  cache.delete(guildId);
}

/** Crée la configuration et les niveaux par défaut si le serveur n'en a pas encore. */
export async function ensureGuild(guildId: string) {
  await sql().begin(async tx => {
    await tx`insert into bot_guild_config (guild_id) values (${guildId}) on conflict (guild_id) do nothing`;
    const [{ count } = { count: 0 }] = await tx<{ count: number }[]>`
      select count(*)::int as count from bot_permission_levels where guild_id = ${guildId}
    `;
    if (count === 0) {
      for (const level of DEFAULT_LEVELS) {
        await tx`insert into bot_permission_levels (guild_id, name, weight) values (${guildId}, ${level.name}, ${level.weight})`;
      }
    }
  });
  invalidate(guildId);
}

type ConfigPatch = Omit<TablesUpdate<"bot_guild_config">, "guild_id" | "updated_at">;

export async function updateConfig(guildId: string, patch: ConfigPatch) {
  const keys = Object.keys(patch) as (keyof ConfigPatch)[];
  if (keys.length === 0) return;
  await sql()`update bot_guild_config set ${sql()(patch, keys)}, updated_at = now() where guild_id = ${guildId}`;
  invalidate(guildId);
}

// ─── Modules ────────────────────────────────────────────────────────────────

export async function setModuleEnabled(guildId: string, module: string, enabled: boolean) {
  await sql()`
    insert into bot_modules (guild_id, module, enabled) values (${guildId}, ${module}, ${enabled})
    on conflict (guild_id, module) do update set enabled = excluded.enabled, updated_at = now()
  `;
  invalidate(guildId);
}

export async function setModuleLevel(guildId: string, module: string, levelId: string | null) {
  await sql()`
    insert into bot_modules (guild_id, module, level_id) values (${guildId}, ${module}, ${levelId})
    on conflict (guild_id, module) do update set level_id = excluded.level_id, updated_at = now()
  `;
  invalidate(guildId);
}

// ─── Niveaux de permission ──────────────────────────────────────────────────

function validateLevel(name: string, weight: number) {
  if (name.length < 1 || name.length > 32) throw new UserError("Le nom d'un niveau doit faire entre 1 et 32 caractères.");
  if (!Number.isInteger(weight) || weight < 1 || weight > 1000) throw new UserError("Le poids d'un niveau doit être un entier entre 1 et 1000.");
}

async function guardUnique<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (isUniqueViolation(error)) throw new UserError("Un autre niveau porte déjà ce nom ou ce poids.");
    throw error;
  }
}

export async function createLevel(guildId: string, name: string, weight: number) {
  validateLevel(name, weight);
  const settings = await getSettings(guildId);
  if (settings.levels.length >= MAX_LEVELS) throw new UserError(`Un serveur ne peut pas avoir plus de ${MAX_LEVELS} niveaux.`);
  const [row] = await guardUnique(
    () => sql()<{ id: string }[]>`insert into bot_permission_levels (guild_id, name, weight) values (${guildId}, ${name}, ${weight}) returning id`,
  );
  invalidate(guildId);
  return row!.id;
}

export async function updateLevel(guildId: string, levelId: string, patch: { name: string; weight: number }) {
  validateLevel(patch.name, patch.weight);
  await guardUnique(
    () => sql()`update bot_permission_levels set name = ${patch.name}, weight = ${patch.weight} where id = ${levelId} and guild_id = ${guildId}`,
  );
  invalidate(guildId);
}

/** Les réglages de commandes liés au niveau sont supprimés ; les modules reviennent à leur valeur par défaut. */
export async function deleteLevel(guildId: string, levelId: string) {
  await sql()`delete from bot_permission_levels where id = ${levelId} and guild_id = ${guildId}`;
  invalidate(guildId);
}

/** Remplace l'ensemble des rôles liés à un niveau. */
export async function setLevelRoles(guildId: string, levelId: string, roleIds: string[]) {
  await sql().begin(async tx => {
    const [level] = await tx`select id from bot_permission_levels where id = ${levelId} and guild_id = ${guildId}`;
    if (!level) throw new UserError("Ce niveau n'existe plus.");
    await tx`delete from bot_permission_level_roles where level_id = ${levelId}`;
    for (const roleId of new Set(roleIds)) {
      await tx`insert into bot_permission_level_roles (level_id, role_id) values (${levelId}, ${roleId})`;
    }
  });
  invalidate(guildId);
}

export async function addLevelRole(guildId: string, levelId: string, roleId: string) {
  await sql()`insert into bot_permission_level_roles (level_id, role_id) values (${levelId}, ${roleId}) on conflict do nothing`;
  invalidate(guildId);
}

export async function removeLevelRole(guildId: string, levelId: string, roleId: string) {
  await sql()`delete from bot_permission_level_roles where level_id = ${levelId} and role_id = ${roleId}`;
  invalidate(guildId);
}

// ─── Permissions des commandes ──────────────────────────────────────────────

/** `levelId: null` ouvre la commande à tout le monde. */
export async function setCommandLevel(guildId: string, command: string, levelId: string | null) {
  await sql()`
    insert into bot_command_permissions (guild_id, command, level_id) values (${guildId}, ${command}, ${levelId})
    on conflict (guild_id, command) do update set level_id = excluded.level_id
  `;
  invalidate(guildId);
}

/** La commande revient au niveau de son module ou à sa valeur par défaut. */
export async function resetCommandLevel(guildId: string, command: string) {
  await sql()`delete from bot_command_permissions where guild_id = ${guildId} and command = ${command}`;
  invalidate(guildId);
}

// ─── Messages personnalisés ─────────────────────────────────────────────────

export async function setMessage(guildId: string, key: string, content: string) {
  await sql()`
    insert into bot_messages (guild_id, key, content) values (${guildId}, ${key}, ${content})
    on conflict (guild_id, key) do update set content = excluded.content, updated_at = now()
  `;
  invalidate(guildId);
}

export async function resetMessage(guildId: string, key: string) {
  await sql()`delete from bot_messages where guild_id = ${guildId} and key = ${key}`;
  invalidate(guildId);
}

/** Réglages propres à un module (validés par le module lui-même). */
export async function setModuleSettings(guildId: string, module: string, settings: Json) {
  await sql()`
    insert into bot_modules (guild_id, module, settings) values (${guildId}, ${module}, ${sql().json(settings as never)})
    on conflict (guild_id, module) do update set settings = excluded.settings, updated_at = now()
  `;
  invalidate(guildId);
}
