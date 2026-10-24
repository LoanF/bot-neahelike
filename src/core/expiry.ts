import { z } from "zod";
import { parseModuleSettings } from "@/config/module-settings";
import type { GuildSettings } from "@/config/store";
import type { Payload } from "./context";

/**
 * Effacement des panneaux restés sans clic. Un panneau privé (`/`) ne peut être effacé qu'avec le jeton
 * de la dernière interaction, valable 15 minutes : chaque clic qui met le panneau à jour en donne un nouveau.
 * Un panneau ouvert au préfixe est un message normal, effaçable à tout moment.
 */

/** Délai par défaut, en minutes. */
export const DEFAULT_PANEL_TTL_MINUTES = 10;
/** Choix proposés dans `/config` › Général (0 : jamais). */
export const PANEL_TTL_CHOICES = [0, 2, 5, 10, 15] as const;

/** Durée de vie d'un jeton d'interaction Discord, et marge pour ne pas l'utiliser à la dernière seconde. */
export const TOKEN_LIFETIME_MS = 15 * 60 * 1000;
const TOKEN_MARGIN_MS = 30 * 1000;

interface Tracked {
  timer: NodeJS.Timeout;
  close: () => Promise<unknown>;
  /** Heure limite pour fermer avec `close` (fin du jeton), `Infinity` pour un message normal. */
  closeBy: number;
}

const panels = new Map<string, Tracked>();

/** Réglages du module « config » rangés dans `bot_modules.settings`. */
export const configSettingsSchema = z.object({
  /** Effacement des panneaux restés sans clic, en minutes (0 : jamais). */
  panneauxMinutes: z.union(PANEL_TTL_CHOICES.map(minutes => z.literal(minutes))).optional(),
});

export function configSettings(settings: GuildSettings): z.infer<typeof configSettingsSchema> {
  return parseModuleSettings("config", configSettingsSchema, settings.modules.get("config")?.settings);
}

/** Délai réglé pour le serveur, en millisecondes (0 : jamais). */
export function panelTtlMs(settings: GuildSettings): number {
  return (configSettings(settings).panneauxMinutes ?? DEFAULT_PANEL_TTL_MINUTES) * 60 * 1000;
}

/** Une réponse est un panneau si elle porte au moins un bouton ou un menu (pas seulement des liens). */
export function isPanel(payload: Payload): boolean {
  return (payload.components ?? []).some(item => {
    const json = "toJSON" in item ? item.toJSON() : item;
    return (json as { components?: { custom_id?: string }[] }).components?.some(component => Boolean(component.custom_id)) ?? false;
  });
}

/** Moment où effacer : après le délai, sans dépasser la fin du jeton. */
export function dueAt(now: number, ttlMs: number, closeBy: number): number {
  return Math.min(now + ttlMs, closeBy - TOKEN_MARGIN_MS);
}

function schedule(messageId: string, close: () => Promise<unknown>, closeBy: number, ttlMs: number, now: number) {
  clearTimeout(panels.get(messageId)?.timer);
  const timer = setTimeout(
    () => {
      panels.delete(messageId);
      // Déjà fermé à la main, ou supprimé : rien à faire.
      close().catch(() => {});
    },
    Math.max(0, dueAt(now, ttlMs, closeBy) - now),
  );
  timer.unref();
  panels.set(messageId, { timer, close, closeBy });
}

/** Suit un panneau qui vient d'être affiché. */
export function trackPanel(messageId: string, close: () => Promise<unknown>, closeBy: number, ttlMs: number, now = Date.now()) {
  if (ttlMs <= 0) return;
  schedule(messageId, close, closeBy, ttlMs, now);
}

/**
 * Un clic sur le panneau remet le délai à zéro. Avec un nouveau jeton (le panneau a été mis à jour),
 * il remplace l'ancien ; sinon l'ancien sert jusqu'à sa fin.
 */
export function touchPanel(messageId: string, ttlMs: number, renewed?: { close: () => Promise<unknown>; closeBy: number }, now = Date.now()) {
  const tracked = panels.get(messageId);
  if (!tracked) return;
  if (ttlMs <= 0) {
    clearTimeout(tracked.timer);
    panels.delete(messageId);
    return;
  }
  const next = renewed && renewed.closeBy >= tracked.closeBy ? renewed : tracked;
  schedule(messageId, next.close, next.closeBy, ttlMs, now);
}

export function isTracked(messageId: string): boolean {
  return panels.has(messageId);
}
