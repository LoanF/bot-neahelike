import {
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  RoleSelectMenuBuilder,
  type APIEmbed,
  type Guild,
  type GuildMember,
  type ModalSubmitInteraction,
} from "discord.js";
import { getSettings, type GuildSettings } from "@/config/store";
import { hexToInt } from "@/core/args";
import { customId, type ComponentHandler, type PanelInteraction } from "@/core/components";
import type { Payload } from "@/core/context";
import { embed as themed } from "@/core/embeds";
import { UserError } from "@/core/errors";
import { button, choice, field, ICON, modal, row, status } from "@/core/panels";
import { COLOR_NAMES, createState, edit, isEmpty, LIMITS, parseColor, parseUrl, redo, setOrClear, undo, type DraftState } from "./draft";

const PREFIX = "emb";

/** Un brouillon par membre, gardé en mémoire 2 heures après sa dernière modification. */
const DRAFT_TTL_MS = 2 * 60 * 60 * 1000;
const drafts = new Map<string, { state: DraftState; touched: number }>();

function sweep() {
  const now = Date.now();
  for (const [owner, draft] of drafts) if (now - draft.touched > DRAFT_TTL_MS) drafts.delete(owner);
}

/** Brouillon du membre ; `create` en ouvre un nouveau s'il n'en a pas. */
export function draftOf(owner: string, settings: GuildSettings, create = false): DraftState {
  sweep();
  const existing = drafts.get(owner);
  if (existing) return existing.state;
  if (!create) throw new UserError("Ce brouillon a expiré (redémarrage du bot ou 2 heures sans modification). Relance `/embed`.");
  const state = createState(hexToInt(settings.config.embed_color));
  drafts.set(owner, { state, touched: Date.now() });
  return state;
}

export function hasDraft(owner: string) {
  sweep();
  return drafts.has(owner);
}

function save(owner: string, state: DraftState) {
  drafts.set(owner, { state, touched: Date.now() });
}

const GUIDE =
  "Construis ton embed pas à pas : choisis un élément dans le menu « Fais un choix », remplis le formulaire, et l'aperçu se met à jour aussitôt.\n\n" +
  `• ${ICON.defaire} **Défaire** et ${ICON.refaire} **Refaire** annulent ou rétablissent la dernière modification.\n` +
  `• ${ICON.valider} **Valider** : choisis le salon, puis l'embed est publié.\n` +
  `• ${ICON.annuler} **Supprimer** abandonne le brouillon.\n\n` +
  `Couleurs : ${COLOR_NAMES.join(", ")}, ou un code comme \`#d1a64a\`. Les images doivent être des adresses \`https://\`.\n` +
  "Ton brouillon est gardé 2 heures ; relance `/embed` pour le retrouver.";

interface View {
  settings: GuildSettings;
  guild: Guild;
  owner: string;
  notice?: string;
}

function id(view: View, action: string, ...args: string[]) {
  return customId(PREFIX, view.owner, action, ...args);
}

/** L'aperçu, exactement tel qu'il sera publié. */
function preview(view: View, embed: APIEmbed): EmbedBuilder {
  if (isEmpty(embed)) {
    return new EmbedBuilder()
      .setColor(embed.color ?? hexToInt(view.settings.config.embed_color))
      .setDescription("*Ton embed est vide : choisis un élément dans le menu « Fais un choix ».*");
  }
  return new EmbedBuilder(embed);
}

/** Nom du rôle mentionné, sans le mentionner réellement dans le panneau. */
function mentionLabel(guild: Guild, roleId: string | null) {
  if (!roleId) return null;
  return `@${guild.roles.cache.get(roleId)?.name ?? "rôle supprimé"}`;
}

function header(view: View, state: DraftState) {
  const mention = mentionLabel(view.guild, state.current.mention);
  const lines = [view.notice ? status(view.notice) : `${ICON.image} **Aperçu de ton embed**`];
  if (mention) lines.push(`Mention au-dessus : **${mention}**`);
  return lines.join("\n");
}

function editor(view: View, state: DraftState): Payload {
  const { embed, mention } = state.current;
  const fields = embed.fields ?? [];
  const short = (text?: string | null) => (text ? text.slice(0, 90) : "Vide");

  return {
    content: header(view, state),
    embeds: [preview(view, embed)],
    components: [
      row(
        choice(id(view, "element"), [
          { label: "Titre", value: "titre", emoji: "✏️", description: short(embed.title) },
          { label: "Description", value: "description", emoji: "📝", description: short(embed.description) },
          { label: "Couleur", value: "couleur", emoji: ICON.couleurs, description: embed.color !== undefined ? `#${embed.color.toString(16).padStart(6, "0")}` : "Aucune" },
          { label: "Auteur", value: "auteur", emoji: "👤", description: short(embed.author?.name) },
          { label: "Miniature", value: "miniature", emoji: ICON.image, description: embed.thumbnail ? "Définie" : "Aucune" },
          { label: "Image", value: "image", emoji: "🏞️", description: embed.image ? "Définie" : "Aucune" },
          { label: "Pied de page", value: "pied", emoji: "🔻", description: short(embed.footer?.text) },
          { label: `Horodatage : ${embed.timestamp ? "activé" : "désactivé"}`, value: "horodatage", emoji: "🕒", description: "Affiche la date de publication" },
          { label: "Ajouter un champ", value: "champ-ajouter", emoji: ICON.ajouter, description: `${fields.length} sur ${LIMITS.fields}` },
          ...(fields.length ? [{ label: "Retirer un champ", value: "champ-retirer", emoji: ICON.retirer }] : []),
          { label: "Mention au-dessus", value: "mention", emoji: "📣", description: mentionLabel(view.guild, mention) ?? "Aucune" },
          { label: "Tout effacer", value: "vider", emoji: "🧹", description: "Repartir d'un embed vide" },
        ]),
      ),
      row(
        button(id(view, "defaire"), "Défaire", { emoji: ICON.defaire, disabled: state.past.length === 0 }),
        button(id(view, "refaire"), "Refaire", { emoji: ICON.refaire, disabled: state.future.length === 0 }),
        button(id(view, "go", "publier"), "Valider", { emoji: ICON.valider, style: ButtonStyle.Success, disabled: isEmpty(embed) }),
        button(id(view, "supprimer"), "Supprimer", { emoji: ICON.annuler, style: ButtonStyle.Danger }),
        button(id(view, "aide"), "Aide", { emoji: ICON.aide, style: ButtonStyle.Secondary }),
      ),
    ],
  };
}

function publishView(view: View, state: DraftState): Payload {
  return {
    content: `${ICON.valider} **Où publier cet embed ?** Choisis le salon dans le menu.`,
    embeds: [preview(view, state.current.embed)],
    components: [
      row(
        new ChannelSelectMenuBuilder()
          .setCustomId(id(view, "publier"))
          .setPlaceholder("Choisir le salon")
          .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
      ),
      row(button(id(view, "go", "editeur"), "Retour", { emoji: ICON.retour, style: ButtonStyle.Secondary })),
    ],
  };
}

function removeFieldView(view: View, state: DraftState): Payload {
  const fields = state.current.embed.fields ?? [];
  return {
    content: `${ICON.retirer} **Quel champ retirer ?**`,
    embeds: [preview(view, state.current.embed)],
    components: [
      row(
        choice(
          id(view, "champ-retirer"),
          fields.map((item, index) => ({ label: `${index + 1}. ${item.name}`, value: String(index), description: item.value.slice(0, 90) })),
          "Choisir le champ",
        ),
      ),
      row(button(id(view, "go", "editeur"), "Retour", { emoji: ICON.retour, style: ButtonStyle.Secondary })),
    ],
  };
}

function mentionView(view: View, state: DraftState): Payload {
  const select = new RoleSelectMenuBuilder().setCustomId(id(view, "mention")).setPlaceholder("Rôle à mentionner au-dessus de l'embed").setMinValues(1).setMaxValues(1);
  const current = state.current.mention;
  if (current && view.guild.roles.cache.has(current)) select.addDefaultRoles(current);
  return {
    content: "📣 **Quel rôle mentionner au-dessus de l'embed ?** Il recevra une notification à la publication.",
    embeds: [preview(view, state.current.embed)],
    components: [
      row(select),
      row(
        button(id(view, "sans-mention"), "Aucune mention", { emoji: ICON.retirer, style: ButtonStyle.Secondary, disabled: !current }),
        button(id(view, "go", "editeur"), "Retour", { emoji: ICON.retour, style: ButtonStyle.Secondary }),
      ),
    ],
  };
}

export function renderEmbedPanel(view: View, target = "editeur"): Payload {
  const state = draftOf(view.owner, view.settings);
  switch (target) {
    case "publier":
      return publishView(view, state);
    case "champs":
      // Discord refuse un menu sans option : sans champ, retour à l'éditeur.
      return state.current.embed.fields?.length ? removeFieldView(view, state) : editor(view, state);
    case "mention":
      return mentionView(view, state);
    default:
      return editor(view, state);
  }
}

// ─── Actions ────────────────────────────────────────────────────────────────

async function show(interaction: PanelInteraction, target: string, notice?: string) {
  const settings = await getSettings(interaction.guildId);
  const payload = renderEmbedPanel({ settings, guild: interaction.guild, owner: interaction.user.id, notice }, target);
  if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
  else if (interaction.isModalSubmit() && !interaction.isFromMessage()) await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
  else await interaction.update(payload);
}

function submitted(interaction: PanelInteraction): ModalSubmitInteraction<"cached"> {
  if (!interaction.isModalSubmit()) throw new Error("Formulaire attendu.");
  return interaction;
}

/** Formulaire de chaque élément de l'embed, prérempli avec la valeur actuelle. */
function elementModal(owner: string, element: string, embed: APIEmbed) {
  const modalId = customId(PREFIX, owner, "enregistrer", element);
  switch (element) {
    case "titre":
      return modal(modalId, "Titre", [
        { id: "texte", label: "Titre (vide pour le retirer)", value: embed.title, maxLength: LIMITS.title },
        { id: "url", label: "Lien du titre (facultatif)", value: embed.url, placeholder: "https://…" },
      ]);
    case "description":
      return modal(modalId, "Description", [{ id: "texte", label: "Texte (Markdown accepté)", value: embed.description, long: true, maxLength: 4000 }]);
    case "couleur":
      return modal(modalId, "Couleur", [
        {
          id: "texte",
          label: "Nom ou code hexadécimal",
          value: embed.color !== undefined ? `#${embed.color.toString(16).padStart(6, "0")}` : null,
          required: true,
          maxLength: 20,
          placeholder: "or, bronze, rouge, #d1a64a…",
        },
      ]);
    case "auteur":
      return modal(modalId, "Auteur", [
        { id: "texte", label: "Nom (vide pour le retirer)", value: embed.author?.name, maxLength: LIMITS.author },
        { id: "url", label: "Adresse de l'icône (facultatif)", value: embed.author?.icon_url, placeholder: "https://…" },
      ]);
    case "miniature":
      return modal(modalId, "Miniature", [{ id: "url", label: "Adresse de l'image (vide pour la retirer)", value: embed.thumbnail?.url, placeholder: "https://…" }]);
    case "image":
      return modal(modalId, "Image", [{ id: "url", label: "Adresse de l'image (vide pour la retirer)", value: embed.image?.url, placeholder: "https://…" }]);
    case "pied":
      return modal(modalId, "Pied de page", [
        { id: "texte", label: "Texte (vide pour le retirer)", value: embed.footer?.text, long: true, maxLength: LIMITS.footer },
        { id: "url", label: "Adresse de l'icône (facultatif)", value: embed.footer?.icon_url, placeholder: "https://…" },
      ]);
    case "champ-ajouter":
      return modal(modalId, "Nouveau champ", [
        { id: "nom", label: "Nom du champ", required: true, maxLength: LIMITS.fieldName },
        { id: "valeur", label: "Contenu du champ", required: true, long: true, maxLength: LIMITS.fieldValue },
        { id: "ligne", label: "Sur la même ligne que le précédent ? (oui/non)", value: "non", maxLength: 3 },
      ]);
  }
  return null;
}

/** Applique le formulaire envoyé pour un élément. */
export function applyElement(element: string, form: ModalSubmitInteraction, embed: APIEmbed): APIEmbed {
  // Chaque formulaire a ses propres champs : on ne lit que ceux de l'élément modifié.
  const text = () => field(form, "texte");
  const url = () => parseUrl(field(form, "url"), "Adresse");
  switch (element) {
    case "titre":
      return setOrClear(setOrClear(embed, "title", text()), "url", text() ? url() : null);
    case "description":
      return setOrClear(embed, "description", text());
    case "couleur": {
      const raw = text() ?? "";
      const color = parseColor(raw);
      if (color === null) throw new UserError(`Couleur inconnue : « ${raw} ». Essaie ${COLOR_NAMES.slice(0, 5).join(", ")}… ou un code comme #d1a64a.`);
      return { ...embed, color };
    }
    case "auteur": {
      const name = text();
      const icon = url();
      return setOrClear(embed, "author", name ? { name, ...(icon && { icon_url: icon }) } : null);
    }
    case "miniature": {
      const image = url();
      return setOrClear(embed, "thumbnail", image ? { url: image } : null);
    }
    case "image": {
      const image = url();
      return setOrClear(embed, "image", image ? { url: image } : null);
    }
    case "pied": {
      const footer = text();
      const icon = url();
      return setOrClear(embed, "footer", footer ? { text: footer, ...(icon && { icon_url: icon }) } : null);
    }
    case "champ-ajouter": {
      const fields = embed.fields ?? [];
      if (fields.length >= LIMITS.fields) throw new UserError(`Un embed ne peut pas avoir plus de ${LIMITS.fields} champs.`);
      const inline = ["oui", "o", "yes"].includes((field(form, "ligne") ?? "").toLowerCase());
      return { ...embed, fields: [...fields, { name: field(form, "nom") ?? "", value: field(form, "valeur") ?? "", inline }] };
    }
  }
  throw new Error(`Élément inconnu : ${element}`);
}

/** Le membre et le bot doivent pouvoir écrire dans le salon ; la mention doit être permise au membre. */
function checkPublish(member: GuildMember, channelId: string, mention: string | null) {
  const channel = member.guild.channels.cache.get(channelId);
  if (!channel?.isSendable()) throw new UserError("Ce salon ne peut pas recevoir de messages.");
  const me = member.guild.members.me;
  if (!me || !channel.permissionsFor(me).has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
    throw new UserError(`Le bot ne peut pas publier dans ${channel} : il lui faut Voir le salon, Envoyer des messages et Intégrer des liens.`);
  }
  if (!channel.permissionsFor(member).has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
    throw new UserError(`Tu ne peux pas écrire dans ${channel} : choisis un autre salon.`);
  }
  if (mention) {
    const role = member.guild.roles.cache.get(mention);
    if (!role) throw new UserError("Le rôle à mentionner n'existe plus : retire la mention.");
    if (!role.mentionable && !channel.permissionsFor(member).has(PermissionFlagsBits.MentionEveryone)) {
      throw new UserError(`Tu ne peux pas mentionner ${role.name} : ce rôle n'est pas mentionnable par tous.`);
    }
  }
  return channel;
}

export const embedPanel: ComponentHandler = {
  prefix: PREFIX,
  command: "embed",
  async handle(interaction, { settings, action, args }) {
    const owner = interaction.user.id;
    const arg = args[0] ?? "";
    const view: View = { settings, guild: interaction.guild, owner };
    const afterwards = (content: string, embeds: EmbedBuilder[]) => ({
      content,
      embeds,
      components: [
        row(
          button(id(view, "nouveau"), "Nouvel embed", { emoji: ICON.ajouter }),
          button(id(view, "fermer"), "Fermer", { emoji: ICON.fermer, style: ButtonStyle.Secondary }),
        ),
      ],
    });

    switch (action) {
      case "go":
        return show(interaction, arg);
      case "aide":
        return interaction.reply({
          embeds: [themed(settings, "parchemin").setTitle(`${ICON.aide} Aide · Créateur d'embeds`).setDescription(GUIDE)],
          flags: MessageFlags.Ephemeral,
        });
      case "nouveau":
        draftOf(owner, settings, true);
        return show(interaction, "editeur", "Nouvel embed : à toi de jouer.");
      case "fermer":
        await interaction.deferUpdate();
        return interaction.deleteReply();

      case "element": {
        if (!interaction.isStringSelectMenu()) throw new Error("Menu attendu.");
        const element = interaction.values[0] ?? "";
        const state = draftOf(owner, settings);
        if (element === "champ-retirer") return show(interaction, "champs");
        if (element === "mention") return show(interaction, "mention");
        if (element === "horodatage") {
          const had = Boolean(state.current.embed.timestamp);
          save(owner, edit(state, draft => ({ ...draft, embed: setOrClear(draft.embed, "timestamp", had ? null : new Date().toISOString()) })));
          return show(interaction, "editeur", had ? "Horodatage retiré." : "Horodatage ajouté : il indiquera l'heure de publication.");
        }
        if (element === "vider") {
          save(owner, edit(state, draft => ({ embed: { color: draft.embed.color }, mention: null })));
          return show(interaction, "editeur", "Embed vidé (Défaire pour revenir en arrière).");
        }
        const form = elementModal(owner, element, state.current.embed);
        if (!form) throw new Error(`Élément inconnu : ${element}`);
        return interaction.showModal(form);
      }
      case "enregistrer": {
        const form = submitted(interaction);
        save(owner, edit(draftOf(owner, settings), draft => ({ ...draft, embed: applyElement(arg, form, draft.embed) })));
        return show(interaction, "editeur", "Aperçu mis à jour.");
      }
      case "champ-retirer": {
        if (!interaction.isStringSelectMenu()) throw new Error("Menu attendu.");
        const index = Number(interaction.values[0]);
        save(
          owner,
          edit(draftOf(owner, settings), draft => {
            const fields = (draft.embed.fields ?? []).filter((_, position) => position !== index);
            return { ...draft, embed: setOrClear(draft.embed, "fields", fields.length ? fields : null) };
          }),
        );
        return show(interaction, "editeur", "Champ retiré.");
      }
      case "mention": {
        if (!interaction.isRoleSelectMenu()) throw new Error("Menu de rôles attendu.");
        const roleId = interaction.values[0] ?? null;
        save(owner, edit(draftOf(owner, settings), draft => ({ ...draft, mention: roleId })));
        return show(interaction, "editeur", `Mention ajoutée : ${mentionLabel(interaction.guild, roleId)}.`);
      }
      case "sans-mention":
        save(owner, edit(draftOf(owner, settings), draft => ({ ...draft, mention: null })));
        return show(interaction, "editeur", "Mention retirée.");
      case "defaire":
        save(owner, undo(draftOf(owner, settings)));
        return show(interaction, "editeur", "Modification défaite.");
      case "refaire":
        save(owner, redo(draftOf(owner, settings)));
        return show(interaction, "editeur", "Modification rétablie.");
      case "supprimer":
        if (!interaction.isButton()) throw new Error("Bouton attendu.");
        drafts.delete(owner);
        return interaction.update(afterwards(`${ICON.annuler} Brouillon supprimé.`, []));

      case "publier": {
        if (!interaction.isChannelSelectMenu()) throw new Error("Menu de salons attendu.");
        const { current } = draftOf(owner, settings);
        if (isEmpty(current.embed)) throw new UserError("L'embed est vide : ajoute au moins un texte ou une image.");
        const channel = checkPublish(interaction.member, interaction.values[0] ?? "", current.mention);
        // L'horodatage indique le moment de la publication, pas celui du brouillon.
        const published = { ...current.embed, ...(current.embed.timestamp && { timestamp: new Date().toISOString() }) };
        const message = await channel.send({
          ...(current.mention && { content: `<@&${current.mention}>` }),
          embeds: [published],
          allowedMentions: { parse: [], roles: current.mention ? [current.mention] : [] },
        });
        drafts.delete(owner);
        return interaction.update(afterwards(`${status(`Embed publié dans ${channel}.`)} [Voir le message](${message.url})`, [new EmbedBuilder(published)]));
      }
    }
    throw new Error(`Action de panneau inconnue : ${action}`);
  },
};
