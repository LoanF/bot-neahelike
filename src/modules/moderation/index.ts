import type { Guild, User } from "discord.js";
import { getSettings } from "@/config/store";
import { isModuleEnabled } from "@/core/access";
import { defineCommand, PERMISSION, type OptionDef } from "@/core/command";
import type { CommandContext } from "@/core/context";
import { notice } from "@/core/embeds";
import { UserError } from "@/core/errors";
import type { BotModule } from "@/core/registry";
import { logger } from "@/logger";
import { endTimeout, liftExpiredBans, sanction, targetMember, unban } from "./actions";
import { cleanReason, durationSuffix, MODULE, parseTempban, parseTimeout, SANCTION_LABELS, type SanctionType } from "./logic";
import { casierPanel, casierView, loadTarget } from "./casier";
import type { Sanction } from "./store";

export { casierEmbed, sanctionLine } from "./casier";

/** Les bannissements temporaires échus sont levés dans la minute. */
const UNBAN_EVERY_MS = 60 * 1000;

const memberOption: OptionDef = { name: "membre", description: "Membre concerné", type: "user", required: true };
const reasonOption: OptionDef = { name: "raison", description: "Raison (envoyée au membre et gardée dans son casier)", type: "string", maxLength: 500, rest: true };

function confirmation(ctx: CommandContext, item: Sanction, user: User, durationMs?: number | null) {
  const { label, emoji } = SANCTION_LABELS[item.type];
  return notice(ctx.settings, `${emoji} ${label}${durationSuffix(durationMs)} pour ${user} : sanction **#${item.number}**.\n**Raison :** ${item.reason}`, "Sanction appliquée");
}

/** En préfixe, « 1h 30m » donnerait 1h et une raison « 30m … » : la durée doit s'écrire sans espace. */
export function checkSplitDuration(reason: string | undefined) {
  if (reason && /^\d+\s*(sem|min|s|m|h|j|d|w)\b/i.test(reason.trim())) {
    throw new UserError("Écrivez la durée d'un seul tenant, sans espace : par exemple `1h30` ou `1sem2j`.");
  }
}

async function apply(ctx: CommandContext, type: SanctionType, user: User, durationMs?: number | null) {
  if (durationMs && ctx.source === "prefixe") checkSplitDuration(ctx.string("raison"));
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
    await ctx.defer({ private: true });
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
  slashOnly: true,
  description: "Ouvre le casier de modération : sanctions d'un membre et retrait d'une sanction.",
  module: MODULE,
  defaultPermission: PERMISSION.moderation,
  options: [{ name: "membre", description: "Membre ou identifiant (facultatif : sinon, choix dans le panneau)", type: "user" }],
  async run(ctx) {
    const user = ctx.userArg("membre");
    await ctx.defer({ private: true });
    await ctx.reply(casierView({ settings: ctx.settings, owner: ctx.user.id }, user ? await loadTarget(ctx.guild.id, user) : null), { private: true });
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
  components: [casierPanel],
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

