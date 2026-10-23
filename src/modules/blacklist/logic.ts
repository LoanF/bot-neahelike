export const MODULE = "blacklist";

/** Entrées par page de la liste ; c'est aussi le contenu du menu « Lever ». */
export const PAGE_SIZE = 10;

const SNOWFLAKE = /^\d{17,20}$/;

/** ID Discord saisi à la main ; accepte aussi une mention `<@123>`. `null` si ce n'est pas un ID. */
export function parseDiscordId(input: string | null | undefined): string | null {
  const text = input?.trim().replace(/^<@!?(\d+)>$/, "$1") ?? "";
  return SNOWFLAKE.test(text) ? text : null;
}

/** Raison facultative : vide devient `null`, comme sur le site. */
export function cleanBlacklistReason(reason: string | null | undefined): string | null {
  const text = reason?.trim();
  return text ? text.slice(0, 500) : null;
}

export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

/** Page ramenée dans les bornes (la liste a pu rétrécir entre deux clics). */
export function clampPage(page: number, total: number): number {
  if (!Number.isInteger(page) || page < 0) return 0;
  return Math.min(page, pageCount(total) - 1);
}

export const SOURCE_LABELS: Record<string, string> = { site: "Site", bot: "Discord" };
