import { ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType, MessageFlags } from "discord.js";
import { getSettings, type GuildSettings } from "@/config/store";
import { customId, type ComponentHandler, type PanelInteraction } from "@/core/components";
import type { Payload } from "@/core/context";
import { embed } from "@/core/embeds";
import { UserError } from "@/core/errors";
import { renderMessage } from "@/core/messages";
import { button, ICON, row, status } from "@/core/panels";
import { sql } from "@/db";
import { env } from "@/env";
import { latestApplication, reapplyLock, statusKey, statusVars, type Account } from "./applications";
import { resync } from "./events";
import { roleRanks } from "./fiche";
import { siteSettings, updateSiteSettings } from "./settings";

export function portalUrl() {
  return `${env().SITE_URL}/connexion`;
}

export function portalButton(label = "Ouvrir le portail") {
  return new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(portalUrl()).setLabel(label);
}

const withNotice = (notice: string | undefined, payload: Payload): Payload => ({ content: notice ? status(notice) : "", ...payload });

// ─── /site : réglages du lien avec le site (staff) ──────────────────────────

const SITE_PREFIX = "sit";

const SITE_GUIDE =
  "**Salon de logs staff** : choisissez-le dans le menu. Le bot y relaie le parcours des joueurs (candidature envoyée, validée, à modifier, refusée, entretien), " +
  "les changements de rang et la blacklist. « Retirer le salon » arrête ce relais.\n" +
  "**Rangs** : recruteur, admin et owner se règlent sur le site ; le panneau montre les rôles qui les donnent, le bot ne fait que les lire.\n" +
  "**Resynchroniser** : revérifie qui, parmi les comptes du site, est encore sur le serveur. Le bot le fait déjà seul au démarrage et à chaque arrivée ou départ.";

export interface SiteView {
  settings: GuildSettings;
  owner: string;
  notice?: string;
}

export function siteView(view: SiteView, ranks: { admin: string[]; recruteur: string[] }): Payload {
  const { DISCORD_ROLE_ATTENTE_WL, DISCORD_ROLE_WL, SITE_URL } = env();
  const roles = (ids: (string | undefined)[]) => ids.filter(Boolean).map(id => `<@&${id}>`).join(" ") || "*Non configuré*";
  const channelId = siteSettings(view.settings).salonLogs;
  const id = (action: string) => customId(SITE_PREFIX, view.owner, action);

  const channels = new ChannelSelectMenuBuilder().setCustomId(id("salon")).setPlaceholder("Salon de logs staff").setChannelTypes(ChannelType.GuildText);
  if (channelId) channels.addDefaultChannels(channelId);

  return withNotice(view.notice, {
    embeds: [
      embed(view.settings)
        .setTitle(`${ICON.site} Lien avec le site`)
        .setDescription("Les rangs du site (recruteur, admin, owner) se règlent sur le site ; le bot ne fait que les lire.")
        .addFields(
          { name: "Site", value: SITE_URL },
          { name: "Salon de logs staff", value: channelId ? `<#${channelId}>` : "*Aucun*" },
          { name: "Rang admin", value: roles(ranks.admin), inline: true },
          { name: "Rang recruteur", value: roles(ranks.recruteur), inline: true },
          { name: "Parcours", value: `Attente du vocal : ${roles([DISCORD_ROLE_ATTENTE_WL])}\nWhitelisté : ${roles([DISCORD_ROLE_WL])}` },
        ),
    ],
    components: [
      row(channels),
      row(
        button(id("salon-retirer"), "Retirer le salon", { emoji: ICON.retirer, style: ButtonStyle.Secondary, disabled: !channelId }),
        button(id("resync"), "Resynchroniser", { emoji: "🔄" }),
        new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(SITE_URL).setLabel("Ouvrir le site"),
        button(id("aide"), "Aide", { emoji: ICON.aide, style: ButtonStyle.Secondary }),
        button(id("fermer"), "Fermer", { emoji: ICON.fermer, style: ButtonStyle.Secondary }),
      ),
    ],
  });
}

export async function renderSitePanel(view: SiteView): Promise<Payload> {
  return siteView(view, await roleRanks());
}

async function show(interaction: PanelInteraction, payload: Payload) {
  if (interaction.deferred || interaction.replied || interaction.isModalSubmit()) await interaction.editReply(payload);
  else await interaction.update(payload);
}

export const sitePanel: ComponentHandler = {
  prefix: SITE_PREFIX,
  command: "site",
  async handle(interaction, { settings, action }) {
    const view: SiteView = { settings, owner: interaction.user.id };
    const refresh = async (notice: string) => show(interaction, await renderSitePanel({ ...view, settings: await getSettings(interaction.guildId), notice }));
    switch (action) {
      case "aide":
        return interaction.reply({ embeds: [embed(settings, "parchemin").setTitle(`${ICON.aide} Aide · Lien avec le site`).setDescription(SITE_GUIDE)], flags: MessageFlags.Ephemeral });
      case "fermer":
        await interaction.deferUpdate();
        return interaction.deleteReply();
      case "salon": {
        if (!interaction.isChannelSelectMenu()) throw new Error("Menu de salons attendu.");
        const channel = interaction.channels.first();
        if (!channel) {
          await updateSiteSettings(settings, { salonLogs: undefined });
          return refresh("Salon de logs staff retiré.");
        }
        if (!("isSendable" in channel) || !channel.isSendable()) throw new UserError("Ce salon ne peut pas recevoir de messages.");
        await updateSiteSettings(settings, { salonLogs: channel.id });
        return refresh(`Logs staff envoyés dans ${channel}.`);
      }
      case "salon-retirer":
        await updateSiteSettings(settings, { salonLogs: undefined });
        return refresh("Salon de logs staff retiré.");
      case "resync": {
        await interaction.deferUpdate();
        const result = await resync(interaction.guild, { refresh: true });
        return refresh(`${result.accounts} compte(s) du site vérifié(s) parmi ${result.members} membre(s) : ${result.updated.length} présence(s) corrigée(s).`);
      }
    }
    throw new Error(`Action de panneau inconnue : ${action}`);
  },
};

// ─── /candidature : où en est le joueur (tout le monde) ─────────────────────

const CANDIDATURE_PREFIX = "cdt";

const CANDIDATURE_GUIDE =
  "**1. Lier ton compte** : connecte-toi au portail avec Discord et accepte les conditions d'utilisation.\n" +
  "**2. Remplir ta candidature** : informations HRP, personnage, background (et dossier si tu en veux un). Tu peux t'arrêter et reprendre plus tard.\n" +
  "**3. L'envoyer** : les recruteurs la lisent. Ils peuvent te demander de reprendre certaines étapes : corrige-les et renvoie-la.\n" +
  "**4. Entretien vocal** : une fois ta candidature validée, les salons de whitelist te sont ouverts.\n" +
  "**5. Whitelist** : après l'entretien, tu deviens citoyen de Néa Hélikè.\n" +
  "Tu es prévenu en message privé à chaque étape. « Actualiser » relit ton statut.";

/** Statut de candidature, tel que le joueur le voit sur son tableau de bord. */
export async function candidatureEmbed(settings: GuildSettings, userId: string, roles: Iterable<string>) {
  const [account] = await sql()<Account[]>`select cgu_accepted_at, rank from users where id = ${userId}`;
  const [application, lock] = account ? await Promise.all([latestApplication(userId), reapplyLock(userId)]) : [undefined, null];
  const key = statusKey(account, application, roles, new Date(), lock);
  const result = embed(settings)
    .setTitle("Ta candidature")
    .setDescription(renderMessage(settings, key, statusVars(application, portalUrl(), lock)))
    .setFooter({ text: "Visible par toi seul" });
  return { embed: result, whitelisted: key === "candidature.statut.whiteliste" };
}

export function candidatureComponents(owner: string, whitelisted: boolean) {
  const id = (action: string) => customId(CANDIDATURE_PREFIX, owner, action);
  return [
    row(
      ...(whitelisted ? [] : [portalButton()]),
      button(id("actualiser"), "Actualiser", { emoji: "🔄", style: ButtonStyle.Secondary }),
      button(id("aide"), "Comment ça marche", { emoji: ICON.aide, style: ButtonStyle.Secondary }),
    ),
  ];
}

export const candidaturePanel: ComponentHandler = {
  prefix: CANDIDATURE_PREFIX,
  command: "candidature",
  async handle(interaction, { settings, action }) {
    switch (action) {
      case "aide":
        return interaction.reply({
          embeds: [embed(settings, "parchemin").setTitle(`${ICON.aide} Comment ça marche`).setDescription(CANDIDATURE_GUIDE)],
          components: [row(portalButton())],
          flags: MessageFlags.Ephemeral,
        });
      case "actualiser": {
        await interaction.deferUpdate();
        const result = await candidatureEmbed(settings, interaction.user.id, interaction.member.roles.cache.keys());
        return interaction.editReply({ content: status("Statut actualisé."), embeds: [result.embed], components: candidatureComponents(interaction.user.id, result.whitelisted) });
      }
    }
    throw new Error(`Action de panneau inconnue : ${action}`);
  },
};
