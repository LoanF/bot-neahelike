import { z } from "zod";
import { setModuleSettings, type GuildSettings } from "@/config/store";

export const MODULE = "site";

const cursor = z.object({ at: z.string(), id: z.string().regex(/^[0-9a-f-]{36}$/i) });

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
  const parsed = schema.safeParse(settings.modules.get(MODULE)?.settings ?? {});
  return parsed.success ? parsed.data : {};
}

export async function updateSiteSettings(settings: GuildSettings, patch: Partial<SiteSettings>) {
  await setModuleSettings(settings.guildId, MODULE, schema.parse({ ...siteSettings(settings), ...patch }));
}
