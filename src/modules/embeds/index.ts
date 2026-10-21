import { defineCommand, PERMISSION } from "@/core/command";
import type { BotModule } from "@/core/registry";
import { draftOf, embedPanel, hasDraft, renderEmbedPanel } from "./panel";

const MODULE = "embeds";

const embed = defineCommand({
  name: "embed",
  description: "Crée un embed pas à pas, avec l'aperçu en direct, puis publie-le dans un salon.",
  module: MODULE,
  aliases: ["annonce", "embeds"],
  defaultPermission: PERMISSION.messages,
  async run(ctx) {
    const resumed = hasDraft(ctx.user.id);
    draftOf(ctx.user.id, ctx.settings, true);
    await ctx.reply(
      renderEmbedPanel({ settings: ctx.settings, guild: ctx.guild, owner: ctx.user.id, notice: resumed ? "Brouillon repris là où tu l'avais laissé." : undefined }),
      { private: true },
    );
  },
});

export const embedsModule: BotModule = {
  id: MODULE,
  label: "Créateur d'embeds",
  icon: "📣",
  description: "Annonces et messages mis en forme, construits pas à pas avec un aperçu en direct.",
  commands: [embed],
  components: [embedPanel],
};
