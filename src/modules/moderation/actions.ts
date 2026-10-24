import { DiscordAPIError, PermissionFlagsBits, RESTJSONErrorCodes, type Guild, type GuildMember, type User } from "discord.js";
import { getSettings } from "@/config/store";
import { canUse } from "@/core/access";
import { embed } from "@/core/embeds";
import { UserError } from "@/core/errors";
import { renderMessage } from "@/core/messages";
import { getRegistry } from "@/core/registry";
import { logger } from "@/logger";
import { sendLog } from "@/modules/logs/events";
import { warningEvent } from "@/modules/logs/format";
import { durationSuffix, hierarchyProblem, SANCTION_LABELS, type SanctionType } from "./logic";
import { addSanction, dueTempBans, hasOtherActiveBan, revokeActive, revokeSanction, type Sanction } from "./store";

/**
 * Membre ciblé, s'il est encore sur le serveur. Seule une réponse « membre inconnu » vaut absence :
 * une erreur passagère est remontée, sinon elle ferait sauter le contrôle de hiérarchie.
 */
export async function targetMember(guild: Guild, userId: string): Promise<GuildMember | null> {
  const cached = guild.members.cache.get(userId);
  if (cached) return cached;
  try {
    return await guild.members.fetch(userId);
  } catch (error) {
    if (error instanceof DiscordAPIError && (error.code === RESTJSONErrorCodes.UnknownMember || error.code === RESTJSONErrorCodes.UnknownUser)) return null;
    throw error;
  }
}

/** Refuse une sanction contraire à la hiérarchie des rôles (voir `hierarchyProblem`). */
export function checkHierarchy(actor: GuildMember, target: Pick<User, "id">, member: GuildMember | null) {
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

  let recorded: Sanction;
  try {
    recorded = await addSanction({ guildId: guild.id, userId: input.target.id, moderatorId: input.actor.id, type, reason: input.reason, endsAt });
  } catch (error) {
    logger.error({ err: error, type, target: input.target.id }, "Inscription au casier impossible");
    throw new UserError(await undoUnrecorded(guild, type, input.target, member));
  }
  // Les expulsions, bannissements et exclusions arrivent déjà dans les logs par le journal d'audit ; l'avertissement, lui, n'y passe pas.
  if (type === "avertissement") {
    await sendLog(guild, "avertissement", color => warningEvent(color, { number: recorded.number, userId: input.target.id, moderatorId: input.actor.id, reason: input.reason }));
  }
  return recorded;
}

/**
 * Sanction appliquée sur Discord mais pas inscrite au casier. Un bannissement (temporaire : il ne serait jamais levé)
 * ou une exclusion sont annulés ; une expulsion ou un avertissement ne peuvent pas l'être. Renvoie le message pour
 * le modérateur, qui dit exactement ce qui reste à faire.
 */
async function undoUnrecorded(guild: Guild, type: SanctionType, target: User, member: GuildMember | null): Promise<string> {
  if (type === "expulsion") return `${target} a bien été expulsé, mais le casier est indisponible : l'expulsion n'y est pas inscrite.`;
  if (type === "avertissement") return `L'avertissement a été envoyé à ${target}, mais le casier est indisponible : il n'y est pas inscrit. Réessayez dans un instant.`;
  try {
    if (type === "bannissement") await guild.bans.remove(target.id, "Casier indisponible : bannissement annulé");
    else await member?.timeout(null, "Casier indisponible : exclusion annulée");
    return "Le casier est indisponible : la sanction a été annulée sur Discord. Réessayez dans un instant.";
  } catch (error) {
    logger.error({ err: error, type, target: target.id }, "Annulation d'une sanction non inscrite impossible");
    return `Le casier est indisponible et la sanction n'a pas pu être annulée sur Discord : ${type === "bannissement" ? "débannissez" : "levez l'exclusion de"} ${target} à la main.`;
  }
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

/** Lève une exclusion temporaire en cours ; mêmes règles de hiérarchie que pour la poser. */
export async function endTimeout(actor: GuildMember, target: GuildMember, reason: string): Promise<number> {
  checkHierarchy(actor, target, target);
  if (!target.isCommunicationDisabled()) throw new UserError("Ce membre n'est pas exclu en ce moment.");
  if (!target.moderatable) throw new UserError("Le bot ne peut pas modifier l'exclusion de ce membre.");
  await target.timeout(null, `${reason} (par ${actor.user.tag})`.slice(0, 512));
  return revokeActive(actor.guild.id, target.id, "exclusion", actor.id, reason);
}

/**
 * Retire une sanction du casier. Une sanction encore en cours est levée sur Discord aussi
 * (débannissement, fin d'exclusion) ; un avertissement retiré est signalé dans les logs.
 * Lever un bannissement demande la permission Bannir ; toucher un membre présent suit la hiérarchie des rôles.
 */
export async function removeSanction(actor: GuildMember, sanctionRow: Sanction, reason: string): Promise<Sanction> {
  const guild = actor.guild;
  const running = !sanctionRow.revoked_at && (!sanctionRow.ends_at || new Date(sanctionRow.ends_at) > new Date());
  if (sanctionRow.type === "bannissement" && !(await canLiftBans(actor))) {
    throw new UserError("Retirer un bannissement demande la permission « Bannir des membres » ou l'accès à `/unban`.");
  }
  const member = await targetMember(guild, sanctionRow.user_id);
  checkHierarchy(actor, { id: sanctionRow.user_id }, member);
  // Un bannissement non levé l'est sur Discord, même échu : la levée automatique a pu ne pas passer encore (ou échouer).
  // Sauf si un autre bannissement du membre est encore en vigueur.
  if (sanctionRow.type === "bannissement" && !sanctionRow.revoked_at && !(await hasOtherActiveBan(guild.id, sanctionRow.user_id, sanctionRow.id))) {
    await guild.bans.remove(sanctionRow.user_id, reason).catch(error => {
      if (!(error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.UnknownBan)) throw error;
    });
  }
  if (running && sanctionRow.type === "exclusion" && member?.isCommunicationDisabled()) {
    if (!member.moderatable) throw new UserError("Le bot ne peut pas lever l'exclusion de ce membre (rôle trop haut ou permission manquante) : rien n'a été retiré.");
    await member.timeout(null, reason);
  }
  const revoked = await revokeSanction(sanctionRow.id, actor.id, reason);
  if (!revoked) throw new UserError(`La sanction #${sanctionRow.number} est déjà levée.`);
  if (revoked.type === "avertissement") {
    await sendLog(guild, "avertissement", color => warningEvent(color, { number: revoked.number, userId: revoked.user_id, moderatorId: actor.id, reason, revoked: true }));
  }
  return revoked;
}

/** Lever un bannissement : permission Discord « Bannir », ou accès à `/unban` réglé dans `/config`. */
async function canLiftBans(actor: GuildMember): Promise<boolean> {
  if (actor.permissions.has(PermissionFlagsBits.BanMembers)) return true;
  const unbanCommand = getRegistry().find("unban");
  return Boolean(unbanCommand && canUse(await getSettings(actor.guild.id), actor, unbanCommand));
}

/** Lève les bannissements temporaires arrivés à échéance, sauf si un autre bannissement du membre est encore en vigueur. */
export async function liftExpiredBans(guild: Guild) {
  const botId = guild.client.user.id;
  for (const due of await dueTempBans(guild.id)) {
    try {
      if (!(await hasOtherActiveBan(guild.id, due.user_id, due.id))) await unban(guild, due.user_id, botId, "Fin du bannissement temporaire");
      // Le bannissement a pu être levé à la main entre-temps : la ligne est close dans tous les cas.
      await revokeSanction(due.id, botId, "Fin du bannissement temporaire");
    } catch (error) {
      logger.error({ err: error, sanction: due.number }, "Levée d'un bannissement temporaire impossible");
    }
  }
}
