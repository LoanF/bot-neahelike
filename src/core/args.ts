export interface Token {
  value: string;
  /** Position du début de l'argument dans la ligne, pour reprendre le texte brut d'une option « reste ». */
  index: number;
}

/** Découpe une ligne de commande en arguments ; les guillemets regroupent plusieurs mots. */
export function tokenizeWithIndex(input: string): Token[] {
  const pattern = /"([^"]*)"|«\s*([^»]*?)\s*»|(\S+)/g;
  return [...input.matchAll(pattern)].map(match => ({ value: match[1] ?? match[2] ?? match[3] ?? "", index: match.index }));
}

export function tokenize(input: string): string[] {
  return tokenizeWithIndex(input).map(token => token.value);
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

/** Valeur d'un choix fixe, reconnue par sa valeur ou son libellé, sans tenir compte de la casse. */
export function normalizeChoice(choices: { name: string; value: string }[], raw: string): string | null {
  const key = raw.toLowerCase();
  return choices.find(choice => choice.value.toLowerCase() === key || choice.name.toLowerCase() === key)?.value ?? null;
}
