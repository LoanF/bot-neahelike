import { ButtonBuilder, ButtonStyle } from "discord.js";
import { defineCommand, PERMISSION } from "@/core/command";
import { embed, notice } from "@/core/embeds";
import { UserError } from "@/core/errors";
import { renderMessage } from "@/core/messages";
import { row } from "@/core/panels";
import { sql } from "@/db";
import { env } from "@/env";
import { latestApplication, statusKey, statusVars, type Account } from "./applications";
import { ficheEmbed, findProfile, profileUrl } from "./fiche";
import { resync } from "./events";
import { MODULE, siteSettings, updateSiteSettings } from "./settings";

export function portalUrl() {
  return `${env().SITE_URL}/connexion`;
}

function portalButton(label = "Ouvrir le portail") {
  return row(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(portalUrl()).setLabel(label));
}

export const candidature = defineCommand({
  name: "candidature",
  description: "Ta candidature à la whitelist de Néa Hélikè.",
  module: MODULE,
  defaultPermission: PERMISSION.tous,
  subcommands: [
    { name: "lien", description: "Lien vers le portail pour déposer ta candidature" },
    { name: "statut", description: "Où en est ta candidature (réponse visible par toi seul)" },
  ],
  async run(ctx) {
    const vars = { lien: portalUrl() };

    if (ctx.subcommand === "lien") {
      await ctx.reply(
        { embeds: [notice(ctx.settings, renderMessage(ctx.settings, "candidature.lien", vars), "Portail de Néa Hélikè")], components: [portalButton()] },
        { private: true },
      );
      return;
    }

    await ctx.defer({ private: true });
    const [account] = await sql()<Account[]>`select cgu_accepted_at, rank from users where id = ${ctx.user.id}`;
    const application = account ? await latestApplication(ctx.user.id) : undefined;
    const key = statusKey(account, application, ctx.member.roles.cache.keys());
    const result = embed(ctx.settings)
      .setTitle("Ta candidature")
      .setDescription(renderMessage(ctx.settings, key, statusVars(application, vars.lien)))
      .setFooter({ text: "Visible par toi seul" });
    // Le bouton n'a pas sa place en MP (repli des commandes préfixe) : le lien figure déjà dans le texte.
    await ctx.reply({ embeds: [result], ...(ctx.source === "slash" && key !== "candidature.statut.whiteliste" && { components: [portalButton()] }) }, { private: true });
  },
});

export const fiche = defineCommand({
  name: "fiche",
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
  description: "Lien entre le bot et le site : salon de logs staff, resynchronisation des rangs.",
  module: MODULE,
  defaultPermission: PERMISSION.gestion,
  protected: true,
  subcommands: [
    { name: "voir", description: "Affiche les réglages du lien avec le site" },
    {
      name: "salon-logs",
      description: "Salon où le staff suit le parcours des joueurs (vide pour le retirer)",
      options: [{ name: "salon", description: "Salon textuel", type: "channel" }],
    },
    { name: "resync", description: "Resynchronise les rangs et la présence de tous les comptes du site" },
  ],
  async run(ctx) {
    const { DISCORD_ROLE_STAFF, DISCORD_ROLE_RECRUTEUR, DISCORD_ROLE_ASPIRANT, DISCORD_ROLE_HELIKEEN, SITE_URL } = env();
    const roles = (ids: (string | undefined)[]) => ids.filter(Boolean).map(id => `<@&${id}>`).join(" ") || "*Non configuré*";

    switch (ctx.subcommand) {
      case "voir": {
        const channelId = siteSettings(ctx.settings).salonLogs;
        await ctx.reply(
          {
            embeds: [
              embed(ctx.settings)
                .setTitle("Lien avec le site")
                .setDescription("Les rôles viennent des variables d'environnement, partagées avec le site.")
                .addFields(
                  { name: "Site", value: SITE_URL },
                  { name: "Salon de logs staff", value: channelId ? `<#${channelId}>` : "*Aucun*" },
                  { name: "Rang staff", value: roles(DISCORD_ROLE_STAFF), inline: true },
                  { name: "Rang recruteur", value: roles(DISCORD_ROLE_RECRUTEUR), inline: true },
                  { name: "Parcours", value: `Attente du vocal : ${roles([DISCORD_ROLE_ASPIRANT])}\nWhitelisté : ${roles([DISCORD_ROLE_HELIKEEN])}` },
                ),
            ],
          },
          { private: true },
        );
        return;
      }
      case "salon-logs": {
        const channel = ctx.channelArg("salon");
        if (channel && !channel.isSendable()) throw new UserError("Ce salon ne peut pas recevoir de messages.");
        await updateSiteSettings(ctx.settings, { salonLogs: channel?.id });
        await ctx.reply({ embeds: [notice(ctx.settings, channel ? `Logs staff envoyés dans ${channel}.` : "Salon de logs staff retiré.")] }, { private: true });
        return;
      }
      case "resync": {
        await ctx.defer({ private: true });
        const result = await resync(ctx.guild);
        await ctx.reply(
          {
            embeds: [
              notice(
                ctx.settings,
                `${result.accounts} compte(s) du site vérifié(s) parmi ${result.members} membre(s) du serveur : ${result.updated.length} correction(s).`,
                "Resynchronisation terminée",
              ),
            ],
          },
          { private: true },
        );
        return;
      }
    }
  },
});
