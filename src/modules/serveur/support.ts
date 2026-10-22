import { defineCommand, PERMISSION } from "@/core/command";
import { renderSupportPanel } from "./panel";
import { MODULE } from "./settings";

/** Ouvre le panneau du rôle soutien : rôle donné, tag du serveur, textes autorisés dans le statut. */
export const soutien = defineCommand({
  name: "soutien",
  description: "Ouvre le panneau du rôle soutien : rôle, tag du serveur, textes autorisés dans le statut.",
  module: MODULE,
  defaultPermission: PERMISSION.gestion,
  protected: true,
  async run(ctx) {
    await ctx.reply(renderSupportPanel({ settings: ctx.settings, guild: ctx.guild, owner: ctx.user.id }), { private: true });
  },
});
