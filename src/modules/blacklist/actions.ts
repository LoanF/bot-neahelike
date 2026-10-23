import { DiscordAPIError, RESTJSONErrorCodes, type Guild, type GuildMember } from "discord.js";
import { getSettings } from "@/config/store";
import { embed } from "@/core/embeds";
import { UserError } from "@/core/errors";
import { logger } from "@/logger";
import { checkHierarchy, targetMember } from "@/modules/moderation/actions";
import { blacklistEntry, recordBlacklist, recordLift, siteRank, type BlacklistEntry } from "./store";

/** Comme sur le site : la blacklist est réservée aux rangs admin et owner (rang lu dans `users.rank`). */
export async function requireAdmin(userId: string) {
  const rank = await siteRank(userId);
  if (rank !== "admin" && rank !== "owner") throw new UserError("La blacklist est réservée aux admins et owners du site.");
}

export interface BlacklistResult {
  entry: BlacklistEntry;
  /** Ce qui n'a pas pu se faire sur Discord ; la ligne en base reste, c'est elle qui fait foi. */
  warnings: string[];
}

const auditReason = (actor: GuildMember, text: string) => `${text} (par ${actor.user.tag})`.slice(0, 512);

/** Inscrit l'ID dans la blacklist partagée, puis bannit du serveur. */
export async function blacklistUser(actor: GuildMember, targetId: string, reason: string | null): Promise<BlacklistResult> {
  const guild = actor.guild;
  if (targetId === actor.id) throw new UserError("Vous ne pouvez pas vous blacklister vous-même.");
  if ((await siteRank(targetId)) === "owner") throw new UserError("Un owner ne peut pas être blacklisté.");
  const member = await targetMember(guild, targetId);
  checkHierarchy(actor, { id: targetId }, member);
  if (member && !member.bannable) throw new UserError("Le bot ne peut pas bannir ce membre (permission « Bannir » ou rôle trop bas).");

  const entry = await recordBlacklist({ discordId: targetId, reason, createdById: actor.id });
  if (!entry) throw new UserError(`<@${targetId}> est déjà blacklisté.`);

  const warnings: string[] = [];
  // Le MP part avant le bannissement : après, le bot ne partage plus de serveur avec lui. MP fermés : tant pis.
  if (member) {
    const settings = await getSettings(guild.id);
    const text = `Vous êtes blacklisté de **${guild.name}** : vous ne pouvez plus rejoindre le serveur ni le site.${reason ? `\n**Raison :** ${reason}` : ""}`;
    await member.send({ embeds: [embed(settings, "bronze").setTitle(`⛔ ${guild.name}`).setDescription(text)] }).catch(() => {});
  }
  try {
    await guild.bans.create(targetId, { reason: auditReason(actor, `Blacklist${reason ? ` : ${reason}` : ""}`) });
  } catch (error) {
    logger.warn({ err: error, target: targetId }, "Bannissement d'un blacklisté impossible");
    warnings.push("le bannissement du serveur a échoué : bannissez-le à la main.");
  }
  return { entry, warnings };
}

/** Retire l'ID de la blacklist, puis lève son bannissement s'il en a un. */
export async function liftBlacklist(actor: GuildMember, targetId: string): Promise<BlacklistResult> {
  const entry = await recordLift(targetId, actor.id);
  if (!entry) throw new UserError(`<@${targetId}> n'est pas (ou plus) blacklisté.`);

  const warnings: string[] = [];
  try {
    await actor.guild.bans.remove(targetId, auditReason(actor, "Blacklist levée"));
  } catch (error) {
    if (!(error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.UnknownBan)) {
      logger.warn({ err: error, target: targetId }, "Levée du bannissement d'un blacklisté impossible");
      warnings.push("la levée du bannissement a échoué : débannissez-le à la main.");
    }
  }
  return { entry, warnings };
}

/**
 * Un blacklisté qui revient (débanni à la main entre-temps) est banni de nouveau :
 * un débannissement ne retire pas la ligne, c'est la table qui fait foi.
 */
export async function enforceBlacklist(guild: Guild, userId: string): Promise<boolean> {
  const entry = await blacklistEntry(userId);
  if (!entry) return false;
  await guild.bans.create(userId, { reason: `Blacklisté${entry.reason ? ` : ${entry.reason}` : ""} (la blacklist fait foi)`.slice(0, 512) });
  return true;
}
