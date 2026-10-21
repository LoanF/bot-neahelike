import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type MessageActionRowComponentBuilder,
  type ModalSubmitInteraction,
} from "discord.js";

/**
 * Kit d'interface commun à tous les panneaux : un aperçu (embed) en haut, un menu « Fais un choix »,
 * puis une rangée de boutons avec emoji. Les actions principales sont en bleu, le retour en gris,
 * la suppression en rouge ; un bouton indisponible est grisé plutôt que retiré.
 */

export type Row = ActionRowBuilder<MessageActionRowComponentBuilder>;

/** Symboles communs : un sens = un emoji, partout dans le bot. */
export const ICON = {
  valider: "✅",
  annuler: "❌",
  retour: "↩️",
  defaire: "↩️",
  refaire: "↪️",
  modifier: "✏️",
  ajouter: "➕",
  retirer: "➖",
  supprimer: "🗑️",
  monter: "⬆️",
  descendre: "⬇️",
  aide: "❓",
  fermer: "✖️",
  essai: "📨",
  reinitialiser: "♻️",
  actif: "🟢",
  inactif: "⚫",
  verrou: "🔒",
  fait: "✅",
  afaire: "⬜",
  attention: "⚠️",
  general: "⚙️",
  couleurs: "🎨",
  modules: "🧩",
  acces: "🛡️",
  commandes: "⌨️",
  profil: "🪪",
  image: "🖼️",
  activite: "🎮",
  messages: "💬",
  salon: "📜",
  site: "🏛️",
} as const;

export function row(...components: MessageActionRowComponentBuilder[]): Row {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(components);
}

export interface ButtonOptions {
  emoji?: string;
  style?: ButtonStyle;
  disabled?: boolean;
}

/** Bouton d'action : bleu par défaut, comme les panneaux de référence. */
export function button(id: string, label: string, { emoji, style = ButtonStyle.Primary, disabled = false }: ButtonOptions = {}): ButtonBuilder {
  const result = new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);
  if (emoji) result.setEmoji(emoji);
  return result;
}

export interface ChoiceOption {
  label: string;
  value: string;
  description?: string;
  emoji?: string;
  default?: boolean;
}

/** Menu déroulant « Fais un choix » (25 options au plus). */
export function choice(id: string, options: ChoiceOption[], placeholder = "Fais un choix"): StringSelectMenuBuilder {
  return new StringSelectMenuBuilder()
    .setCustomId(id)
    .setPlaceholder(placeholder)
    .addOptions(
      options.slice(0, 25).map(option => ({
        label: option.label.slice(0, 100),
        value: option.value,
        ...(option.description && { description: option.description.slice(0, 100) }),
        ...(option.emoji && { emoji: option.emoji }),
        ...(option.default && { default: true }),
      })),
    );
}

/** Ligne de confirmation affichée au-dessus du panneau après une action. */
export function status(text: string): string {
  return `${ICON.valider} ${text}`;
}

export interface ModalField {
  id: string;
  label: string;
  value?: string | null;
  long?: boolean;
  required?: boolean;
  maxLength?: number;
  placeholder?: string;
}

export function modal(id: string, title: string, fields: ModalField[]): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(id)
    .setTitle(title.slice(0, 45))
    .addComponents(
      fields.map(item => {
        const input = new TextInputBuilder()
          .setCustomId(item.id)
          .setLabel(item.label.slice(0, 45))
          .setStyle(item.long ? TextInputStyle.Paragraph : TextInputStyle.Short)
          .setRequired(item.required ?? false);
        if (item.value) input.setValue(item.value);
        if (item.maxLength) input.setMaxLength(item.maxLength);
        if (item.placeholder) input.setPlaceholder(item.placeholder.slice(0, 100));
        return new ActionRowBuilder<TextInputBuilder>().addComponents(input);
      }),
    );
}

/** Valeur d'un champ de formulaire, `null` si laissé vide. */
export function field(interaction: ModalSubmitInteraction, id: string): string | null {
  const value = interaction.fields.getTextInputValue(id).trim();
  return value === "" ? null : value;
}
