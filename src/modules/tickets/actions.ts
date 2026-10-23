import {
  AttachmentBuilder,
  ButtonStyle,
  ChannelType,
  type EmbedBuilder,
  PermissionFlagsBits,
  type Guild,
  type GuildMember,
  type Message,
  type OverwriteResolvable,
  type TextChannel,
} from "discord.js";
import { getSettings, type GuildSettings } from "@/config/store";
import { ANYONE, customId } from "@/core/components";
import { embed } from "@/core/embeds";
import { UserError } from "@/core/errors";
import { renderMessage } from "@/core/messages";
import { button, ICON, row } from "@/core/panels";
import { logger } from "@/logger";
import { sendLog } from "@/modules/logs/events";
import { ticketEvent } from "@/modules/logs/format";
import { channelName, ticketSettings, type TicketCategory } from "./settings";
import { claimTicket, closeTicket, findOpenTicket, inactiveTickets, openTicket, reopenTicket, ticketByChannel, type Answer, type Ticket } from "./store";
import { renderTranscript, type TranscriptMessage } from "./transcript";

export const PREFIX = "tkt";

/** Au plus 2 000 messages dans une transcription (20 pages de l'API). */
const TRANSCRIPT_PAGES = 20;

export const ticketNumber = (ticket: Pick<Ticket, "number">) => `#${String(ticket.number).padStart(4, "0")}`;

/** Salons des tickets ouverts, pour suivre leur activité sans interroger la base à chaque message. */
export const openChannels = new Set<string>();

/** Membre de l'équipe pour cette catégorie : un de ses rôles, ou la permission « Gérer les salons ». */
export function isTicketStaff(member: GuildMember, category: TicketCategory | undefined): boolean {
  if (member.permissions.has(PermissionFlagsBits.Administrator) || member.permissions.has(PermissionFlagsBits.ManageChannels)) return true;
  return Boolean(category?.roleIds.some(roleId => member.roles.cache.has(roleId)));
}

export function categoryOf(settings: GuildSettings, ticket: Ticket): TicketCategory | undefined {
  return ticketSettings(settings).categories.find(category => category.id === ticket.category_id);
}

const MEMBER_ALLOW = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.EmbedLinks,
];

/** Boutons d'un ticket ouvert ou fermé. */
export function ticketButtons(ticket: Ticket) {
  const id = (action: string) => customId(PREFIX, ANYONE, action, ticket.id);
  if (ticket.status === "ferme") {
    return [
      row(
        button(id("rouvrir"), "Rouvrir", { emoji: "🔓", style: ButtonStyle.Success }),
        button(id("supprimer-salon"), "Supprimer le salon", { emoji: ICON.supprimer, style: ButtonStyle.Danger }),
      ),
    ];
  }
  return [
    row(
      button(id("prendre"), ticket.claimed_by_id ? "Pris en charge" : "Prendre en charge", { emoji: "🙋", disabled: Boolean(ticket.claimed_by_id) }),
      button(id("fermer"), "Fermer", { emoji: "🔒", style: ButtonStyle.Danger }),
      button(id("ajouter"), "Ajouter un membre", { emoji: ICON.ajouter, style: ButtonStyle.Secondary }),
      button(id("retirer"), "Retirer un membre", { emoji: ICON.retirer, style: ButtonStyle.Secondary }),
    ),
  ];
}

/** Résumé privé du ticket pour `/ticket` : état, auteur, prise en charge. */
export function ticketSummary(settings: GuildSettings, ticket: Ticket): EmbedBuilder {
  return embed(settings, "parchemin")
    .setTitle(`🎫 Ticket ${ticketNumber(ticket)} · ${ticket.category_label}`)
    .addFields(
      { name: "État", value: ticket.status === "ferme" ? "🔒 Fermé" : "🟢 Ouvert", inline: true },
      { name: "Ouvert par", value: `<@${ticket.opener_id}>`, inline: true },
      { name: "Pris en charge", value: ticket.claimed_by_id ? `<@${ticket.claimed_by_id}>` : "*Personne*", inline: true },
    )
    .setFooter({ text: "Les mêmes boutons se trouvent sur le message d'accueil du ticket." });
}

/** Message d'accueil du ticket : demande du membre, réponses au formulaire, prise en charge. */
export function welcomeEmbed(settings: GuildSettings, ticket: Ticket, category: Pick<TicketCategory, "emoji" | "label">, member: GuildMember): EmbedBuilder {
  const answers = ticket.answers as Answer[];
  const result = embed(settings)
    .setTitle(`${category.emoji} ${category.label} · Ticket ${ticketNumber(ticket)}`)
    .setDescription(renderMessage(settings, "tickets.bienvenue", { user: `<@${member.id}>`, "user.name": member.displayName, server: member.guild.name }))
    .setThumbnail(member.displayAvatarURL())
    .setTimestamp(new Date(ticket.created_at));
  for (const answer of answers.slice(0, 24)) result.addFields({ name: answer.question, value: answer.answer.slice(0, 1024) || "*Sans réponse*" });
  if (ticket.claimed_by_id) result.addFields({ name: "Pris en charge par", value: `<@${ticket.claimed_by_id}>` });
  return result;
}

async function log(guild: Guild, title: string, ticket: Ticket, byId?: string | null, reason?: string | null) {
  await sendLog(guild, "tickets", color =>
    ticketEvent(color, title, { number: ticket.number, categoryLabel: ticket.category_label, channelId: ticket.channel_id, openerId: ticket.opener_id, byId, reason }),
  );
}

/** Ouvre un ticket : salon privé visible du membre et des rôles de la catégorie, puis message d'accueil. */
export async function createTicket(member: GuildMember, category: TicketCategory, answers: Answer[]): Promise<{ ticket: Ticket; channel: TextChannel }> {
  const guild = member.guild;
  const settings = await getSettings(guild.id);
  const tickets = ticketSettings(settings);

  const existing = await findOpenTicket(guild.id, member.id, category.id);
  if (existing) throw new UserError(`Tu as déjà un ticket ouvert dans cette catégorie : <#${existing.channel_id}>.`);

  const me = guild.members.me!;
  const parent = tickets.parentId && guild.channels.cache.get(tickets.parentId)?.type === ChannelType.GuildCategory ? tickets.parentId : undefined;
  const overwrites: OverwriteResolvable[] = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: member.id, allow: MEMBER_ALLOW },
    ...category.roleIds.filter(roleId => guild.roles.cache.has(roleId)).map(roleId => ({ id: roleId, allow: [...MEMBER_ALLOW, PermissionFlagsBits.ManageMessages] })),
    { id: me.id, allow: [...MEMBER_ALLOW, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages] },
  ];

  const channel = await guild.channels
    .create({
      name: channelName(category.label, member.user.username),
      type: ChannelType.GuildText,
      parent,
      topic: `${category.label} · ticket de ${member.user.tag}`,
      permissionOverwrites: overwrites,
      reason: `Ticket ${category.label} ouvert par ${member.user.tag}`,
    })
    .catch(error => {
      logger.error({ err: error }, "Création du salon de ticket impossible");
      throw new UserError("Le salon du ticket n'a pas pu être créé (la catégorie Discord est peut-être pleine : 50 salons au plus). Préviens l'équipe.");
    });

  let ticket: Ticket;
  try {
    ticket = await openTicket({ guildId: guild.id, channelId: channel.id, categoryId: category.id, categoryLabel: category.label, openerId: member.id, answers });
  } catch (error) {
    // Deux clics simultanés : le second salon est retiré.
    await channel.delete("Ticket en double").catch(() => {});
    throw error;
  }

  openChannels.add(channel.id);
  await channel.send({
    content: [`<@${member.id}>`, ...category.roleIds.map(roleId => `<@&${roleId}>`)].join(" "),
    embeds: [welcomeEmbed(settings, ticket, category, member)],
    components: ticketButtons(ticket),
    allowedMentions: { users: [member.id], roles: category.roleIds },
  });
  await log(guild, "Ticket ouvert", ticket, member.id);
  return { ticket, channel };
}

/** Met à jour le message d'accueil (boutons, prise en charge) s'il est encore là. */
async function refreshWelcome(channel: TextChannel, ticket: Ticket) {
  const messages = await channel.messages.fetch({ limit: 20, after: "0" }).catch(error => {
    logger.warn({ err: error, ticket: ticket.id }, "Message d'accueil du ticket introuvable");
    return null;
  });
  const welcome = messages?.filter(message => message.author.id === channel.client.user.id && message.components.length > 0).last();
  if (!welcome) return;
  const settings = await getSettings(channel.guild.id);
  const category = categoryOf(settings, ticket) ?? { emoji: "🎫", label: ticket.category_label };
  const opener = await channel.guild.members.fetch(ticket.opener_id).catch(() => null);
  // Fermé : les boutons Rouvrir et Supprimer sont sur le message de fermeture, pas sur l'accueil.
  const components = ticket.status === "ouvert" ? ticketButtons(ticket) : [];
  await welcome
    .edit({ embeds: opener ? [welcomeEmbed(settings, ticket, category, opener)] : welcome.embeds, components })
    .catch(error => logger.warn({ err: error, ticket: ticket.id }, "Mise à jour du message d'accueil du ticket impossible"));
}

export async function claim(channel: TextChannel, ticket: Ticket, staff: GuildMember): Promise<Ticket> {
  if (ticket.claimed_by_id) throw new UserError(`Ce ticket est déjà pris en charge par <@${ticket.claimed_by_id}>.`);
  const updated = await claimTicket(ticket.id, staff.id);
  if (!updated) {
    const current = await ticketByChannel(channel.id);
    if (current?.claimed_by_id) throw new UserError(`Ce ticket vient d'être pris en charge par <@${current.claimed_by_id}>.`);
    throw new UserError("Ce ticket est fermé.");
  }
  await refreshWelcome(channel, updated);
  await log(channel.guild, "Ticket pris en charge", updated, staff.id);
  return updated;
}

/** Messages du salon pour la transcription. */
async function collect(channel: TextChannel): Promise<TranscriptMessage[]> {
  const result: TranscriptMessage[] = [];
  let before: string | undefined;
  for (let page = 0; page < TRANSCRIPT_PAGES; page++) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before && { before }) });
    if (batch.size === 0) break;
    batch.forEach((message: Message) =>
      result.push({
        authorTag: message.author.tag,
        bot: message.author.bot,
        createdAt: message.createdAt,
        content: message.content,
        attachments: message.attachments.map(file => ({ name: file.name, url: file.url })),
        embeds: message.embeds.map(item => ({ title: item.title, description: item.description })),
      }),
    );
    before = batch.last()!.id;
    if (batch.size < 100) break;
  }
  return result;
}

/**
 * Ferme le ticket : transcription enregistrée en base et envoyée aux archives, salon verrouillé pour le membre,
 * message privé avec la note de satisfaction.
 */
export async function close(channel: TextChannel, ticket: Ticket, by: { id: string; tag: string }, reason: string | null): Promise<Ticket> {
  const guild = channel.guild;
  const settings = await getSettings(guild.id);
  const opener = await guild.members.fetch(ticket.opener_id).catch(() => null);
  const closedAt = new Date();

  // Sans transcription complète, on ne ferme pas : supprimer le salon ensuite effacerait la conversation.
  const messages = await collect(channel).catch(error => {
    logger.warn({ err: error, channel: channel.id }, "Lecture des messages du ticket impossible : fermeture annulée");
    throw new UserError("Les messages du ticket n'ont pas pu être lus : il reste ouvert pour ne rien perdre. Réessayez dans un instant.");
  });
  const transcript = renderTranscript(
    {
      guildName: guild.name,
      number: ticket.number,
      categoryLabel: ticket.category_label,
      openerTag: opener?.user.tag ?? ticket.opener_id,
      openedAt: new Date(ticket.created_at),
      closedAt,
      closedByTag: by.tag,
      reason,
    },
    messages,
  );

  const closed = await closeTicket(ticket.id, { closedById: by.id, reason, transcript });
  if (!closed) throw new UserError("Ce ticket est déjà fermé.");
  openChannels.delete(channel.id);

  // Le membre garde la lecture du salon mais ne peut plus écrire.
  await channel.permissionOverwrites
    .edit(ticket.opener_id, { SendMessages: false }, { reason: "Ticket fermé" })
    .catch(error => logger.warn({ err: error, ticket: ticket.id }, "Écriture de l'auteur non retirée à la fermeture du ticket"));

  await channel.send({
    embeds: [
      embed(settings, "bronze")
        .setTitle(`🔒 Ticket ${ticketNumber(closed)} fermé`)
        .setDescription(`Fermé par <@${by.id}>.${reason ? `\n**Raison :** ${reason}` : ""}`)
        .setTimestamp(closedAt),
    ],
    components: ticketButtons(closed),
    allowedMentions: { parse: [] },
  });
  await refreshWelcome(channel, closed);

  const tickets = ticketSettings(settings);
  const archives = tickets.archivesId ? guild.channels.cache.get(tickets.archivesId) : undefined;
  if (archives?.isSendable()) {
    const summary = embed(settings)
      .setTitle(`🗂️ Ticket ${ticketNumber(closed)} · ${closed.category_label}`)
      .addFields(
        { name: "Ouvert par", value: `<@${closed.opener_id}>`, inline: true },
        { name: "Fermé par", value: `<@${by.id}>`, inline: true },
        { name: "Pris en charge par", value: closed.claimed_by_id ? `<@${closed.claimed_by_id}>` : "Personne", inline: true },
        { name: "Messages", value: String(messages.length), inline: true },
        { name: "Raison", value: reason ?? "*Aucune*" },
      )
      .setTimestamp(closedAt);
    const file = new AttachmentBuilder(Buffer.from(transcript, "utf8"), { name: `ticket-${String(closed.number).padStart(4, "0")}.html` });
    await archives.send({ embeds: [summary], files: [file], allowedMentions: { parse: [] } }).catch(error => logger.warn({ err: error }, "Envoi de la transcription aux archives impossible"));
  }

  if (opener) await askRating(opener, settings, closed, reason);
  await log(guild, "Ticket fermé", closed, by.id, reason);
  return closed;
}

/** MP au membre : fermeture, raison et note de 1 à 5. Si ses MP sont fermés, rien n'est envoyé. */
async function askRating(opener: GuildMember, settings: GuildSettings, ticket: Ticket, reason: string | null) {
  const stars = row(...[1, 2, 3, 4, 5].map(note => button(customId(PREFIX, opener.id, "note", ticket.id, String(note)), "⭐".repeat(note), { style: ButtonStyle.Secondary })));
  const text = renderMessage(settings, "tickets.fermeture-mp", {
    user: `<@${opener.id}>`,
    "user.name": opener.displayName,
    server: opener.guild.name,
    ticket: ticketNumber(ticket),
    categorie: ticket.category_label,
    raison: reason ?? "aucune",
  });
  await opener
    .send({ embeds: [embed(settings).setTitle(`🎫 Ticket ${ticketNumber(ticket)} fermé`).setDescription(text)], components: [stars] })
    .catch(() => logger.debug({ user: opener.id }, "MP fermés : note de ticket non demandée"));
}

export async function reopen(channel: TextChannel, ticket: Ticket, staff: GuildMember): Promise<Ticket> {
  const reopened = await reopenTicket(ticket.id);
  if (!reopened) throw new UserError("Ce ticket est déjà ouvert.");
  openChannels.add(channel.id);
  await channel.permissionOverwrites
    .edit(ticket.opener_id, { ViewChannel: true, SendMessages: true }, { reason: "Ticket rouvert" })
    .catch(error => logger.warn({ err: error, ticket: ticket.id }, "Accès de l'auteur non rendu à la réouverture du ticket"));
  const settings = await getSettings(channel.guild.id);
  await channel.send({
    content: `<@${ticket.opener_id}>`,
    embeds: [embed(settings).setTitle(`🔓 Ticket ${ticketNumber(reopened)} rouvert`).setDescription(`Rouvert par <@${staff.id}>. Les boutons sont de retour sur le message d'accueil.`)],
    allowedMentions: { users: [ticket.opener_id] },
  });
  await refreshWelcome(channel, reopened);
  await log(channel.guild, "Ticket rouvert", reopened, staff.id);
  return reopened;
}

export async function addMembers(channel: TextChannel, userIds: string[], by: GuildMember) {
  for (const userId of userIds) {
    await channel.permissionOverwrites.edit(
      userId,
      { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true },
      { reason: `Ajouté au ticket par ${by.user.tag}` },
    );
  }
  await channel.send({ content: `${ICON.ajouter} ${userIds.map(userId => `<@${userId}>`).join(", ")} ajouté(s) au ticket par <@${by.id}>.`, allowedMentions: { users: userIds } });
}

export async function removeMember(channel: TextChannel, ticket: Ticket, userId: string, by: GuildMember) {
  if (userId === ticket.opener_id) throw new UserError("L'auteur du ticket ne peut pas en être retiré : ferme plutôt le ticket.");
  await channel.permissionOverwrites.delete(userId, `Retiré du ticket par ${by.user.tag}`);
  await channel.send({ content: `${ICON.retirer} <@${userId}> retiré du ticket par <@${by.id}>.`, allowedMentions: { parse: [] } });
}

/** Ferme les tickets sans message depuis le délai réglé. */
export async function autoClose(guild: Guild) {
  const settings = await getSettings(guild.id);
  const days = ticketSettings(settings).autoCloseDays;
  if (!days) return;
  for (const ticket of await inactiveTickets(guild.id, days)) {
    const channel = guild.channels.cache.get(ticket.channel_id);
    if (channel?.type !== ChannelType.GuildText) continue;
    await close(channel, ticket, { id: guild.client.user.id, tag: guild.client.user.tag }, `Fermé automatiquement après ${days} jour(s) sans message.`).catch(error =>
      logger.error({ err: error, ticket: ticket.id }, "Fermeture automatique du ticket impossible"),
    );
  }
}
