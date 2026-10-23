import { ButtonStyle, MessageFlags, UserSelectMenuBuilder, type Guild, type ModalSubmitInteraction } from "discord.js";
import type { GuildSettings } from "@/config/store";
import { customId, type ComponentHandler, type PanelInteraction } from "@/core/components";
import type { Payload } from "@/core/context";
import { embed } from "@/core/embeds";
import { UserError } from "@/core/errors";
import { button, choice, field, ICON, modal, row, status } from "@/core/panels";
import { blacklistUser, liftBlacklist, requireAdmin } from "./actions";
import { clampPage, cleanBlacklistReason, pageCount, parseDiscordId, SOURCE_LABELS } from "./logic";
import { blacklistEntry, blacklistPage, type BlacklistEntry, type BlacklistListEntry } from "./store";

const PREFIX = "bla";

const GUIDE =
  "**Blacklister** : choisissez un membre dans le menu, ou « Saisir un ID » pour quelqu'un qui n'est pas sur le serveur. " +
  "Une raison est demandée (facultative) ; l'ID est inscrit dans la blacklist partagée avec le site, puis banni du serveur.\n" +
  "**Lever** : choisissez une personne dans le second menu (page affichée), puis confirmez : la ligne est retirée et le bannissement levé.\n" +
  "**À savoir** : la blacklist fait foi. Un débannissement à la main ne la lève pas : la personne est bannie de nouveau si elle revient. " +
  "Elle est aussi bloquée sur le site. Réservé aux admins et owners du site.";

interface View {
  settings: GuildSettings;
  guild: Guild;
  owner: string;
  notice?: string;
}

function id(view: View, action: string, ...args: string[]) {
  return customId(PREFIX, view.owner, action, ...args);
}

function withNotice(view: View, payload: Payload): Payload {
  return { content: view.notice ? status(view.notice) : "", ...payload };
}

const date = (iso: string) => `<t:${Math.floor(new Date(iso).getTime() / 1000)}:d>`;
const who = (entry: BlacklistListEntry) => (entry.name ? `**${entry.name}** · \`${entry.discord_id}\`` : `<@${entry.discord_id}> · \`${entry.discord_id}\``);

/** Ligne de la liste : nom ou ID, raison, date, auteur et origine. */
export function entryLine(entry: BlacklistListEntry): string {
  const reason = entry.reason ? entry.reason.slice(0, 150).replace(/\n/g, " ") : "*Aucune raison indiquée*";
  return `⛔ ${who(entry)}\n> ${reason}\n> ${date(entry.created_at)} · par <@${entry.created_by_id}> · ${SOURCE_LABELS[entry.source] ?? entry.source}`;
}

export function homeView(view: View, entries: BlacklistListEntry[], total: number, page: number): Payload {
  const pages = pageCount(total);
  const members = new UserSelectMenuBuilder().setCustomId(id(view, "membre", String(page))).setPlaceholder("Blacklister un membre du serveur");
  return withNotice(view, {
    embeds: [
      embed(view.settings, "bronze")
        .setTitle("⛔ Blacklist")
        .setDescription(entries.map(entryLine).join("\n\n").slice(0, 4000) || "*Personne n'est blacklisté.*")
        .setFooter({ text: `${total} personne(s) blacklistée(s) · page ${page + 1}/${pages} · partagée avec le site` }),
    ],
    components: [
      row(members),
      ...(entries.length
        ? [
            row(
              choice(
                id(view, "lever", String(page)),
                entries.map(entry => ({ label: (entry.name ?? entry.discord_id).slice(0, 100), value: entry.discord_id, description: (entry.reason ?? "Aucune raison indiquée").slice(0, 100), emoji: "🔓" })),
                "Lever la blacklist de…",
              ),
            ),
          ]
        : []),
      row(
        button(id(view, "saisir", String(page)), "Saisir un ID", { emoji: ICON.ajouter, style: ButtonStyle.Danger }),
        button(id(view, "page", String(page - 1)), "Précédente", { emoji: "◀️", style: ButtonStyle.Secondary, disabled: page <= 0 }),
        button(id(view, "page", String(page + 1)), "Suivante", { emoji: "▶️", style: ButtonStyle.Secondary, disabled: page >= pages - 1 }),
        button(id(view, "aide"), "Aide", { emoji: ICON.aide, style: ButtonStyle.Secondary }),
        button(id(view, "fermer"), "Fermer", { emoji: ICON.fermer, style: ButtonStyle.Secondary }),
      ),
    ],
  });
}

export function liftView(view: View, entry: BlacklistEntry, page: number): Payload {
  const details = embed(view.settings, "bronze")
    .setTitle(`${ICON.attention} Lever la blacklist ?`)
    .setDescription(`<@${entry.discord_id}> · \`${entry.discord_id}\`\nLa ligne est retirée de la blacklist partagée et son bannissement du serveur est levé. Sur le site, il devra recandidater s'il n'est plus whitelisté.`)
    .addFields(
      { name: "Raison", value: entry.reason?.slice(0, 1024) || "*Aucune raison indiquée*" },
      { name: "Depuis", value: date(entry.created_at), inline: true },
      { name: "Par", value: `<@${entry.created_by_id}>`, inline: true },
      { name: "Origine", value: SOURCE_LABELS[entry.source] ?? entry.source, inline: true },
    );
  return withNotice(view, {
    embeds: [details],
    components: [
      row(
        button(id(view, "lever-ok", entry.discord_id, String(page)), "Lever la blacklist", { emoji: "🔓", style: ButtonStyle.Danger }),
        button(id(view, "page", String(page)), "Retour", { emoji: ICON.retour, style: ButtonStyle.Secondary }),
      ),
    ],
  });
}

/** Rendu d'une page de la liste, avec les données à jour. */
export async function renderBlacklistPanel(view: View, page = 0): Promise<Payload> {
  let list = await blacklistPage(Math.max(0, page));
  const clamped = clampPage(page, list.total);
  if (clamped !== page) list = await blacklistPage(clamped);
  return homeView(view, list.entries, list.total, clamped);
}

// ─── Actions ────────────────────────────────────────────────────────────────

async function show(interaction: PanelInteraction, payload: Payload) {
  if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
  else if (interaction.isModalSubmit() && !interaction.isFromMessage()) await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
  else await interaction.update(payload);
}

function submitted(interaction: PanelInteraction): ModalSubmitInteraction<"cached"> {
  if (!interaction.isModalSubmit()) throw new Error("Formulaire attendu.");
  return interaction;
}

function reasonModal(view: View, targetId: string, page: number, label: string) {
  return modal(id(view, "blacklister", targetId, String(page)), `Blacklister ${label}`, [
    { id: "raison", label: "Raison (facultatif)", long: true, maxLength: 500, placeholder: "Gardée dans la blacklist, visible du staff sur le site" },
  ]);
}

const withWarnings = (text: string, warnings: string[]) => (warnings.length ? `${text} ${ICON.attention} Attention : ${warnings.join(" ")}` : text);

export const blacklistPanel: ComponentHandler = {
  prefix: PREFIX,
  command: "blacklist",
  async handle(interaction, { settings, action, args }) {
    if (action === "fermer") {
      await interaction.deferUpdate();
      return interaction.deleteReply();
    }
    // Le rang peut avoir changé depuis l'ouverture du panneau : revérifié à chaque clic.
    await requireAdmin(interaction.user.id);
    const view: View = { settings, guild: interaction.guild, owner: interaction.user.id };
    const page = Number(args.at(-1) ?? 0) || 0;
    const refresh = async (notice?: string, target = page) => show(interaction, await renderBlacklistPanel({ ...view, notice }, target));

    switch (action) {
      case "page":
        return refresh(undefined, Number(args[0]) || 0);
      case "aide":
        return interaction.reply({ embeds: [embed(settings, "parchemin").setTitle(`${ICON.aide} Aide · Blacklist`).setDescription(GUIDE)], flags: MessageFlags.Ephemeral });
      case "membre": {
        if (!interaction.isUserSelectMenu()) throw new Error("Menu de membres attendu.");
        const user = interaction.users.first();
        if (!user) return refresh();
        if (user.bot) throw new UserError("Un bot ne peut pas être blacklisté.");
        return interaction.showModal(reasonModal(view, user.id, page, user.username));
      }
      case "saisir":
        if (interaction.isModalSubmit()) throw new Error("Un formulaire ne peut pas en ouvrir un autre.");
        return interaction.showModal(
          modal(id(view, "blacklister", "saisie", String(page)), "Blacklister un ID Discord", [
            { id: "id", label: "ID Discord (17 à 20 chiffres)", required: true, maxLength: 25, placeholder: "123456789012345678" },
            { id: "raison", label: "Raison (facultatif)", long: true, maxLength: 500 },
          ]),
        );
      case "blacklister": {
        const form = submitted(interaction);
        const typed = args[0] === "saisie";
        const targetId = typed ? parseDiscordId(field(form, "id")) : parseDiscordId(args[0]);
        if (!targetId) throw new UserError("Cet ID Discord n'est pas valide : 17 à 20 chiffres, par exemple `123456789012345678`.");
        await interaction.deferUpdate();
        const { warnings } = await blacklistUser(interaction.member, targetId, cleanBlacklistReason(field(form, "raison")));
        return refresh(withWarnings(`<@${targetId}> est blacklisté et banni du serveur.`, warnings), 0);
      }
      case "lever": {
        if (!interaction.isStringSelectMenu()) throw new Error("Menu attendu.");
        const entry = await blacklistEntry(interaction.values[0] ?? "");
        if (!entry) return refresh("Cette personne n'est déjà plus blacklistée.");
        return show(interaction, liftView(view, entry, page));
      }
      case "lever-ok": {
        await interaction.deferUpdate();
        const { warnings } = await liftBlacklist(interaction.member, args[0] ?? "");
        return refresh(withWarnings(`Blacklist de <@${args[0]}> levée.`, warnings));
      }
    }
    throw new Error(`Action de panneau inconnue : ${action}`);
  },
};

/** Ouverture du panneau par la commande. */
export async function openBlacklistPanel(settings: GuildSettings, guild: Guild, owner: string): Promise<Payload> {
  await requireAdmin(owner);
  return renderBlacklistPanel({ settings, guild, owner });
}
