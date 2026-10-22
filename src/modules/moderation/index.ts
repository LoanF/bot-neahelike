import type { Guild, User } from "discord.js";
import { getSettings, type GuildSettings } from "@/config/store";
import { isModuleEnabled } from "@/core/access";
import { defineCommand, PERMISSION, type OptionDef } from "@/core/command";
import type { CommandContext } from "@/core/context";
import { embed, notice } from "@/core/embeds";
import { UserError } from "@/core/errors";
import type { BotModule } from "@/core/registry";
import { logger } from "@/logger";
import { endTimeout, liftExpiredBans, removeSanction, sanction, targetMember, unban } from "./actions";
import { cleanReason, durationSuffix, MODULE, parseTempban, parseTimeout, SANCTION_LABELS, sanctionState, type SanctionType } from "./logic";
import { countSanctions, sanctionByNumber, sanctionsOf, type Sanction } from "./store";

/** Les bannissements temporaires échus sont levés dans la minute. */
const UNBAN_EVERY_MS = 60 * 1000;

const memberOption: OptionDef = { name: "membre", description: "Membre concerné", type: "user", required: true };
const reasonOption: OptionDef = { name: "raison", description: "Raison (envoyée au membre et gardée dans son casier)", type: "string", maxLength: 500, rest: true };

const STATE_LABELS = { levee: "levée", expiree: "terminée", active: "en cours", definitive: "" } as const;
const time = (iso: string, style: "R" | "f" | "d" = "d") => `<t:${Math.floor(new Date(iso).getTime() / 1000)}:${style}>`;

/** Ligne du casier : numéro, type, date, durée, auteur, raison et état. */
export function sanctionLine(item: Sanction, now = new Date()): string {
  const { label, emoji } = SANCTION_LABELS[item.type];
  const duration = item.ends_at ? durationSuffix(new Date(item.ends_at).getTime() - new Date(item.created_at).getTime()) : "";
  const state = STATE_LABELS[sanctionState(item, now)];
  const head = `${emoji} **#${item.number} ${label}**${duration} · ${time(item.created_at)} · par <@${item.moderator_id}>${state ? ` · *${state}*` : ""}`;
  return `${head}\n> ${item.reason.slice(0, 200).replace(/\n/g, " ")}`;
}

export function casierEmbed(settings: GuildSettings, user: Pick<User, "id" | "tag">, sanctions: Sanction[], counts: Record<SanctionType, number>) {
  const summary = (Object.keys(SANCTION_LABELS) as SanctionType[]).map(type => `${SANCTION_LABELS[type].emoji} ${counts[type]}`).join(" · ");
  const lines: string[] = [];
  let length = 0;
  for (const item of sanctions) {
    const line = sanctionLine(item);
    // Limite de la description d'un embed (4096) : les plus anciennes sanctions sont résumées.
    if (length + line.length > 3800) {
      lines.push(`*… et ${sanctions.length - lines.length} sanction(s) plus ancienne(s).*`);
      break;
    }
    lines.push(line);
    length += line.length + 2;
  }
  return embed(settings, "bronze")
    .setTitle(`⚖️ Casier de ${user.tag}`)
    .setDescription(lines.join("\n\n") || "*Casier vierge.*")
    .setFooter({ text: `Sanctions en vigueur : ${summary}` });
}

function confirmation(ctx: CommandContext, item: Sanction, user: User, durationMs?: number | null) {
  const { label, emoji } = SANCTION_LABELS[item.type];
  return notice(ctx.settings, `${emoji} ${label}${durationSuffix(durationMs)} pour ${user} : sanction **#${item.number}**.\n**Raison :** ${item.reason}`, "Sanction appliquée");
}

async function apply(ctx: CommandContext, type: SanctionType, user: User, durationMs?: number | null) {
  await ctx.defer({ private: true });
  const reason = cleanReason(ctx.string("raison"));
  const item = await sanction(type, { actor: ctx.member, target: user, reason, durationMs });
  await ctx.reply({ embeds: [confirmation(ctx, item, user, durationMs)] }, { private: true });
}

const required = (ctx: CommandContext, name = "membre") => {
  const user = ctx.userArg(name);
  if (!user) throw new UserError("Membre introuvable (mention ou identifiant).");
  return user;
};

const warn = defineCommand({
  name: "warn",
  aliases: ["avertir"],
  description: "Avertit un membre : message privé et inscription au casier.",
  module: MODULE,
  defaultPermission: PERMISSION.moderation,
  options: [memberOption, reasonOption],
  run: ctx => apply(ctx, "avertissement", required(ctx)),
});

const timeout = defineCommand({
  name: "timeout",
  aliases: ["mute", "exclure"],
  description: "Exclut temporairement un membre (28 jours au plus) : il ne peut plus écrire ni parler.",
  module: MODULE,
  defaultPermission: PERMISSION.moderation,
  options: [memberOption, { name: "duree", description: "Durée : 10m, 2h, 1j…", type: "string", required: true, maxLength: 20 }, reasonOption],
  run: ctx => apply(ctx, "exclusion", required(ctx), parseTimeout(ctx.string("duree", true))),
});

const untimeout = defineCommand({
  name: "untimeout",
  aliases: ["unmute"],
  description: "Lève l'exclusion temporaire d'un membre.",
  module: MODULE,
  defaultPermission: PERMISSION.moderation,
  options: [memberOption, reasonOption],
  async run(ctx) {
    const user = required(ctx);
    const member = await targetMember(ctx.guild, user.id);
    if (!member) throw new UserError("Ce membre n'est pas sur le serveur.");
    await endTimeout(ctx.member, member, cleanReason(ctx.string("raison")));
    await ctx.reply({ embeds: [notice(ctx.settings, `Exclusion de ${user} levée.`)] }, { private: true });
  },
});

const kick = defineCommand({
  name: "kick",
  aliases: ["expulser"],
  description: "Expulse un membre du serveur (il pourra revenir avec une invitation).",
  module: MODULE,
  defaultPermission: PERMISSION.expulsion,
  options: [memberOption, reasonOption],
  run: ctx => apply(ctx, "expulsion", required(ctx)),
});

const ban = defineCommand({
  name: "ban",
  aliases: ["bannir"],
  description: "Bannit définitivement un membre, même s'il a déjà quitté le serveur (identifiant accepté).",
  module: MODULE,
  defaultPermission: PERMISSION.bannissement,
  options: [{ ...memberOption, description: "Membre ou identifiant" }, reasonOption],
  run: ctx => apply(ctx, "bannissement", required(ctx)),
});

const tempban = defineCommand({
  name: "tempban",
  description: "Bannit un membre pour une durée (un an au plus) ; il est débanni automatiquement.",
  module: MODULE,
  defaultPermission: PERMISSION.bannissement,
  options: [{ ...memberOption, description: "Membre ou identifiant" }, { name: "duree", description: "Durée : 1j, 1sem, 30j…", type: "string", required: true, maxLength: 20 }, reasonOption],
  run: ctx => apply(ctx, "bannissement", required(ctx), parseTempban(ctx.string("duree", true))),
});

const unbanCommand = defineCommand({
  name: "unban",
  aliases: ["debannir"],
  description: "Lève le bannissement d'un utilisateur (identifiant).",
  module: MODULE,
  defaultPermission: PERMISSION.bannissement,
  options: [{ name: "utilisateur", description: "Identifiant de l'utilisateur banni", type: "user", required: true }, reasonOption],
  async run(ctx) {
    const user = required(ctx, "utilisateur");
    await ctx.defer({ private: true });
    const result = await unban(ctx.guild, user.id, ctx.member.id, `${cleanReason(ctx.string("raison"))} (par ${ctx.user.tag})`);
    if (!result.wasBanned && result.revoked === 0) throw new UserError(`${user.tag} n'est pas banni.`);
    await ctx.reply({ embeds: [notice(ctx.settings, `Bannissement de ${user.tag} levé.`)] }, { private: true });
  },
});

const casier = defineCommand({
  name: "casier",
  aliases: ["sanctions"],
  description: "Casier de modération d'un membre, ou retrait d'une sanction par son numéro.",
  module: MODULE,
  defaultPermission: PERMISSION.moderation,
  subcommands: [
    { name: "voir", description: "Sanctions d'un membre, de la plus récente à la plus ancienne", options: [{ ...memberOption, description: "Membre ou identifiant" }] },
    {
      name: "retirer",
      description: "Retire une sanction (levée sur Discord si elle est en cours)",
      options: [{ name: "numero", description: "Numéro de la sanction (#12)", type: "integer", required: true, minValue: 1 }, reasonOption],
    },
  ],
  async run(ctx) {
    if (ctx.subcommand === "voir") {
      const user = required(ctx);
      await ctx.defer({ private: true });
      const [list, counts] = await Promise.all([sanctionsOf(ctx.guild.id, user.id), countSanctions(ctx.guild.id, user.id)]);
      await ctx.reply({ embeds: [casierEmbed(ctx.settings, user, list, counts)] }, { private: true });
      return;
    }
    const number = ctx.integer("numero", true);
    const item = await sanctionByNumber(ctx.guild.id, number);
    if (!item) throw new UserError(`Aucune sanction #${number} sur ce serveur.`);
    await ctx.defer({ private: true });
    const reason = cleanReason(ctx.string("raison"));
    const revoked = await removeSanction(ctx.member, item, reason);
    await ctx.reply({ embeds: [notice(ctx.settings, `Sanction **#${revoked.number}** (${SANCTION_LABELS[revoked.type].label.toLowerCase()}) de <@${revoked.user_id}> retirée.`)] }, { private: true });
  },
});

async function onReady(guild: Guild) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const settings = await getSettings(guild.id);
      if (isModuleEnabled(settings, MODULE)) await liftExpiredBans(guild);
    } catch (error) {
      logger.error({ err: error }, "Levée des bannissements temporaires impossible");
    } finally {
      running = false;
    }
  };
  setInterval(() => void run(), UNBAN_EVERY_MS).unref();
  await run();
}

export const moderationModule: BotModule = {
  id: MODULE,
  label: "Modération",
  icon: "⚖️",
  description: "Avertissements, exclusions, expulsions, bannissements (temporaires ou non) et casier des membres.",
  tables: ["bot_sanctions"],
  commands: [warn, timeout, untimeout, kick, ban, tempban, unbanCommand, casier],
  onReady,
  messages: [
    {
      key: "moderation.mp",
      module: MODULE,
      label: "Message privé au membre sanctionné",
      defaultContent: "Tu as reçu une sanction sur **{server}** : **{sanction}**{duree}.\n**Raison :** {raison}\n\nPour la contester, contacte l'équipe de la cité.",
      variables: { "{sanction}": "type de sanction", "{duree}": "durée, s'il y en a une", "{raison}": "raison donnée" },
    },
  ],
};

