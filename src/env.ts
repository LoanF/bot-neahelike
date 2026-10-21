import { z } from "zod";

const snowflake = z.string().regex(/^\d{17,20}$/, "identifiant Discord attendu");

/** Liste d'ID de rôles séparés par des virgules, comme dans le site : un seul rôle de la liste suffit. */
const roleList = z
  .string()
  .transform(value => value.split(",").map(id => id.trim()).filter(Boolean))
  .pipe(z.array(snowflake).min(1));

const schema = z.object({
  DISCORD_BOT_TOKEN: z.string().min(1),
  DISCORD_GUILD_ID: snowflake,
  DATABASE_URL: z.string().url(),
  /** Adresse publique du site (liens vers le portail). */
  SITE_URL: z.string().url().transform(url => url.replace(/\/+$/, "")),
  DISCORD_ROLE_STAFF: roleList,
  DISCORD_ROLE_RECRUTEUR: roleList,
  /** « attente de wl » : candidature validée, en attente de l'entretien vocal. */
  DISCORD_ROLE_ASPIRANT: snowflake.optional(),
  /** « Magistrat (wl) » : whitelisté. */
  DISCORD_ROLE_HELIKEEN: snowflake.optional(),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error"]).default("info"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Variables d'environnement, validées au démarrage : le bot refuse de se lancer si l'une manque. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map(issue => issue.path.join(".")).join(", ");
    throw new Error(`Variables d'environnement invalides ou manquantes : ${missing}. Voir .env.example.`);
  }
  cached = parsed.data;
  return cached;
}
