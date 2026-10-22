import { GatewayRateLimitError, type Collection, type Guild, type GuildMember } from "discord.js";
import { logger } from "@/logger";

/** Discord n'accepte qu'une demande de la liste des membres toutes les 30 secondes par serveur. */
const MIN_INTERVAL_MS = 30_000;

const pending = new Map<string, Promise<Collection<string, GuildMember>>>();
const loadedAt = new Map<string, number>();

async function fetchWithRetry(guild: Guild): Promise<Collection<string, GuildMember>> {
  try {
    return await guild.members.fetch();
  } catch (error) {
    if (!(error instanceof GatewayRateLimitError)) throw error;
    // Demande refusée par la limite de Discord : on attend le délai indiqué, puis on réessaie une fois.
    const waitMs = Math.ceil(error.data.retry_after * 1000) + 500;
    logger.info({ attente: waitMs }, "Liste des membres limitée par Discord, nouvel essai après le délai");
    await new Promise(resolve => setTimeout(resolve, waitMs));
    return guild.members.fetch();
  }
}

/**
 * Charge une fois la liste complète des membres, partagée par tous les modules.
 * Ensuite, l'intent « Server Members » tient le cache à jour : les appels suivants le renvoient directement.
 * `refresh` (après une coupure de la passerelle, ou `/site resync`) recharge la liste, au plus toutes les 30 secondes.
 */
export async function loadAllMembers(guild: Guild, { refresh = false } = {}): Promise<Collection<string, GuildMember>> {
  const running = pending.get(guild.id);
  if (running) return running;
  const last = loadedAt.get(guild.id);
  if (last !== undefined && (!refresh || Date.now() - last < MIN_INTERVAL_MS)) return guild.members.cache;

  const request = fetchWithRetry(guild)
    .then(members => {
      loadedAt.set(guild.id, Date.now());
      return members;
    })
    .finally(() => pending.delete(guild.id));
  pending.set(guild.id, request);
  return request;
}

/** Oublie l'état du chargement (tests). */
export function resetMembersLoading() {
  pending.clear();
  loadedAt.clear();
}
