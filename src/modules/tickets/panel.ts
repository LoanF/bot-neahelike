import {
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  RoleSelectMenuBuilder,
  type Guild,
  type ModalSubmitInteraction,
} from "discord.js";
import { getSettings, type GuildSettings } from "@/config/store";
import { customId, type ComponentHandler, type PanelInteraction } from "@/core/components";
import type { Payload } from "@/core/context";
import { embed } from "@/core/embeds";
import { UserError } from "@/core/errors";
import { button, choice, field, ICON, modal, row, status } from "@/core/panels";
import { AUTO_CLOSE_CHOICES, cleanQuestions, findCategory, MAX_CATEGORIES, MAX_QUESTIONS, newCategoryId, saveTicketSettings, ticketSettings, type TicketCategory, type TicketSettings } from "./settings";
import { publicPanel, refreshPublicPanel } from "./ui";

const PREFIX = "tkc";

const GUIDE =
  "**1. Où créer les tickets** : choisissez une catégorie Discord ; chaque ticket y devient un salon privé.\n" +
  "**2. Archives** : le salon qui reçoit la transcription (fichier HTML) de chaque ticket fermé.\n" +
  "**3. Catégories** : Support, Plainte joueur… Pour chacune, choisissez les rôles qui voient et gèrent ses tickets, et les questions posées à l'ouverture (5 au plus).\n" +
  "**4. Publier le panneau** : choisissez un salon ; les joueurs y cliquent sur un bouton pour ouvrir un ticket. Le panneau se met à jour tout seul quand vous changez les catégories.\n\n" +
  "Dans un ticket : 🙋 Prendre en charge, 🔒 Fermer (avec une raison), ➕ Ajouter un membre ; une fois fermé : 🔓 Rouvrir ou 🗑️ Supprimer le salon. " +
  "Le joueur reçoit en MP une note de satisfaction de 1 à 5. Un joueur ne peut avoir qu'un ticket ouvert par catégorie.";

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

function panel(view: View, title: string, description: string) {
  return embed(view.settings).setTitle(title).setDescription(description).setFooter({ text: `Tickets · ${view.guild.name}` });
}

const roles = (roleIds: string[]) => (roleIds.length ? roleIds.map(roleId => `<@&${roleId}>`).join(" ") : `${ICON.attention} *aucun rôle : seuls les administrateurs verront ces tickets*`);
const autoCloseLabel = (days?: number) => (days ? `Après ${days} jour(s) sans message` : "Jamais");

// ─── Vues ───────────────────────────────────────────────────────────────────

function home(view: View): Payload {
  const tickets = ticketSettings(view.settings);
  const panelLink = tickets.panel ? `https://discord.com/channels/${view.guild.id}/${tickets.panel.channelId}/${tickets.panel.messageId}` : null;
  const parent = new ChannelSelectMenuBuilder().setCustomId(id(view, "parent")).setPlaceholder("Catégorie Discord où créer les tickets").setChannelTypes(ChannelType.GuildCategory);
  if (tickets.parentId && view.guild.channels.cache.has(tickets.parentId)) parent.addDefaultChannels(tickets.parentId);
  const archives = new ChannelSelectMenuBuilder()
    .setCustomId(id(view, "archives"))
    .setPlaceholder("Salon des transcriptions")
    .setChannelTypes(ChannelType.GuildText);
  if (tickets.archivesId && view.guild.channels.cache.has(tickets.archivesId)) archives.addDefaultChannels(tickets.archivesId);

  return withNotice(view, {
    embeds: [
      panel(view, "🎫 Tickets", "Réglez où naissent les tickets, qui les gère et quelles questions sont posées à l'ouverture.")
        .addFields(
          { name: "Créés dans", value: tickets.parentId ? `<#${tickets.parentId}>` : "*Hors catégorie*", inline: true },
          { name: "Transcriptions", value: tickets.archivesId ? `<#${tickets.archivesId}>` : `${ICON.attention} *Aucun salon*`, inline: true },
          { name: "Fermeture automatique", value: autoCloseLabel(tickets.autoCloseDays), inline: true },
          { name: "Panneau publié", value: panelLink ? `[Voir le panneau](${panelLink})` : "*Pas encore publié*" },
          {
            name: `Catégories (${tickets.categories.length})`,
            value: tickets.categories.map(category => `${category.emoji} **${category.label}** — ${category.roleIds.length} rôle(s), ${category.questions.length} question(s)`).join("\n").slice(0, 1024) || "*Aucune*",
          },
        ),
    ],
    components: [
      ...(tickets.categories.length
        ? [row(choice(id(view, "go", "pick"), tickets.categories.map(category => ({ label: category.label, value: `categorie:${category.id}`, emoji: category.emoji, description: category.description || undefined })), "Régler une catégorie"))]
        : []),
      row(parent),
      row(archives),
      row(
        choice(
          id(view, "auto"),
          [
            { label: "Jamais", value: "jamais", description: "Les tickets restent ouverts jusqu'à leur fermeture", default: !tickets.autoCloseDays },
            ...AUTO_CLOSE_CHOICES.map(days => ({ label: `Après ${days} jour(s) sans message`, value: String(days), default: tickets.autoCloseDays === days })),
          ],
          "Fermeture automatique",
        ),
      ),
      row(
        button(id(view, "categorie-nouvelle"), "Catégorie", { emoji: ICON.ajouter, style: ButtonStyle.Success, disabled: tickets.categories.length >= MAX_CATEGORIES }),
        button(id(view, "go", "publier"), tickets.panel ? "Déplacer le panneau" : "Publier le panneau", { emoji: "📤" }),
        button(id(view, "aide"), "Aide", { emoji: ICON.aide, style: ButtonStyle.Secondary }),
        button(id(view, "fermer"), "Fermer", { emoji: ICON.fermer, style: ButtonStyle.Secondary }),
      ),
    ],
  });
}

function categoryView(view: View, categoryId: string): Payload {
  const tickets = ticketSettings(view.settings);
  const category = findCategory(tickets, categoryId);
  const index = tickets.categories.indexOf(category);
  const select = new RoleSelectMenuBuilder().setCustomId(id(view, "roles", category.id)).setPlaceholder("Rôles qui voient et gèrent ces tickets").setMinValues(0).setMaxValues(10);
  const defaults = category.roleIds.filter(roleId => view.guild.roles.cache.has(roleId));
  if (defaults.length) select.addDefaultRoles(defaults);

  return withNotice(view, {
    embeds: [
      panel(view, `${category.emoji} ${category.label}`, category.description || "*Sans description*").addFields(
        { name: "Rôles de l'équipe", value: roles(category.roleIds).slice(0, 1024) },
        {
          name: `Questions à l'ouverture (${category.questions.length} sur ${MAX_QUESTIONS})`,
          value: category.questions.map((question, position) => `${position + 1}. ${question}`).join("\n") || "*Aucune : le ticket s'ouvre directement.*",
        },
        { name: "Position sur le panneau", value: `${index + 1} sur ${tickets.categories.length}`, inline: true },
      ),
    ],
    components: [
      row(select),
      row(
        button(id(view, "modifier", category.id), "Nom et description", { emoji: ICON.modifier }),
        button(id(view, "questions", category.id), "Questions", { emoji: "📝" }),
        button(id(view, "monter", category.id), "Monter", { emoji: ICON.monter, disabled: index === 0 }),
        button(id(view, "descendre", category.id), "Descendre", { emoji: ICON.descendre, disabled: index === tickets.categories.length - 1 }),
        button(id(view, "go", "suppr", category.id), "Supprimer", { emoji: ICON.supprimer, style: ButtonStyle.Danger }),
      ),
      row(
        button(id(view, "go", "accueil"), "Retour", { emoji: ICON.retour, style: ButtonStyle.Secondary }),
        button(id(view, "aide"), "Aide", { emoji: ICON.aide, style: ButtonStyle.Secondary }),
      ),
    ],
  });
}

function deleteView(view: View, categoryId: string): Payload {
  const category = findCategory(ticketSettings(view.settings), categoryId);
  return withNotice(view, {
    embeds: [
      embed(view.settings, "bronze")
        .setTitle(`${ICON.attention} Supprimer la catégorie ${category.label} ?`)
        .setDescription("Son bouton disparaît du panneau. Les tickets déjà ouverts restent ouverts et gardent leurs salons."),
    ],
    components: [
      row(
        button(id(view, "suppr", category.id), "Supprimer la catégorie", { emoji: ICON.supprimer, style: ButtonStyle.Danger }),
        button(id(view, "go", "categorie", category.id), "Annuler", { emoji: ICON.annuler, style: ButtonStyle.Secondary }),
      ),
    ],
  });
}

function publishView(view: View): Payload {
  return withNotice(view, {
    content: "📤 **Où publier le panneau des tickets ?** Voici l'aperçu de ce que verront les joueurs.",
    ...publicPanel(view.settings, view.guild),
    components: [
      row(new ChannelSelectMenuBuilder().setCustomId(id(view, "publier")).setPlaceholder("Choisir le salon").setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),
      row(button(id(view, "go", "accueil"), "Retour", { emoji: ICON.retour, style: ButtonStyle.Secondary })),
    ],
  });
}

export function renderTicketsPanel(view: View, target = "accueil"): Payload {
  const [name, ...rest] = target.split(":");
  const arg = rest.join(":");
  switch (name) {
    case "categorie":
      return categoryView(view, arg);
    case "suppr":
      return deleteView(view, arg);
    case "publier": {
      // L'aperçu du panneau public ne doit pas cacher la ligne de confirmation.
      const payload = publishView(view);
      return view.notice ? { ...payload, content: status(view.notice) } : payload;
    }
    default:
      return home(view);
  }
}

// ─── Actions ────────────────────────────────────────────────────────────────

async function show(interaction: PanelInteraction, target: string, notice?: string) {
  const settings = await getSettings(interaction.guildId);
  const payload = renderTicketsPanel({ settings, guild: interaction.guild, owner: interaction.user.id, notice }, target);
  if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
  else if (interaction.isModalSubmit() && !interaction.isFromMessage()) await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
  else await interaction.update(payload);
}

function submitted(interaction: PanelInteraction): ModalSubmitInteraction<"cached"> {
  if (!interaction.isModalSubmit()) throw new Error("Formulaire attendu.");
  return interaction;
}

const EMOJI = /^(?:<a?:\w{2,32}:\d{17,20}>|(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[#*0-9]️?⃣)(?:[️‍]|\p{Extended_Pictographic}|\p{Emoji_Modifier})*)$/u;

/** Nom, emoji et description saisis dans le formulaire d'une catégorie. */
function categoryInput(form: ModalSubmitInteraction): Pick<TicketCategory, "label" | "emoji" | "description"> {
  const label = field(form, "nom") ?? "";
  const emoji = field(form, "emoji") ?? "🎫";
  if (!label || label.length > 40) throw new UserError("Le nom doit faire entre 1 et 40 caractères.");
  if (!EMOJI.test(emoji)) throw new UserError(`« ${emoji} » n'est pas un emoji. Colle un seul emoji, par exemple 🛠️.`);
  return { label, emoji, description: field(form, "description") ?? "" };
}

function categoryModal(customIdValue: string, title: string, category?: TicketCategory) {
  return modal(customIdValue, title, [
    { id: "nom", label: "Nom du bouton", value: category?.label, required: true, maxLength: 40, placeholder: "Support" },
    { id: "emoji", label: "Emoji (un seul)", value: category?.emoji, required: true, maxLength: 64, placeholder: "🛠️" },
    { id: "description", label: "Description (affichée sur le panneau)", value: category?.description, maxLength: 100, placeholder: "Un problème technique ou une question générale" },
  ]);
}

/** Enregistre, met à jour le panneau public, puis redessine la vue. */
async function commit(interaction: PanelInteraction, settings: GuildSettings, next: TicketSettings, target: string, notice: string) {
  await saveTicketSettings(settings, next);
  await refreshPublicPanel(interaction.guild);
  return show(interaction, target, notice);
}

export const ticketsPanel: ComponentHandler = {
  prefix: PREFIX,
  command: "tickets",
  async handle(interaction, { settings, action, args }) {
    const tickets = ticketSettings(settings);
    const view: View = { settings, guild: interaction.guild, owner: interaction.user.id };
    const arg = args[0] ?? "";
    const openModal = (form: ReturnType<typeof modal>) => {
      if (interaction.isModalSubmit()) throw new Error("Un formulaire ne peut pas en ouvrir un autre.");
      return interaction.showModal(form);
    };
    const replace = (category: TicketCategory) => tickets.categories.map(item => (item.id === category.id ? category : item));

    switch (action) {
      case "go":
        return show(interaction, interaction.isStringSelectMenu() ? (interaction.values[0] ?? "accueil") : args.join(":"));
      case "aide":
        return interaction.reply({ embeds: [embed(settings, "parchemin").setTitle(`${ICON.aide} Aide · Tickets`).setDescription(GUIDE)], flags: MessageFlags.Ephemeral });
      case "fermer":
        await interaction.deferUpdate();
        return interaction.deleteReply();

      case "parent": {
        if (!interaction.isChannelSelectMenu()) throw new Error("Menu de salons attendu.");
        const parentId = interaction.values[0];
        return commit(interaction, settings, { ...tickets, parentId }, "accueil", `Les tickets seront créés dans <#${parentId}>.`);
      }
      case "archives": {
        if (!interaction.isChannelSelectMenu()) throw new Error("Menu de salons attendu.");
        const channel = interaction.guild.channels.cache.get(interaction.values[0] ?? "");
        const me = interaction.guild.members.me;
        if (!channel || !me || !channel.permissionsFor(me).has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles])) {
          throw new UserError("Le bot ne peut pas envoyer de fichiers dans ce salon : il lui faut Voir le salon, Envoyer des messages et Joindre des fichiers.");
        }
        return commit(interaction, settings, { ...tickets, archivesId: channel.id }, "accueil", `Transcriptions envoyées dans ${channel}.`);
      }
      case "auto": {
        if (!interaction.isStringSelectMenu()) throw new Error("Menu attendu.");
        const value = interaction.values[0];
        const days = value === "jamais" ? undefined : Number(value);
        return commit(interaction, settings, { ...tickets, autoCloseDays: days }, "accueil", `Fermeture automatique : ${autoCloseLabel(days).toLowerCase()}.`);
      }

      case "categorie-nouvelle":
        return openModal(categoryModal(id(view, "categorie-nouvelle-ok"), "Nouvelle catégorie de ticket"));
      case "categorie-nouvelle-ok": {
        if (tickets.categories.length >= MAX_CATEGORIES) throw new UserError(`${MAX_CATEGORIES} catégories au plus.`);
        const category: TicketCategory = { id: newCategoryId(), ...categoryInput(submitted(interaction)), roleIds: [], questions: ["Décris ta demande"] };
        return commit(interaction, settings, { ...tickets, categories: [...tickets.categories, category] }, `categorie:${category.id}`, `Catégorie ${category.label} créée : choisissez ses rôles et ses questions.`);
      }
      case "modifier":
        return openModal(categoryModal(id(view, "modifier-ok", arg), "Nom et description", findCategory(tickets, arg)));
      case "modifier-ok": {
        const category = { ...findCategory(tickets, arg), ...categoryInput(submitted(interaction)) };
        return commit(interaction, settings, { ...tickets, categories: replace(category) }, `categorie:${category.id}`, "Catégorie enregistrée.");
      }
      case "questions": {
        const category = findCategory(tickets, arg);
        return openModal(
          modal(
            id(view, "questions-ok", category.id),
            `Questions · ${category.label}`,
            Array.from({ length: MAX_QUESTIONS }, (_, index) => ({
              id: `q${index}`,
              label: `Question ${index + 1}${index === 0 ? " (obligatoire pour le joueur)" : ""}`,
              value: category.questions[index],
              maxLength: 45,
              placeholder: index === 0 ? "Décris ta demande" : "Laisser vide pour ne pas la poser",
            })),
          ),
        );
      }
      case "questions-ok": {
        const form = submitted(interaction);
        const category = { ...findCategory(tickets, arg), questions: cleanQuestions(Array.from({ length: MAX_QUESTIONS }, (_, index) => field(form, `q${index}`))) };
        return commit(interaction, settings, { ...tickets, categories: replace(category) }, `categorie:${category.id}`, `${category.questions.length} question(s) enregistrée(s).`);
      }
      case "roles": {
        if (!interaction.isRoleSelectMenu()) throw new Error("Menu de rôles attendu.");
        const category = { ...findCategory(tickets, arg), roleIds: interaction.values };
        return commit(interaction, settings, { ...tickets, categories: replace(category) }, `categorie:${category.id}`, `${category.roleIds.length} rôle(s) pour ${category.label}.`);
      }
      case "monter":
      case "descendre": {
        const index = tickets.categories.findIndex(category => category.id === arg);
        const target = action === "monter" ? index - 1 : index + 1;
        if (index < 0 || target < 0 || target >= tickets.categories.length) return show(interaction, `categorie:${arg}`);
        const categories = [...tickets.categories];
        [categories[index], categories[target]] = [categories[target]!, categories[index]!];
        return commit(interaction, settings, { ...tickets, categories }, `categorie:${arg}`, "Ordre du panneau mis à jour.");
      }
      case "suppr": {
        const category = findCategory(tickets, arg);
        return commit(interaction, settings, { ...tickets, categories: tickets.categories.filter(item => item.id !== category.id) }, "accueil", `Catégorie ${category.label} supprimée.`);
      }

      case "publier": {
        if (!interaction.isChannelSelectMenu()) throw new Error("Menu de salons attendu.");
        const channel = interaction.guild.channels.cache.get(interaction.values[0] ?? "");
        if (!channel?.isSendable()) throw new UserError("Ce salon ne peut pas recevoir de messages.");
        const me = interaction.guild.members.me;
        if (!me || !channel.permissionsFor(me).has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
          throw new UserError(`Le bot ne peut pas publier dans ${channel} : il lui faut Voir le salon, Envoyer des messages et Intégrer des liens.`);
        }
        const message = await channel.send(publicPanel(settings, interaction.guild));
        // L'ancien panneau est retiré : un seul panneau à jour à la fois.
        if (tickets.panel) {
          const previous = interaction.guild.channels.cache.get(tickets.panel.channelId);
          if (previous?.isTextBased()) await previous.messages.delete(tickets.panel.messageId).catch(() => {});
        }
        await saveTicketSettings(settings, { ...tickets, panel: { channelId: channel.id, messageId: message.id } });
        return show(interaction, "accueil", `Panneau publié dans ${channel}.`);
      }
    }
    throw new Error(`Action de panneau inconnue : ${action}`);
  },
};
