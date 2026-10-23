import type { Guild } from "discord.js";
import { getSettings } from "@/config/store";
import { isModuleEnabled } from "@/core/access";
import { defineCommand, PERMISSION } from "@/core/command";
import type { BotModule } from "@/core/registry";
import { logger } from "@/logger";
import { MODULE } from "./logic";
import { giveawayPanel, renderGiveawayPanel } from "./panel";
import { dueGiveaways } from "./store";
import { drawGiveaway, giveawayHandler } from "./ui";

/** Les giveaways échus sont tirés au sort dans les 15 secondes. */
const DRAW_EVERY_MS = 15 * 1000;

const giveaway = defineCommand({
  name: "giveaway",
  aliases: ["giveaways", "gw"],
  description: "Ouvre le panneau des giveaways : créer, suivre, tirer au sort, relancer ou annuler.",
  module: MODULE,
  defaultPermission: PERMISSION.gestion,
  async run(ctx) {
    await ctx.reply(await renderGiveawayPanel({ settings: ctx.settings, guild: ctx.guild, owner: ctx.user.id }), { private: true });
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
      for (const due of await dueGiveaways(guild.id)) {
        // Un tirage reporté (liste des membres indisponible) ne bloque pas les autres : il sera retenté au prochain passage.
        await drawGiveaway(guild, due).catch(error => logger.warn({ err: error, giveaway: due.id }, "Tirage du giveaway reporté"));
      }
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
  description: "Giveaways créés depuis un panneau : bouton Participer, rôle exigé, tirage automatique et nouveau tirage.",
  tables: ["bot_giveaways", "bot_giveaway_entries"],
  commands: [giveaway],
  components: [giveawayHandler, giveawayPanel],
  onReady,
};
