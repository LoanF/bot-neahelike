import { PermissionFlagsBits, type Guild } from "discord.js";
import type { GuildSettings } from "@/config/store";
import { UserError } from "@/core/errors";
import { draftMissing, pickWinners, type GiveawayDraft } from "./logic";
import { cancelGiveaway, createGiveaway, dropGiveaway, setGiveawayMessage, setWinners, type Giveaway } from "./store";
import { announce, eligibleEntries, giveawayPayload, refreshGiveaway } from "./ui";

/** Publie le brouillon : ligne en base, puis message avec le bouton Participer. Rien ne reste si l'envoi échoue. */
export async function publishGiveaway(guild: Guild, settings: GuildSettings, draft: GiveawayDraft, hostId: string): Promise<Giveaway> {
  const missing = draftMissing(draft);
  if (missing.length) throw new UserError(`Il manque ${missing.join(" et ")}.`);
  const channel = guild.channels.cache.get(draft.channelId!);
  if (!channel?.isSendable()) throw new UserError("Ce salon ne peut pas recevoir de messages.");
  const me = guild.members.me;
  if (!me || !channel.permissionsFor(me).has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
    throw new UserError(`Le bot ne peut pas publier dans ${channel} : il lui faut Voir le salon, Envoyer des messages et Intégrer des liens.`);
  }

  const created = await createGiveaway({
    guildId: guild.id,
    channelId: channel.id,
    prize: draft.prize!,
    description: draft.description,
    winnerCount: draft.winners,
    requiredRoleId: draft.roleId,
    hostId,
    endsAt: new Date(Date.now() + draft.durationMs),
  });
  let sent: Awaited<ReturnType<typeof channel.send>> | undefined;
  try {
    sent = await channel.send(giveawayPayload(settings, created, 0));
    await setGiveawayMessage(created.id, sent.id);
  } catch (error) {
    // Pas de message orphelin : un bouton sans giveaway en base ne mènerait nulle part.
    await sent?.delete().catch(() => {});
    await dropGiveaway(created.id);
    throw new UserError(`Publication impossible dans ${channel} (${error instanceof Error ? error.message : "erreur inconnue"}).`);
  }
  return { ...created, message_id: sent.id };
}

/** Nouveau tirage d'un giveaway terminé, en écartant les gagnants du dernier tirage. */
export async function rerollGiveaway(guild: Guild, giveaway: Giveaway, count: number): Promise<string[]> {
  if (giveaway.status !== "termine") throw new UserError("Seul un giveaway terminé peut être relancé.");
  const winners = pickWinners(await eligibleEntries(guild, giveaway), count, giveaway.winner_ids);
  if (winners.length === 0) throw new UserError("Plus aucun participant éligible pour un nouveau tirage.");
  const updated = await setWinners(giveaway.id, winners);
  if (updated) await announce(guild, updated, winners, true);
  return winners;
}

/** Annule un giveaway en cours et met à jour son message. */
export async function cancel(guild: Guild, giveaway: Giveaway): Promise<Giveaway> {
  const cancelled = await cancelGiveaway(giveaway.id);
  if (!cancelled) throw new UserError("Ce giveaway est déjà clos.");
  await refreshGiveaway(guild, cancelled.id);
  return cancelled;
}
