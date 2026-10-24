import { z } from "zod";
import { parseModuleSettings } from "@/config/module-settings";
import { setModuleSettings, type GuildSettings } from "@/config/store";

export const MODULE = "site";

const uuid = z.string().regex(/^[0-9a-f-]{36}$/i);

/**
 * Position de lecture du journal. `recent` : événements déjà traités dans la fenêtre de rattrapage,
 * pour relire les dernières minutes sans rien republier (un événement peut être validé après un plus récent).
 */
const cursor = z.object({ at: z.string(), id: uuid, recent: z.array(z.object({ id: uuid, at: z.string() })).max(500).optional() });

const schema = z.object({
  /** Salon où le staff suit le parcours des joueurs. */
  salonLogs: z.string().regex(/^\d{17,20}$/).optional(),
  /** Dernier événement du journal du site relayé dans le salon de logs. */
  journal: cursor.optional(),
});

export type JournalCursor = z.infer<typeof cursor>;

export type SiteSettings = z.infer<typeof schema>;

/** Réglages du module ; une valeur invalide en base est ignorée plutôt que de bloquer le bot. */
export function siteSettings(settings: GuildSettings): SiteSettings {
  return parseModuleSettings(MODULE, schema, settings.modules.get(MODULE)?.settings);
}

export async function updateSiteSettings(settings: GuildSettings, patch: Partial<SiteSettings>) {
  await setModuleSettings(settings.guildId, MODULE, schema.parse({ ...siteSettings(settings), ...patch }));
}
