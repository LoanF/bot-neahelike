import type { z } from "zod";
import { logger } from "@/logger";

type Def = { type: string; innerType?: z.ZodType; element?: z.ZodType; valueType?: z.ZodType };
const defOf = (schema: z.ZodType) => (schema as unknown as { _zod: { def: Def } })._zod.def;

/** Schéma « nu » d'un champ, sous ses `default`, `optional`, `nullable`. */
function unwrap(schema: z.ZodType): z.ZodType {
  let current = schema;
  for (let def = defOf(current); def.innerType && ["default", "optional", "nullable", "prefault"].includes(def.type); def = defOf(current)) current = def.innerType;
  return current;
}

/** Valeur d'un champ, débarrassée des éléments invalides d'une liste ou d'un dictionnaire ; `undefined` si rien n'est récupérable. */
function salvage(field: z.ZodType, value: unknown): unknown {
  const direct = field.safeParse(value);
  if (direct.success) return direct.data;
  const bare = defOf(unwrap(field));
  let cleaned: unknown;
  if (bare.type === "array" && bare.element && Array.isArray(value)) cleaned = value.filter(item => bare.element!.safeParse(item).success);
  else if (bare.type === "record" && bare.valueType && value && typeof value === "object" && !Array.isArray(value)) {
    cleaned = Object.fromEntries(Object.entries(value).filter(([, item]) => bare.valueType!.safeParse(item).success));
  } else return undefined;
  const retried = field.safeParse(cleaned);
  return retried.success ? retried.data : undefined;
}

const warned = new Set<string>();

/**
 * Réglages d'un module lus en base. Une valeur invalide (édition à la main, schéma resserré depuis) n'emporte plus tout
 * le réglage : seul le champ, ou l'élément de liste, en cause est ignoré. Sinon le prochain enregistrement, parti d'un
 * réglage vide, effacerait tous les autres.
 */
export function parseModuleSettings<S extends z.ZodObject>(module: string, schema: S, raw: unknown): z.infer<S> {
  const full = schema.safeParse(raw ?? {});
  if (full.success) return full.data;
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const kept: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(schema.shape as Record<string, z.ZodType>)) {
    if (!(key in source)) continue;
    const value = salvage(field, source[key]);
    if (value !== undefined) kept[key] = value;
  }
  const key = `${module}:${JSON.stringify(full.error.issues.map(issue => issue.path))}`;
  if (!warned.has(key)) {
    warned.add(key);
    logger.warn({ module, champs: full.error.issues.map(issue => issue.path.join(".")) }, "Réglages invalides en base : les valeurs en cause sont ignorées");
  }
  const retried = schema.safeParse(kept);
  return retried.success ? retried.data : schema.parse({});
}
