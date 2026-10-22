import { ButtonStyle, ChannelType, MessageFlags, UserSelectMenuBuilder, type Guild, type TextChannel } from "discord.js";
import { getSettings, type GuildSettings } from "@/config/store";
import { isModuleEnabled } from "@/core/access";
import { ANYONE, customId, type ComponentHandler, type PanelInteraction } from "@/core/components";
import type { Payload } from "@/core/context";
import { embed } from "@/core/embeds";
import { UserError } from "@/core/errors";
import { renderMessage } from "@/core/messages";
import { fetchPublished } from "@/core/published";
import { button, field, ICON, modal, row } from "@/core/panels";
import { logger } from "@/logger";
import { addMembers, categoryOf, claim, close, createTicket, isTicketStaff, PREFIX, reopen, ticketNumber } from "./actions";
import { findCategory, MODULE, saveTicketSettings, ticketSettings } from "./settings";
import { rateTicket, ticketByChannel, type Ticket } from "./store";

/** Panneau public : une présentation et un bouton par catégorie (5 par rangée). */
export function publicPanel(settings: GuildSettings, guild: Pick<Guild, "name">): Payload {
  const { categories } = ticketSettings(settings);
  const lines = categories.map(category => `${category.emoji} **${category.label}** — ${category.description}`);
  const buttons = categories.map(category =>
    button(customId(PREFIX, ANYONE, "ouvrir", category.id), category.label, { emoji: category.emoji, style: ButtonStyle.Primary }),
  );
  const rows = [];
  for (let index = 0; index < buttons.length; index += 5) rows.push(row(...buttons.slice(index, index + 5)));

  return {
    embeds: [
      embed(settings)
        .setTitle(`🎫 Tickets · ${guild.name}`)
        .setDescription(`${renderMessage(settings, "tickets.panneau", { server: guild.name })}\n\n${lines.join("\n") || "*Aucune catégorie pour l'instant.*"}`)
        .setFooter({ text: "Un seul ticket ouvert par catégorie à la fois." }),
    ],
    components: rows,
  };
}

/** Met à jour le panneau public déjà publié ; l'oublie s'il a été supprimé. */
export async function refreshPublicPanel(guild: Guild) {
  const settings = await getSettings(guild.id);
  const tickets = ticketSettings(settings);
  if (!tickets.panel) return;
  const message = await fetchPublished(guild, tickets.panel);
  // Erreur passagère : on garde la référence et on réessaiera au prochain changement.
  if (!message) return;
  if (message === "supprime") {
    await saveTicketSettings(settings, { ...tickets, panel: undefined });
    return;
  }
  await message.edit(publicPanel(settings, guild)).catch(error => logger.warn({ err: error }, "Mise à jour du panneau des tickets impossible"));
}

function ticketChannel(interaction: PanelInteraction): TextChannel {
  const channel = interaction.channel;
  if (channel?.type !== ChannelType.GuildText) throw new UserError("Cette action se fait dans le salon du ticket.");
  return channel;
}

/** Ticket du salon de l'interaction, vérifié contre l'identifiant du bouton. */
async function currentTicket(interaction: PanelInteraction, ticketId: string): Promise<{ ticket: Ticket; channel: TextChannel }> {
  const channel = ticketChannel(interaction);
  const ticket = await ticketByChannel(channel.id);
  if (!ticket || ticket.id !== ticketId) throw new UserError("Ce ticket n'existe plus.");
  return { ticket, channel };
}

function requireStaff(interaction: PanelInteraction, settings: GuildSettings, ticket: Ticket) {
  if (!isTicketStaff(interaction.member, categoryOf(settings, ticket))) throw new UserError("Seule l'équipe qui gère cette catégorie peut faire cela.");
}

export const ticketHandler: ComponentHandler = {
  prefix: PREFIX,
  async handle(interaction, { settings, action, args }) {
    if (!isModuleEnabled(settings, MODULE)) throw new UserError("Les tickets sont désactivés pour le moment.");
    const [arg = ""] = args;
    const owner = interaction.user.id;

    switch (action) {
      // Ouverture depuis le panneau public
      case "ouvrir": {
        const category = findCategory(ticketSettings(settings), arg);
        if (category.questions.length === 0) {
          await interaction.deferReply({ flags: MessageFlags.Ephemeral });
          const { channel } = await createTicket(interaction.member, category, []);
          return interaction.editReply(`${ICON.valider} Ton ticket est ouvert : ${channel}.`);
        }
        if (interaction.isModalSubmit()) throw new Error("Formulaire inattendu.");
        return interaction.showModal(
          modal(
            customId(PREFIX, owner, "formulaire", category.id),
            `${category.label}`,
            category.questions.map((question, index) => ({ id: `q${index}`, label: question, long: true, required: index === 0, maxLength: 1000 })),
          ),
        );
      }
      case "formulaire": {
        if (!interaction.isModalSubmit()) throw new Error("Formulaire attendu.");
        const category = findCategory(ticketSettings(settings), arg);
        const answers = category.questions.map((question, index) => ({ question, answer: field(interaction, `q${index}`) ?? "" }));
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const { channel } = await createTicket(interaction.member, category, answers);
        return interaction.editReply(`${ICON.valider} Ton ticket est ouvert : ${channel}.`);
      }

      // Boutons du salon d'un ticket
      case "prendre": {
        const { ticket, channel } = await currentTicket(interaction, arg);
        requireStaff(interaction, settings, ticket);
        await interaction.deferUpdate();
        await claim(channel, ticket, interaction.member);
        return channel.send({ content: `🙋 <@${owner}> prend en charge ce ticket.`, allowedMentions: { parse: [] } });
      }
      case "fermer": {
        const { ticket } = await currentTicket(interaction, arg);
        if (ticket.opener_id !== owner) requireStaff(interaction, settings, ticket);
        if (interaction.isModalSubmit()) throw new Error("Formulaire inattendu.");
        return interaction.showModal(
          modal(customId(PREFIX, owner, "fermer-ok", ticket.id), `Fermer le ticket ${ticketNumber(ticket)}`, [
            { id: "raison", label: "Raison (facultatif)", long: true, maxLength: 500, placeholder: "Demande traitée" },
          ]),
        );
      }
      case "fermer-ok": {
        if (!interaction.isModalSubmit()) throw new Error("Formulaire attendu.");
        const { ticket, channel } = await currentTicket(interaction, arg);
        if (ticket.opener_id !== owner) requireStaff(interaction, settings, ticket);
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await close(channel, ticket, { id: owner, tag: interaction.user.tag }, field(interaction, "raison"));
        return interaction.editReply(`${ICON.valider} Ticket fermé. La transcription est enregistrée.`);
      }
      case "rouvrir": {
        const { ticket, channel } = await currentTicket(interaction, arg);
        requireStaff(interaction, settings, ticket);
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await reopen(channel, ticket, interaction.member);
        return interaction.editReply(`${ICON.valider} Ticket rouvert.`);
      }
      case "ajouter": {
        const { ticket } = await currentTicket(interaction, arg);
        requireStaff(interaction, settings, ticket);
        return interaction.reply({
          content: "Qui ajouter à ce ticket ?",
          components: [
            row(
              new UserSelectMenuBuilder()
                .setCustomId(customId(PREFIX, owner, "ajouter-ok", ticket.id))
                .setPlaceholder("Choisir jusqu'à 5 membres")
                .setMinValues(1)
                .setMaxValues(5),
            ),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }
      case "ajouter-ok": {
        if (!interaction.isUserSelectMenu()) throw new Error("Menu de membres attendu.");
        const { ticket, channel } = await currentTicket(interaction, arg);
        requireStaff(interaction, settings, ticket);
        await addMembers(channel, interaction.values, interaction.member);
        return interaction.update({ content: `${ICON.valider} ${interaction.values.length} membre(s) ajouté(s).`, components: [] });
      }
      case "supprimer-salon": {
        const { ticket } = await currentTicket(interaction, arg);
        requireStaff(interaction, settings, ticket);
        if (ticket.status !== "ferme") throw new UserError("Ferme d'abord le ticket : la transcription est enregistrée à la fermeture.");
        return interaction.reply({
          content: `${ICON.attention} Supprimer définitivement ce salon ? La transcription reste dans les archives.`,
          components: [row(button(customId(PREFIX, owner, "supprimer-ok", ticket.id), "Supprimer le salon", { emoji: ICON.supprimer, style: ButtonStyle.Danger }))],
          flags: MessageFlags.Ephemeral,
        });
      }
      case "supprimer-ok": {
        const { ticket, channel } = await currentTicket(interaction, arg);
        requireStaff(interaction, settings, ticket);
        if (ticket.status !== "ferme") throw new UserError("Ce ticket a été rouvert entre-temps.");
        await interaction.deferUpdate();
        return channel.delete(`Ticket ${ticketNumber(ticket)} supprimé par ${interaction.user.tag}`);
      }
    }
    throw new Error(`Action de ticket inconnue : ${action}`);
  },

  /** Note de satisfaction, cliquée dans le MP envoyé à la fermeture. */
  async handleDm(interaction, { action, args }) {
    if (action !== "note") return;
    const [ticketId = "", value = ""] = args;
    const rating = Number(value);
    const ticket = await rateTicket(ticketId, interaction.user.id, rating);
    const stars = "⭐".repeat(rating);
    if (!ticket) {
      await interaction.update({ components: [] });
      return interaction.followUp("Ta note pour ce ticket est déjà enregistrée, ou le ticket a été rouvert.");
    }
    return interaction.update({ content: `Merci pour ta note : ${stars}`, components: [] });
  },
};
