import { sql } from "./index";

/** Tables dont le bot a besoin pour démarrer. Toutes sont créées par les migrations du site (voir le README, « Base de données »). */
export const REQUIRED_TABLES = [
  "users",
  "events",
  "bot_guild_config",
  "bot_modules",
  "bot_permission_levels",
  "bot_permission_level_roles",
  "bot_command_permissions",
  "bot_messages",
] as const;

/** Tables de la liste absentes de la base. */
export async function missingTables(tables: readonly string[]): Promise<string[]> {
  if (tables.length === 0) return [];
  const rows = await sql()<{ table_name: string }[]>`
    select table_name from information_schema.tables
    where table_schema = 'public' and table_name in ${sql()(tables)}
  `;
  const present = new Set(rows.map(row => row.table_name));
  return tables.filter(table => !present.has(table));
}

/** Vérifie au démarrage que la base contient les tables indispensables. */
export async function checkDatabase() {
  const missing = await missingTables(REQUIRED_TABLES);
  if (missing.length > 0) {
    throw new Error(
      `Tables absentes de la base : ${missing.join(", ")}. Elles se créent avec les migrations du dépôt du site (\`pnpm db:migrate\`) : le bot ne modifie jamais la structure de la base.`,
    );
  }
}
