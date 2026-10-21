import { EmbedBuilder } from "discord.js";
import { logType, type LogTypeId } from "./types";

/** Coupe un texte à la limite d'un champ d'embed. */
export function truncate(text: string, max = 1024): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

const time = (date: Date, style: "R" | "f" = "R") => `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
const who = (id: string, tag?: string | null) => (tag ? `<@${id}> · ${tag}` : `<@${id}>`);
const by = (executorId?: string | null) => (executorId ? who(executorId) : "Inconnu");

function base(type: LogTypeId, color: number, title: string): EmbedBuilder {
  const definition = logType(type)!;
  return new EmbedBuilder().setColor(color).setTitle(`${definition.emoji} ${title}`).setTimestamp();
}

// ─── Messages ───────────────────────────────────────────────────────────────

export function messageDeleted(
  color: number,
  data: { authorId?: string | null; authorTag?: string | null; channelId: string; content?: string | null; attachments: string[] },
): EmbedBuilder {
  const content =
    data.content === undefined || data.content === null ? "*Contenu inconnu : message envoyé avant le dernier démarrage du bot.*" : data.content || "*Aucun texte*";
  const result = base("message-supprime", color, "Message supprimé").addFields(
    { name: "Auteur", value: data.authorId ? who(data.authorId, data.authorTag) : "Inconnu", inline: true },
    { name: "Salon", value: `<#${data.channelId}>`, inline: true },
    { name: "Contenu", value: truncate(content) },
  );
  if (data.attachments.length) result.addFields({ name: "Pièces jointes", value: truncate(data.attachments.join("\n")) });
  return result;
}

export function messageEdited(
  color: number,
  data: { authorId: string; authorTag?: string | null; channelId: string; before?: string | null; after: string; url: string },
): EmbedBuilder {
  return base("message-modifie", color, "Message modifié")
    .setDescription(`[Aller au message](${data.url})`)
    .addFields(
      { name: "Auteur", value: who(data.authorId, data.authorTag), inline: true },
      { name: "Salon", value: `<#${data.channelId}>`, inline: true },
      { name: "Avant", value: truncate(data.before ?? "*Inconnu : message envoyé avant le dernier démarrage du bot.*") || "*Aucun texte*" },
      { name: "Après", value: truncate(data.after) || "*Aucun texte*" },
    );
}

export function messagesPurged(color: number, data: { channelId: string; count: number; saved: number }): EmbedBuilder {
  return base("messages-purges", color, "Suppression en masse").addFields(
    { name: "Salon", value: `<#${data.channelId}>`, inline: true },
    { name: "Messages", value: String(data.count), inline: true },
    { name: "Copie", value: data.saved ? `${data.saved} message(s) connu(s) du bot, joints en fichier.` : "Aucun message connu du bot." },
  );
}

/** Copie lisible des messages effacés, du plus ancien au plus récent. */
export function purgeTranscript(messages: { createdAt: Date; authorTag: string; content: string }[]): string {
  return [...messages]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map(message => `[${message.createdAt.toISOString()}] ${message.authorTag} : ${message.content}`)
    .join("\n");
}

// ─── Membres ────────────────────────────────────────────────────────────────

export function memberJoined(color: number, data: { id: string; tag: string; createdAt: Date; memberCount: number; avatarUrl: string }): EmbedBuilder {
  return base("arrivee", color, "Arrivée")
    .setThumbnail(data.avatarUrl)
    .addFields(
      { name: "Membre", value: who(data.id, data.tag), inline: true },
      { name: "Compte créé", value: time(data.createdAt), inline: true },
      { name: "Membres", value: String(data.memberCount), inline: true },
    );
}

export function memberLeft(color: number, data: { id: string; tag?: string | null; joinedAt?: Date | null; roleIds: string[]; memberCount: number }): EmbedBuilder {
  return base("depart", color, "Départ").addFields(
    { name: "Membre", value: who(data.id, data.tag), inline: true },
    { name: "Arrivé", value: data.joinedAt ? time(data.joinedAt) : "Inconnu", inline: true },
    { name: "Membres", value: String(data.memberCount), inline: true },
    { name: "Rôles", value: truncate(data.roleIds.map(id => `<@&${id}>`).join(" ") || "*Aucun*") },
  );
}

export function nicknameChanged(color: number, data: { id: string; before?: string | null; after?: string | null; executorId?: string | null }): EmbedBuilder {
  return base("pseudo", color, "Pseudo modifié").addFields(
    { name: "Membre", value: who(data.id), inline: true },
    { name: "Par", value: by(data.executorId), inline: true },
    { name: "Avant", value: data.before ?? "*Aucun*", inline: true },
    { name: "Après", value: data.after ?? "*Aucun*", inline: true },
  );
}

export function memberRolesChanged(color: number, data: { id: string; added: string[]; removed: string[]; executorId?: string | null }): EmbedBuilder {
  const result = base("roles-membre", color, "Rôles modifiés").addFields(
    { name: "Membre", value: who(data.id), inline: true },
    { name: "Par", value: by(data.executorId), inline: true },
  );
  if (data.added.length) result.addFields({ name: "Ajoutés", value: truncate(data.added.map(id => `<@&${id}>`).join(" ")) });
  if (data.removed.length) result.addFields({ name: "Retirés", value: truncate(data.removed.map(id => `<@&${id}>`).join(" ")) });
  return result;
}

export function boosted(color: number, data: { id: string; boosts: number }): EmbedBuilder {
  return base("boost", color, "Nouveau boost").addFields(
    { name: "Membre", value: who(data.id), inline: true },
    { name: "Boosts du serveur", value: String(data.boosts), inline: true },
  );
}

// ─── Modération ─────────────────────────────────────────────────────────────

export function sanction(
  color: number,
  type: "bannissement" | "expulsion" | "exclusion",
  title: string,
  data: { targetId: string; targetTag?: string | null; executorId?: string | null; reason?: string | null; until?: Date | null },
): EmbedBuilder {
  const result = base(type, color, title).addFields(
    { name: "Membre", value: who(data.targetId, data.targetTag), inline: true },
    { name: "Par", value: by(data.executorId), inline: true },
  );
  if (data.until) result.addFields({ name: "Jusqu'à", value: `${time(data.until, "f")} (${time(data.until)})`, inline: true });
  return result.addFields({ name: "Raison", value: truncate(data.reason ?? "*Aucune raison indiquée*") });
}

// ─── Vocal ──────────────────────────────────────────────────────────────────

/** `null` si le membre n'a pas changé de salon (micro coupé, partage d'écran…). */
export function voiceMoved(color: number, data: { id: string; from?: string | null; to?: string | null }): EmbedBuilder | null {
  if (data.from === data.to) return null;
  const title = !data.from ? "Entrée en vocal" : !data.to ? "Sortie du vocal" : "Changement de salon vocal";
  const result = base("vocal", color, title).addFields({ name: "Membre", value: who(data.id), inline: true });
  if (data.from) result.addFields({ name: "Depuis", value: `<#${data.from}>`, inline: true });
  if (data.to) result.addFields({ name: "Vers", value: `<#${data.to}>`, inline: true });
  return result;
}

// ─── Serveur ────────────────────────────────────────────────────────────────

const CHANGE_LABELS: Record<string, string> = {
  name: "Nom",
  topic: "Sujet",
  nsfw: "Contenu sensible",
  rate_limit_per_user: "Mode lent (secondes)",
  parent_id: "Catégorie",
  bitrate: "Débit audio",
  user_limit: "Limite de membres",
  color: "Couleur",
  hoist: "Affiché séparément",
  mentionable: "Mentionnable",
  permissions: "Permissions",
  icon_hash: "Icône",
  unicode_emoji: "Emoji",
  max_uses: "Utilisations max",
  max_age: "Durée (secondes)",
  temporary: "Membre temporaire",
  archived: "Archivé",
  locked: "Verrouillé",
};

export interface Change {
  key: string;
  old?: unknown;
  new?: unknown;
}

function display(key: string, value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  if (key === "color" && typeof value === "number") return `#${value.toString(16).padStart(6, "0")}`;
  if (key === "parent_id" && typeof value === "string") return `<#${value}>`;
  return truncate(String(value), 300);
}

/** Lignes « Champ : avant → après » des changements lisibles ; les autres sont résumés. */
export function describeChanges(changes: Change[]): string {
  const known = changes.filter(change => CHANGE_LABELS[change.key]);
  const others = changes.length - known.length;
  const lines = known.map(change => `**${CHANGE_LABELS[change.key]}** : ${display(change.key, change.old)} → ${display(change.key, change.new)}`);
  if (others > 0) lines.push(`*${others} autre(s) réglage(s) modifié(s)*`);
  return truncate(lines.join("\n") || "*Aucun détail*");
}

export function serverChange(
  color: number,
  type: "salons" | "roles" | "invitations" | "fils",
  title: string,
  data: { subject: string; executorId?: string | null; changes?: Change[]; reason?: string | null },
): EmbedBuilder {
  const result = base(type, color, title).addFields({ name: "Élément", value: data.subject, inline: true }, { name: "Par", value: by(data.executorId), inline: true });
  if (data.changes?.length) result.addFields({ name: "Changements", value: describeChanges(data.changes) });
  if (data.reason) result.addFields({ name: "Raison", value: truncate(data.reason) });
  return result;
}

// ─── Tickets ────────────────────────────────────────────────────────────────

export function ticketEvent(
  color: number,
  title: string,
  data: { number: number; categoryLabel: string; channelId: string; openerId: string; byId?: string | null; reason?: string | null },
): EmbedBuilder {
  const result = base("tickets", color, `${title} · #${String(data.number).padStart(4, "0")}`).addFields(
    { name: "Catégorie", value: data.categoryLabel, inline: true },
    { name: "Salon", value: `<#${data.channelId}>`, inline: true },
    { name: "Ouvert par", value: who(data.openerId), inline: true },
  );
  if (data.byId) result.addFields({ name: "Par", value: who(data.byId), inline: true });
  if (data.reason) result.addFields({ name: "Raison", value: truncate(data.reason) });
  return result;
}

/** Exemple envoyé par le bouton « Envoyer un essai » du panneau. */
export function sample(color: number, type: LogTypeId): EmbedBuilder {
  const definition = logType(type)!;
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(`${definition.emoji} ${definition.label} · essai`)
    .setDescription(`Ce salon reçoit ce type de log : ${definition.description.charAt(0).toLowerCase()}${definition.description.slice(1)}.`)
    .setTimestamp();
}
