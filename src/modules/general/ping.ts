import { defineCommand, LEVEL } from "@/core/command";
import { notice } from "@/core/embeds";

export const ping = defineCommand({
  name: "ping",
  description: "Affiche la latence du bot.",
  module: "general",
  defaultWeight: LEVEL.tous,
  async run(ctx) {
    const started = Date.now();
    await ctx.defer({ private: true });
    const gateway = ctx.guild.client.ws.ping;
    await ctx.reply(
      { embeds: [notice(ctx.settings, `Réponse en **${Date.now() - started} ms** · passerelle **${gateway >= 0 ? `${gateway} ms` : "en cours de mesure"}**.`)] },
      { private: true },
    );
  },
});
