import { DiscordAPIError, RESTJSONErrorCodes, type Guild, type Message } from "discord.js";

/** Message publié par le bot et gardé dans les réglages (panneau, règlement, statut…). */
export interface MessageRef {
  channelId: string;
  messageId: string;
}

const GONE = new Set<number>([RESTJSONErrorCodes.UnknownMessage, RESTJSONErrorCodes.UnknownChannel, RESTJSONErrorCodes.MissingAccess]);

/** Erreur Discord qui prouve que le message ou son salon n'existe plus (ou n'est plus accessible). */
export function isGone(error: unknown): boolean {
  return error instanceof DiscordAPIError && typeof error.code === "number" && GONE.has(error.code);
}

/**
 * Relit un message publié. `"supprime"` seulement quand Discord confirme qu'il n'existe plus ;
 * `null` pour une erreur passagère (panne, limite de débit) : la référence doit alors être gardée.
 */
export async function fetchPublished(guild: Guild, ref: MessageRef): Promise<Message | "supprime" | null> {
  try {
    const channel = guild.channels.cache.get(ref.channelId) ?? (await guild.channels.fetch(ref.channelId));
    if (!channel?.isTextBased()) return "supprime";
    return await channel.messages.fetch(ref.messageId);
  } catch (error) {
    return isGone(error) ? "supprime" : null;
  }
}
