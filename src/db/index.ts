import postgres from "postgres";
import { env } from "@/env";

export type { Json, Tables, TablesInsert, TablesUpdate, Enums } from "./database.types";

let client: postgres.Sql | undefined;

/**
 * Connexion à la base du site. Le bot ne crée ni ne modifie jamais la structure :
 * le schéma et les migrations vivent dans le dépôt du site.
 */
export function sql(): postgres.Sql {
  if (!client) {
    client = postgres(env().DATABASE_URL, {
      // prepare: false pour le pooler Supabase (mode transaction).
      prepare: false,
      max: 5,
      // Dates laissées en texte ISO, comme dans les types générés par Supabase.
      types: {
        date: {
          to: 1184,
          from: [1082, 1083, 1114, 1184],
          serialize: (value: unknown) => (value instanceof Date ? value.toISOString() : value),
          parse: (value: string) => value,
        },
      },
      onnotice: () => {},
    });
  }
  return client;
}

export async function closeDatabase() {
  await client?.end({ timeout: 5 });
  client = undefined;
}
