/** Découpe une ligne de commande en arguments ; les guillemets regroupent plusieurs mots. */
export function tokenize(input: string): string[] {
  const tokens: string[] = [];
  const pattern = /"([^"]*)"|«\s*([^»]*?)\s*»|(\S+)/g;
  for (const match of input.matchAll(pattern)) tokens.push(match[1] ?? match[2] ?? match[3] ?? "");
  return tokens;
}

/** Extrait un identifiant Discord d'une mention (`<@123>`, `<@!123>`, `<@&123>`, `<#123>`) ou d'un identifiant brut. */
export function parseSnowflake(token: string): string | null {
  const match = /^(?:<(?:@[!&]?|#))?(\d{17,20})>?$/.exec(token);
  return match?.[1] ?? null;
}

const TRUE = new Set(["oui", "o", "vrai", "true", "on", "1", "activer"]);
const FALSE = new Set(["non", "n", "faux", "false", "off", "0", "desactiver", "désactiver"]);

export function parseBoolean(token: string): boolean | null {
  const value = token.toLowerCase();
  if (TRUE.has(value)) return true;
  if (FALSE.has(value)) return false;
  return null;
}

export function parseInteger(token: string): number | null {
  return /^-?\d+$/.test(token) ? Number.parseInt(token, 10) : null;
}

/** `#d1a64a` ou `d1a64a` → `#d1a64a` ; `null` si invalide. */
export function normalizeHexColor(input: string): string | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(input.trim());
  return match ? `#${match[1]!.toLowerCase()}` : null;
}

export function hexToInt(hex: string): number {
  return Number.parseInt(hex.replace("#", ""), 16);
}
