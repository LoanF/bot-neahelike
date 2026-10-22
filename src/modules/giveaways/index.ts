import type { Guild } from "discord.js";
import { getSettings } from "@/config/store";
import { isModuleEnabled } from "@/core/access";
import { defineCommand, PERMISSION } from "@/core/command";
import type { CommandContext } from "@/core/context";
import { embed, notice } from "@/core/embeds";
import { UserError } from "@/core/errors";
import type { BotModule } from "@/core/registry";
import { logger } from "@/logger";
import { MAX_WINNERS, MODULE, parseDuration, pickWinners } from "./logic";
import { activeGiveaways, cancelGiveaway, createGiveaway, dropGiveaway, dueGiveaways, giveawayByMessage, setGiveawayMessage, setWinners } from "./store";
import { announce, drawGiveaway, eligibleEntries, giveawayHandler, giveawayPayload, refreshGiveaway } from "./ui";

/** Les giveaways échus sont tirés au sort dans les 15 secondes. */
const DRAW_EVERY_MS = 15 * 1000;

async function byMessage(ctx: CommandContext) {
  const messageId = ctx.string("message", true).trim().split("/").pop() ?? "";
  if (!/^\d{17,20}$/.test(messageId)) throw new UserError("Indiquez l'identifiant (ou le lien) du message du giveaway.");
  const giveaway = await giveawayByMessage(ctx.guild.id, messageId);
  if (!giveaway) throw new UserError("Aucun giveaway sur ce message.");
  return giveaway;
}

const messageOption = { name: "message", description: "Identifiant ou lien du message du giveaway", type: "string" as const, required: true, maxLength: 200 };

const giveaway = defineCommand({
  name: "giveaway",
  description: "Organise des giveaways : création, tirage, nouveau tirage, annulation.",
  module: MODULE,
  defaultPermission: PERMISSION.gestion,
  subcommands: [
    {
      name: "creer",
      description: "Publie un giveaway avec un bouton Participer",
      options: [
        { name: "duree", description: "Durée : 30m, 2h, 1h30, 3j, 1sem…", type: "string", required: true, maxLength: 20 },
        { name: "lot", description: "Ce qui est à gagner", type: "string", required: true, maxLength: 200 },
        { name: "gagnants", description: `Nombre de gagnants (1 à ${MAX_WINNERS})`, type: "integer", minValue: 1, maxValue: MAX_WINNERS },
        { name: "salon", description: "Salon de publication (par défaut : celui-ci)", type: "channel" },
        { name: "role", description: "Rôle exigé pour participer", type: "role" },
        { name: "description", description: "Texte affiché au-dessus du giveaway", type: "string", maxLength: 1000, rest: true },
      ],
    },
    { name: "terminer", description: "Tire au sort maintenant, sans attendre la fin", options: [messageOption] },
    {
      name: "relancer",
      description: "Nouveau tirage d'un giveaway terminé (les anciens gagnants sont écartés)",
      options: [messageOption, { name: "gagnants", description: "Nombre de nouveaux gagnants", type: "integer", minValue: 1, maxValue: MAX_WINNERS }],
    },
    { name: "annuler", description: "Annule un giveaway en cours, sans gagnant", options: [messageOption] },
    { name: "liste", description: "Giveaways en cours" },
  ],
  async run(ctx) {
    switch (ctx.subcommand) {
      case "creer": {
        const duration = parseDuration(ctx.string("duree", true));
        const target = ctx.channelArg("salon") ?? ctx.channel;
        if (!target?.isSendable()) throw new UserError("Ce salon ne peut pas recevoir de messages.");
        const role = ctx.role("role");
        const created = await createGiveaway({
          guildId: ctx.guild.id,
          channelId: target.id,
          prize: ctx.string("lot", true),
          description: ctx.string("description") ?? null,
          winnerCount: ctx.integer("gagnants") ?? 1,
          requiredRoleId: role?.id ?? null,
          hostId: ctx.user.id,
          endsAt: new Date(Date.now() + duration),
        });
        let sent: Awaited<ReturnType<typeof target.send>> | undefined;
        try {
          sent = await target.send(giveawayPayload(ctx.settings, created, 0));
          await setGiveawayMessage(created.id, sent.id);
        } catch (error) {
          // Pas de message orphelin : un bouton sans giveaway en base ne mènerait nulle part.
          await sent?.delete().catch(() => {});
          await dropGiveaway(created.id);
          throw new UserError(`Le bot ne peut pas publier dans ${target} : vérifiez ses permissions (${error instanceof Error ? error.message : "erreur inconnue"}).`);
        }
        await ctx.reply({ embeds: [notice(ctx.settings, `Giveaway **${created.prize}** publié dans ${target}.`)] }, { private: true });
        return;
      }
      case "terminer": {
        const current = await byMessage(ctx);
        if (current.status !== "en_cours") throw new UserError("Ce giveaway est déjà clos.");
        await ctx.defer({ private: true });
        if (!(await drawGiveaway(ctx.guild, current))) throw new UserError("Ce giveaway vient d'être clos par le tirage automatique.");
        await ctx.reply({ embeds: [notice(ctx.settings, `Tirage effectué pour **${current.prize}**.`)] }, { private: true });
        return;
      }
      case "relancer": {
        const current = await byMessage(ctx);
        if (current.status !== "termine") throw new UserError("Seul un giveaway terminé peut être relancé.");
        await ctx.defer({ private: true });
        // Les gagnants du dernier tirage sont écartés ; un tirage plus ancien n'est pas gardé en mémoire.
        const winners = pickWinners(await eligibleEntries(ctx.guild, current), ctx.integer("gagnants") ?? current.winner_count, current.winner_ids);
        if (winners.length === 0) throw new UserError("Plus aucun participant éligible pour un nouveau tirage.");
        const updated = await setWinners(current.id, winners);
        if (updated) await announce(ctx.guild, updated, winners, true);
        await ctx.reply({ embeds: [notice(ctx.settings, `Nouveau tirage pour **${current.prize}** : ${winners.length} gagnant(s).`)] }, { private: true });
        return;
      }
      case "annuler": {
        const current = await byMessage(ctx);
        const cancelled = await cancelGiveaway(current.id);
        if (!cancelled) throw new UserError("Ce giveaway est déjà clos.");
        await refreshGiveaway(ctx.guild, cancelled.id);
        await ctx.reply({ embeds: [notice(ctx.settings, `Giveaway **${current.prize}** annulé.`)] }, { private: true });
        return;
      }
      case "liste": {
        const active = await activeGiveaways(ctx.guild.id);
        const lines = active.map(
          item => `🎉 **${item.prize}** — <#${item.channel_id}> · fin <t:${Math.floor(new Date(item.ends_at).getTime() / 1000)}:R> · [message](https://discord.com/channels/${item.guild_id}/${item.channel_id}/${item.message_id})`,
        );
        await ctx.reply({ embeds: [embed(ctx.settings).setTitle("Giveaways en cours").setDescription(lines.join("\n").slice(0, 4000) || "*Aucun giveaway en cours.*")] }, { private: true });
        return;
      }
    }
  },
});

async function onReady(guild: Guild) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const settings = await getSettings(guild.id);
      if (!isModuleEnabled(settings, MODULE)) return;
      for (const due of await dueGiveaways(guild.id)) await drawGiveaway(guild, due);
    } catch (error) {
      logger.error({ err: error }, "Tirage des giveaways impossible");
    } finally {
      running = false;
    }
  };
  setInterval(() => void run(), DRAW_EVERY_MS).unref();
  await run();
}

export const giveawaysModule: BotModule = {
  id: MODULE,
  label: "Giveaways",
  icon: "🎉",
  description: "Giveaways avec bouton Participer, rôle exigé, tirage automatique et nouveau tirage.",
  tables: ["bot_giveaways", "bot_giveaway_entries"],
  commands: [giveaway],
  components: [giveawayHandler],
  onReady,
};
