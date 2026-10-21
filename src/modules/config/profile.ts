import { ActivityType, DiscordAPIError, type Client, type Guild, type PresenceStatusData } from "discord.js";
import type { GuildConfig } from "@/config/store";
import { UserError } from "@/core/errors";

export const STATUSES: Record<string, { label: string; value: PresenceStatusData }> = {
  online: { label: "En ligne", value: "online" },
  idle: { label: "Absent", value: "idle" },
  dnd: { label: "Ne pas déranger", value: "dnd" },
  invisible: { label: "Invisible", value: "invisible" },
};

export const ACTIVITIES: Record<string, { label: string; type: ActivityType }> = {
  personnalise: { label: "Statut personnalisé", type: ActivityType.Custom },
  joue: { label: "Joue à", type: ActivityType.Playing },
  regarde: { label: "Regarde", type: ActivityType.Watching },
  ecoute: { label: "Écoute", type: ActivityType.Listening },
  participe: { label: "Participe à", type: ActivityType.Competing },
};

export const statusChoices = Object.entries(STATUSES).map(([value, status]) => ({ name: status.label, value }));
export const activityChoices = Object.entries(ACTIVITIES).map(([value, activity]) => ({ name: activity.label, value }));

/** Statut et activité du bot (communs à tous les serveurs). */
export function applyPresence(client: Client<true>, config: GuildConfig) {
  const status = STATUSES[config.presence_status]?.value ?? "online";
  const activity = ACTIVITIES[config.activity_type] ?? ACTIVITIES.personnalise!;
  const text = config.activity_text;
  client.user.setPresence({
    status,
    activities: text ? [activity.type === ActivityType.Custom ? { type: activity.type, name: "Statut", state: text } : { type: activity.type, name: text }] : [],
  });
}

export function describeActivity(config: GuildConfig): string {
  if (!config.activity_text) return "Aucune";
  return `${ACTIVITIES[config.activity_type]?.label ?? "Statut"} : ${config.activity_text}`;
}

/** Adresse https d'une image, ou `null` pour retirer l'image. */
export function imageUrl(input: string | null): string | null {
  if (input === null) return null;
  try {
    const url = new URL(input);
    if (url.protocol !== "https:") throw new Error();
    return url.toString();
  } catch {
    throw new UserError("L'adresse de l'image doit commencer par https://.");
  }
}

/**
 * Pseudo, bio, avatar et bannière propres au serveur (le nom global du bot est limité à 2 changements par heure).
 * Appliqué sur Discord avant l'enregistrement : rien n'est sauvegardé si Discord refuse.
 */
export async function applyMemberProfile(guild: Guild, patch: { nick?: string | null; bio?: string | null; avatar?: string | null; banner?: string | null }) {
  try {
    await guild.members.editMe({ ...patch, reason: "Profil du bot modifié depuis la configuration" });
  } catch (error) {
    if (error instanceof DiscordAPIError) throw new UserError(`Discord a refusé la modification : ${error.message}`);
    // Image injoignable ou format non reconnu.
    throw new UserError("Impossible de récupérer l'image : vérifiez que l'adresse mène directement à un fichier PNG, JPEG, GIF ou WebP.");
  }
}
