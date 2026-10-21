import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type MessageActionRowComponentBuilder,
  type ModalSubmitInteraction,
} from "discord.js";

export type Row = ActionRowBuilder<MessageActionRowComponentBuilder>;

export function row(...components: MessageActionRowComponentBuilder[]): Row {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(components);
}

export function button(id: string, label: string, style: ButtonStyle = ButtonStyle.Secondary, disabled = false): ButtonBuilder {
  return new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);
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
      fields.map(field => {
        const input = new TextInputBuilder()
          .setCustomId(field.id)
          .setLabel(field.label.slice(0, 45))
          .setStyle(field.long ? TextInputStyle.Paragraph : TextInputStyle.Short)
          .setRequired(field.required ?? false);
        if (field.value) input.setValue(field.value);
        if (field.maxLength) input.setMaxLength(field.maxLength);
        if (field.placeholder) input.setPlaceholder(field.placeholder);
        return new ActionRowBuilder<TextInputBuilder>().addComponents(input);
      }),
    );
}

/** Valeur d'un champ de formulaire, `null` si laissé vide. */
export function field(interaction: ModalSubmitInteraction, id: string): string | null {
  const value = interaction.fields.getTextInputValue(id).trim();
  return value === "" ? null : value;
}
