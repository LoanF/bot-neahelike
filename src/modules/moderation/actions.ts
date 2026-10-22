import { RESTJSONErrorCodes, DiscordAPIError, type Guild, type GuildMember, type User } from "discord.js";
import { getSettings } from "@/config/store";
import { embed } from "@/core/embeds";
import { UserError } from "@/core/errors";
import { renderMessage } from "@/core/messages";
import { logger } from "@/logger";
import { sendLog } from "@/modules/logs/events";
import { warningEvent } from "@/modules/logs/format";
import { durationSuffix, hierarchyProblem, SANCTION_LABELS, type SanctionType } from "./logic";
import { addSanction, dueTempBans, revokeActive, revokeSanction, type Sanction } from "./store";

/** Membre ciblé, s'il est encore sur le serveur. */
export async function targetMember(guild: Guild, userId: string): Promise<GuildMember | null> {
  return guild.members.cache.get(userId) ?? (await guild.members.fetch(userId).catch(() => null));
}

/** Refuse une sanction contraire à la hiérarchie des rôles (voir `hierarchyProblem`). */
export function checkHierarchy(actor: GuildMember, target: User, member: GuildMember | null) {
  const guild = actor.guild;
  const problem = hierarchyProblem({
    actorId: actor.id,
    actorTop: actor.roles.highest.position,
    targetId: target.id,
    targetTop: member ? member.roles.highest.position : null,
    ownerId: guild.ownerId,
    botId: guild.client.user.id,
    botTop: guild.members.me?.roles.highest.position ?? 0,
  });
  if (problem) throw new UserError(problem);
}

/** Message privé au membre sanctionné ; envoyé avant l'expulsion ou le bannissement, sinon il ne le recevrait plus. */
async function notify(guild: Guild, user: User, type: SanctionType, reason: string, durationMs?: number | null) {
  const settings = await getSettings(guild.id);
  const text = renderMessage(settings, "moderation.mp", {
    server: guild.name,
    sanction: SANCTION_LABELS[type].label.toLowerCase(),
    duree: durationSuffix(durationMs),
    raison: reason,
  });
  // MP fermés : Discord refuse, la sanction s'applique quand même.
  await user.send({ embeds: [embed(settings, "bronze").setTitle(`${SANCTION_LABELS[type].emoji} ${guild.name}`).setDescription(text)] }).catch(() => {});
}

export interface SanctionInput {
  actor: GuildMember;
  target: User;
  reason: string;
  durationMs?: number | null;
}

/** Applique la sanction sur Discord puis l'inscrit au casier. Rien n'est inscrit si Discord refuse. */
export async function sanction(type: SanctionType, input: SanctionInput): Promise<Sanction> {
  const guild = input.actor.guild;
  const member = await targetMember(guild, input.target.id);
  checkHierarchy(input.actor, input.target, member);
  const audit = `${input.reason} (par ${input.actor.user.tag})`.slice(0, 512);
  const endsAt = input.durationMs ? new Date(Date.now() + input.durationMs) : null;

  switch (type) {
    case "avertissement":
      if (!member) throw new UserError("Ce membre n'est pas sur le serveur.");
      await notify(guild, input.target, type, input.reason);
      break;
    case "exclusion":
      if (!member) throw new UserError("Ce membre n'est pas sur le serveur.");
      if (!member.moderatable) throw new UserError("Le bot ne peut pas exclure ce membre (permission « Exclure temporairement » ou rôle trop bas).");
      await member.timeout(input.durationMs ?? null, audit);
      await notify(guild, input.target, type, input.reason, input.durationMs);
      break;
    case "expulsion":
      if (!member) throw new UserError("Ce membre n'est pas sur le serveur.");
      if (!member.kickable) throw new UserError("Le bot ne peut pas expulser ce membre (permission « Expulser » ou rôle trop bas).");
      await notify(guild, input.target, type, input.reason);
      await member.kick(audit);
      break;
    case "bannissement":
      if (member && !member.bannable) throw new UserError("Le bot ne peut pas bannir ce membre (permission « Bannir » ou rôle trop bas).");
      if (await isBanned(guild, input.target.id)) throw new UserError("Ce membre est déjà banni.");
      if (member) await notify(guild, input.target, type, input.reason, input.durationMs);
      await guild.bans.create(input.target.id, { reason: audit });
      break;
  }

  const recorded = await addSanction({ guildId: guild.id, userId: input.target.id, moderatorId: input.actor.id, type, reason: input.reason, endsAt });
  // Les expulsions, bannissements et exclusions arrivent déjà dans les logs par le journal d'audit ; l'avertissement, lui, n'y passe pas.
  if (type === "avertissement") {
    await sendLog(guild, "avertissement", color => warningEvent(color, { number: recorded.number, userId: input.target.id, moderatorId: input.actor.id, reason: input.reason }));
  }
  return recorded;
}

export async function isBanned(guild: Guild, userId: string): Promise<boolean> {
  try {
    await guild.bans.fetch({ user: userId, force: true });
    return true;
  } catch (error) {
    if (error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.UnknownBan) return false;
    throw error;
  }
}

/** Lève un bannissement sur Discord (s'il existe encore) et dans le casier. */
export async function unban(guild: Guild, userId: string, byId: string, reason: string): Promise<{ wasBanned: boolean; revoked: number }> {
  let wasBanned = true;
  try {
    await guild.bans.remove(userId, reason.slice(0, 512));
  } catch (error) {
    if (!(error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.UnknownBan)) throw error;
    wasBanned = false;
  }
  const revoked = await revokeActive(guild.id, userId, "bannissement", byId, reason);
  return { wasBanned, revoked };
}

/** Lève une exclusion temporaire en cours. */
export async function endTimeout(actor: GuildMember, target: GuildMember, reason: string): Promise<number> {
  if (!target.isCommunicationDisabled()) throw new UserError("Ce membre n'est pas exclu en ce moment.");
  if (!target.moderatable) throw new UserError("Le bot ne peut pas modifier l'exclusion de ce membre.");
  await target.timeout(null, `${reason} (par ${actor.user.tag})`.slice(0, 512));
  return revokeActive(actor.guild.id, target.id, "exclusion", actor.id, reason);
}

/**
 * Retire une sanction du casier. Une sanction encore en cours est levée sur Discord aussi
 * (débannissement, fin d'exclusion) ; un avertissement retiré est signalé dans les logs.
 */
export async function removeSanction(actor: GuildMember, sanctionRow: Sanction, reason: string): Promise<Sanction> {
  const guild = actor.guild;
  const running = !sanctionRow.revoked_at && (!sanctionRow.ends_at || new Date(sanctionRow.ends_at) > new Date());
  if (running && sanctionRow.type === "bannissement") {
    await guild.bans.remove(sanctionRow.user_id, reason).catch(error => {
      if (!(error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.UnknownBan)) throw error;
    });
  }
  if (running && sanctionRow.type === "exclusion") {
    const member = await targetMember(guild, sanctionRow.user_id);
    if (member?.isCommunicationDisabled() && member.moderatable) await member.timeout(null, reason);
  }
  const revoked = await revokeSanction(sanctionRow.id, actor.id, reason);
  if (!revoked) throw new UserError(`La sanction #${sanctionRow.number} est déjà levée.`);
  if (revoked.type === "avertissement") {
    await sendLog(guild, "avertissement", color => warningEvent(color, { number: revoked.number, userId: revoked.user_id, moderatorId: actor.id, reason, revoked: true }));
  }
  return revoked;
}

/** Lève les bannissements temporaires arrivés à échéance. */
export async function liftExpiredBans(guild: Guild) {
  for (const due of await dueTempBans(guild.id)) {
    try {
      await unban(guild, due.user_id, guild.client.user.id, "Fin du bannissement temporaire");
      // Le bannissement a pu être levé à la main entre-temps : la ligne est close dans tous les cas.
      await revokeSanction(due.id, guild.client.user.id, "Fin du bannissement temporaire");
    } catch (error) {
      logger.error({ err: error, sanction: due.number }, "Levée d'un bannissement temporaire impossible");
    }
  }
}
