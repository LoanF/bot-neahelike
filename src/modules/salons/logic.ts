import { HOUR, parseDuration } from "@/core/duration";
import { UserError } from "@/core/errors";

export const MODULE = "salons";

/** Discord limite le mode lent à 6 heures. */
export const MAX_SLOWMODE_MS = 6 * HOUR;
/** Un message supprimé reste consultable par /snipe pendant 10 minutes. */
export const SNIPE_TTL_MS = 10 * 60 * 1000;
/** Discord supprime en masse 100 messages au plus, de moins de 14 jours. */
export const MAX_CLEAR = 100;
export const BULK_DELETE_MAX_AGE_MS = 14 * 24 * HOUR;

/** Délai du mode lent en secondes ; « 0 » ou « off » le désactive. */
export function parseSlowmode(input: string): number {
  const text = input.trim().toLowerCase();
  if (["0", "off", "non", "aucun", "desactiver", "désactiver"].includes(text)) return 0;
  return Math.round(parseDuration(text, { min: 1000, max: MAX_SLOWMODE_MS, what: "Le mode lent" }) / 1000);
}

/** Messages qu'une suppression en masse peut effacer : récents (moins de 14 jours), non épinglés, et de ce membre si précisé. */
export function deletable<T extends { createdTimestamp: number; author: { id: string }; pinned: boolean }>(messages: T[], count: number, authorId?: string, now = Date.now()): T[] {
  if (count < 1 || count > MAX_CLEAR) throw new UserError(`Indiquez un nombre entre 1 et ${MAX_CLEAR}.`);
  return messages
    .filter(message => !message.pinned && now - message.createdTimestamp < BULK_DELETE_MAX_AGE_MS - 60 * 1000)
    .filter(message => !authorId || message.author.id === authorId)
    .slice(0, count);
}

export interface Sniped {
  authorId: string;
  authorTag: string;
  avatarUrl: string;
  content: string;
  attachments: string[];
  createdAt: number;
  deletedAt: number;
}

/** Dernier message supprimé de chaque salon, gardé en mémoire seulement et oublié après 10 minutes. */
export class SnipeStore {
  private readonly items = new Map<string, Sniped>();

  constructor(private readonly ttl = SNIPE_TTL_MS) {}

  remember(channelId: string, sniped: Sniped) {
    if (!sniped.content && sniped.attachments.length === 0) return;
    this.items.set(channelId, sniped);
  }

  get(channelId: string, now = Date.now()): Sniped | undefined {
    const item = this.items.get(channelId);
    if (item && now - item.deletedAt > this.ttl) {
      this.items.delete(channelId);
      return undefined;
    }
    return item;
  }

  /** Oublie les messages trop anciens, pour ne rien garder plus que nécessaire. */
  prune(now = Date.now()) {
    for (const [channelId, item] of this.items) if (now - item.deletedAt > this.ttl) this.items.delete(channelId);
  }

  get size() {
    return this.items.size;
  }
}
