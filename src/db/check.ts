import { sql } from "./index";

/** Tables dont le bot a besoin. Chacune doit exister dans le schéma du site (voir docs/schema-site.md). */
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
      `Tables absentes de la base : ${missing.join(", ")}. Ajoutez-les au schéma du site (docs/schema-site.md), puis lancez \`pnpm db:migrate\` dans le dépôt du site.`,
    );
  }
}
