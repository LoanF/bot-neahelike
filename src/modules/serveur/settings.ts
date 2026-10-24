import { z } from "zod";
import { parseModuleSettings } from "@/config/module-settings";
import { getSettings, setModuleSettings, type GuildSettings } from "@/config/store";
import { UserError } from "@/core/errors";
import { renderTemplate } from "@/core/templates";

export const MODULE = "serveur";

const snowflake = z.string().regex(/^\d{17,20}$/);
const messageRef = z.object({ channelId: snowflake, messageId: snowflake });

/** Compteurs affichés dans le nom d'un salon : `{n}` est remplacé par la valeur. */
export const COUNTERS = {
  membres: { label: "Membres", defaultName: "👥 Membres : {n}" },
  joueurs: { label: "Joueurs en jeu", defaultName: "🎮 En jeu : {n}" },
  citoyens: { label: "Citoyens whitelistés", defaultName: "🏛️ Citoyens : {n}" },
} as const;

export type CounterId = keyof typeof COUNTERS;

const counterSchema = z.object({ channelId: snowflake, name: z.string().min(1).max(90) });

/** Textes du rôle soutien : 25 au plus (un menu de Discord), de 2 à 100 caractères. */
export const MAX_SUPPORT_TEXTS = 25;
export const SUPPORT_TEXT_MIN = 2;
export const SUPPORT_TEXT_MAX = 100;

const schema = z.object({
  /** Adresse du serveur FiveM, `ip:port` (port 30120 par défaut). */
  fivemAdresse: z.string().max(100).optional(),
  /** Lien de connexion affiché sous le statut (cfx.re/join/…). */
  fivemLien: z.string().url().max(200).optional(),
  /** Message de statut publié, mis à jour chaque minute. */
  statutMessage: messageRef.optional(),
  compteurs: z.object({ membres: counterSchema.optional(), joueurs: counterSchema.optional(), citoyens: counterSchema.optional() }).optional(),
  /** Rôle soutien : donné à qui porte le tag du serveur ou a l'un des textes dans son statut. */
  soutienRoleId: snowflake.optional(),
  soutienTag: z.boolean().optional(),
  /** Textes autorisés dans le statut personnalisé (lien du Discord, nom du serveur…). */
  soutienTextes: z.array(z.string().min(SUPPORT_TEXT_MIN).max(SUPPORT_TEXT_MAX)).max(MAX_SUPPORT_TEXTS).optional(),
  /** Ancien réglage à un seul texte, repris dans `soutienTextes`. */
  soutienTexte: z.string().min(2).max(100).optional(),
  /** Salon vocal « rejoindre pour créer ». */
  vocalCreateurId: snowflake.optional(),
  vocalNom: z.string().min(1).max(90).optional(),
  vocalLimite: z.number().int().min(0).max(99).optional(),
  /** Salons temporaires créés par le bot, supprimés une fois vides (gardés pour le nettoyage au redémarrage). */
  vocalTemporaires: z.array(snowflake).max(200).optional(),
});

export type ServerSettings = z.infer<typeof schema>;

export const DEFAULT_VOICE_NAME = "🔊 Vocal de {user.name}";

export function serverSettings(settings: GuildSettings): ServerSettings {
  const { soutienTexte, ...data } = parseModuleSettings(MODULE, schema, settings.modules.get(MODULE)?.settings);
  // Ancien texte unique : il devient le premier texte de la liste.
  return soutienTexte ? { ...data, soutienTextes: addSupportText(data.soutienTextes ?? [], soutienTexte) } : data;
}

/**
 * Enregistre les réglages. La liste des vocaux temporaires, tenue par les événements vocaux, est relue juste avant
 * l'écriture pour qu'un réglage du panneau n'efface pas un salon créé entre-temps ; `temporaries` l'écrit telle quelle.
 */
export async function saveServerSettings(settings: GuildSettings, next: ServerSettings, { temporaries = false } = {}) {
  const vocalTemporaires = temporaries ? next.vocalTemporaires : serverSettings(await getSettings(settings.guildId)).vocalTemporaires;
  await setModuleSettings(settings.guildId, MODULE, schema.parse({ ...next, vocalTemporaires }));
}

/** Adresse FiveM saisie : hôte (IP ou nom) et port, 30120 par défaut. */
export function parseAddress(input: string): { host: string; port: number } {
  const value = input.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const match = /^([a-z0-9.-]+)(?::(\d{1,5}))?$/i.exec(value);
  const port = Number(match?.[2] ?? 30120);
  if (!match || port < 1 || port > 65535) throw new UserError("Adresse invalide : indiquez l'IP ou le nom du serveur, et le port si ce n'est pas 30120 (par exemple 51.75.12.34:30120).");
  return { host: match[1]!.toLowerCase(), port };
}

export interface FivemStatus {
  online: boolean;
  players: number;
  max: number;
  hostname?: string;
}

/** Lit la réponse de `dynamic.json` d'un serveur FiveM ; une réponse inattendue compte comme hors ligne. */
export function parseDynamic(body: unknown): FivemStatus {
  const data = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const players = Number(data.clients);
  const max = Number(data.sv_maxclients);
  if (data.clients === undefined || !Number.isFinite(players) || !Number.isFinite(max)) return { online: false, players: 0, max: 0 };
  const hostname = typeof data.hostname === "string" ? stripColors(data.hostname).trim() || undefined : undefined;
  return { online: true, players, max, ...(hostname && { hostname }) };
}

/** Retire les codes couleur FiveM (^1, ^7…) d'un nom de serveur. */
export function stripColors(text: string): string {
  return text.replace(/\^\d/g, "");
}

/** Nom d'un salon compteur, borné à la limite de Discord (100 caractères). */
export function counterName(template: string, value: number): string {
  return renderTemplate(template, { n: value }).slice(0, 100);
}

/** Nom d'un salon vocal temporaire. */
export function voiceName(template: string | undefined, user: { displayName: string; username: string }): string {
  const name = renderTemplate(template ?? DEFAULT_VOICE_NAME, { "user.name": user.displayName, "user.tag": user.username }).trim();
  return (name || user.displayName).slice(0, 100);
}

interface SupportCheck {
  guildId: string;
  /** Tag de serveur porté par le membre (profil Discord). */
  primaryGuild?: { identityGuildId?: string | null; identityEnabled?: boolean | null } | null;
  /** Texte du statut personnalisé. */
  customStatus?: string | null;
}

/** Comparaison des textes de statut : sans majuscules ni accents, espaces resserrés. */
export function normalizeStatus(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Ajoute un texte autorisé ; refuse un texte trop court, trop long, en double ou au-delà de la limite. */
export function addSupportText(texts: string[], input: string): string[] {
  const text = input.trim().replace(/\s+/g, " ");
  if (text.length < SUPPORT_TEXT_MIN || text.length > SUPPORT_TEXT_MAX) {
    throw new UserError(`Un texte doit faire entre ${SUPPORT_TEXT_MIN} et ${SUPPORT_TEXT_MAX} caractères.`);
  }
  if (texts.some(existing => normalizeStatus(existing) === normalizeStatus(text))) return texts;
  if (texts.length >= MAX_SUPPORT_TEXTS) throw new UserError(`${MAX_SUPPORT_TEXTS} textes au plus : retirez-en un d'abord.`);
  return [...texts, text];
}

/** Retire un texte autorisé (sans tenir compte des majuscules ni des accents). */
export function removeSupportText(texts: string[], input: string): string[] {
  const kept = texts.filter(existing => normalizeStatus(existing) !== normalizeStatus(input));
  if (kept.length === texts.length) throw new UserError(`« ${input} » ne fait pas partie des textes du rôle soutien.`);
  return kept;
}

/** Le membre mérite-t-il le rôle soutien ? Tag du serveur affiché, ou l'un des textes autorisés dans son statut. */
export function supports(server: Pick<ServerSettings, "soutienTag" | "soutienTextes">, member: SupportCheck): boolean {
  const tag = Boolean(server.soutienTag && member.primaryGuild?.identityEnabled && member.primaryGuild.identityGuildId === member.guildId);
  const status = member.customStatus ? normalizeStatus(member.customStatus) : "";
  const text = Boolean(status && server.soutienTextes?.some(allowed => status.includes(normalizeStatus(allowed))));
  return tag || text;
}
