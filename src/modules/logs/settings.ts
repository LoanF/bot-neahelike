import { z } from "zod";
import { setModuleSettings, type GuildSettings } from "@/config/store";
import { LOG_TYPES, type LogTypeId } from "./types";

export const MODULE = "logs";

const known = new Set<string>(LOG_TYPES.map(type => type.id));

const schema = z.object({
  /** Salon de chaque type de log ; un type absent est désactivé. */
  salons: z.record(z.string(), z.string().regex(/^\d{17,20}$/)).default({}),
});

export type LogSettings = { salons: Partial<Record<LogTypeId, string>> };

/** Réglages des logs ; les types inconnus ou les valeurs invalides en base sont ignorés. */
export function logSettings(settings: GuildSettings): LogSettings {
  const parsed = schema.safeParse(settings.modules.get(MODULE)?.settings ?? {});
  if (!parsed.success) return { salons: {} };
  return { salons: Object.fromEntries(Object.entries(parsed.data.salons).filter(([type]) => known.has(type))) };
}

/** Envoie les types donnés dans un salon (`null` : les désactive). */
export async function routeLogs(settings: GuildSettings, types: readonly LogTypeId[], channelId: string | null) {
  const salons = { ...logSettings(settings).salons };
  for (const type of types) {
    if (channelId) salons[type] = channelId;
    else delete salons[type];
  }
  await setModuleSettings(settings.guildId, MODULE, { salons });
}

/** Regroupe les types par salon, pour le récapitulatif. */
export function byChannel(salons: LogSettings["salons"]): Map<string, LogTypeId[]> {
  const result = new Map<string, LogTypeId[]>();
  for (const type of LOG_TYPES) {
    const channelId = salons[type.id];
    if (!channelId) continue;
    result.set(channelId, [...(result.get(channelId) ?? []), type.id]);
  }
  return result;
}
