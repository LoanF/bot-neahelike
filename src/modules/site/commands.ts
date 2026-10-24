import { ButtonBuilder, ButtonStyle } from "discord.js";
import { defineCommand, PERMISSION } from "@/core/command";
import { UserError } from "@/core/errors";
import { row } from "@/core/panels";
import { latestApplication } from "./applications";
import { ficheEmbed, findProfile, profileUrl } from "./fiche";
import { candidatureComponents, candidatureEmbed, renderSitePanel } from "./panel";
import { MODULE } from "./settings";

export { portalUrl } from "./panel";

export const candidature = defineCommand({
  name: "candidature",
  description: "Où en est ta candidature à la whitelist, avec le lien du portail (réponse visible par toi seul).",
  module: MODULE,
  defaultPermission: PERMISSION.tous,
  async run(ctx) {
    await ctx.defer({ private: true });
    const result = await candidatureEmbed(ctx.settings, ctx.user.id, ctx.member.roles.cache.keys());
    // Pas de boutons en MP (repli des commandes préfixe) : le lien du portail figure déjà dans le texte.
    await ctx.reply({ embeds: [result.embed], ...(ctx.source === "slash" && { components: candidatureComponents(ctx.user.id, result.whitelisted) }) }, { private: true });
  },
});

export const fiche = defineCommand({
  name: "fiche",
  slashOnly: true,
  description: "Fiche d'un joueur : compte du site, candidature et décision (réponse visible par toi seul).",
  module: MODULE,
  defaultPermission: PERMISSION.messages,
  options: [{ name: "joueur", description: "Joueur à consulter", type: "user", required: true }],
  async run(ctx) {
    const player = ctx.userArg("joueur");
    if (!player) throw new UserError("Indique le joueur à consulter.");
    await ctx.defer({ private: true });
    const profile = await findProfile(player.id);
    if (!profile) throw new UserError(`${player} ne s'est jamais connecté au portail du site.`);
    const application = await latestApplication(player.id);
    await ctx.reply(
      {
        embeds: [ficheEmbed(ctx.settings, profile, application).setThumbnail(player.displayAvatarURL())],
        components: [row(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(profileUrl(player.id)).setLabel("Ouvrir sur le site"))],
      },
      { private: true },
    );
  },
});

export const site = defineCommand({
  name: "site",
  description: "Ouvre le panneau du lien avec le site : salon de logs staff, rôles des rangs, resynchronisation.",
  module: MODULE,
  defaultPermission: PERMISSION.gestion,
  protected: true,
  async run(ctx) {
    await ctx.reply(await renderSitePanel({ settings: ctx.settings, owner: ctx.user.id }), { private: true });
  },
});
