import { ButtonStyle, ChannelSelectMenuBuilder, ChannelType, MessageFlags, type GuildBasedChannel, type GuildMember } from "discord.js";
import { getSettings, type GuildSettings } from "@/config/store";
import { canUse } from "@/core/access";
import { customId, type ComponentHandler, type PanelInteraction } from "@/core/components";
import type { Payload } from "@/core/context";
import { formatDuration } from "@/core/duration";
import { embed } from "@/core/embeds";
import { UserError } from "@/core/errors";
import { button, choice, field, ICON, modal, row, status } from "@/core/panels";
import { getRegistry } from "@/core/registry";
import { channelState, clearMessages, isProtectedChannel, LOCK_MESSAGES, manageableChannel, nukeConfirmation, setEveryone, snipeEmbed, snipes, type ManagedChannel } from "./actions";
import { MAX_CLEAR } from "./logic";

const PREFIX = "sal";

/** Délais proposés dans le menu du mode lent, en secondes. */
export const SLOWMODE_CHOICES = [0, 5, 10, 30, 60, 300, 900, 3600, 21600];

const GUIDE =
  "**Salon** : choisissez-le dans le premier menu (par défaut, celui où vous avez tapé la commande). L'aperçu montre son état pour @everyone.\n" +
  "**Verrouiller** : plus personne ne peut écrire, sauf les rôles qui ont une autorisation propre au salon ; un message l'annonce dans le salon.\n" +
  "**Cacher** : le salon disparaît pour @everyone ; les rôles autorisés et les administrateurs le voient toujours.\n" +
  "**Mode lent** : délai entre deux messages d'un même membre, 6 heures au plus.\n" +
  "**Supprimer des messages** : les derniers messages (100 au plus, de moins de 14 jours, épinglés gardés), d'un membre si vous donnez son ID.\n" +
  "**Dernier supprimé** : le dernier message supprimé du salon, gardé 10 minutes en mémoire.\n" +
  "**Recréer** : un salon vide à l'identique, après confirmation (demande l'accès à `/nuke`).\n" +
  "Chaque bouton suit l'accès de la commande correspondante (`/lock`, `/hide`, `/slowmode`, `/clear`, `/snipe`, `/nuke`) : un bouton grisé vous est fermé.";

export interface SalonView {
  settings: GuildSettings;
  owner: string;
  /** Commandes que le membre peut utiliser : les boutons des autres sont grisés. */
  allowed: (command: string) => boolean;
  notice?: string;
}

export function salonView(view: SalonView, channel: ManagedChannel): Payload {
  const id = (action: string, ...args: string[]) => customId(PREFIX, view.owner, action, ...args);
  const state = channelState(channel);
  const sniped = snipes.get(channel.id);

  const channels = new ChannelSelectMenuBuilder()
    .setCustomId(id("salon"))
    .setPlaceholder("Salon à gérer")
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .addDefaultChannels(channel.id);

  return {
    content: view.notice ? status(view.notice) : "",
    embeds: [
      embed(view.settings)
        .setTitle(`🧹 Outils de salon · #${channel.name}`)
        .setDescription(`${channel}`)
        .addFields(
          { name: "Écriture", value: state.locked ? "🔒 Verrouillé" : "🔓 Ouvert", inline: true },
          { name: "Visibilité", value: state.hidden ? "🙈 Caché" : "👁️ Visible", inline: true },
          { name: "Mode lent", value: state.slowmode ? formatDuration(state.slowmode * 1000) : "Aucun", inline: true },
          { name: "Dernier message supprimé", value: sniped ? `De <@${sniped.authorId}>, <t:${Math.floor(sniped.deletedAt / 1000)}:R>` : "*Aucun ces 10 dernières minutes*" },
        ),
    ],
    components: [
      row(channels),
      row(
        choice(
          id("lent", channel.id),
          SLOWMODE_CHOICES.map(seconds => ({ label: seconds ? formatDuration(seconds * 1000) : "Aucun mode lent", value: String(seconds), default: seconds === state.slowmode })),
          "Mode lent",
        ).setDisabled(!view.allowed("slowmode")),
      ),
      row(
        button(id("ecriture", channel.id), state.locked ? "Déverrouiller" : "Verrouiller", { emoji: state.locked ? "🔓" : "🔒", disabled: !view.allowed(state.locked ? "unlock" : "lock") }),
        button(id("visibilite", channel.id), state.hidden ? "Montrer" : "Cacher", { emoji: state.hidden ? "👁️" : "🙈", disabled: !view.allowed(state.hidden ? "unhide" : "hide") }),
        button(id("clear", channel.id), "Supprimer des messages", { emoji: ICON.supprimer, style: ButtonStyle.Secondary, disabled: !view.allowed("clear") }),
        button(id("snipe", channel.id), "Dernier supprimé", { emoji: "🔎", style: ButtonStyle.Secondary, disabled: !sniped || !view.allowed("snipe") }),
        button(id("nuke", channel.id), "Recréer", { emoji: "💥", style: ButtonStyle.Danger, disabled: isProtectedChannel(channel.guild, channel.id) || !view.allowed("nuke") }),
      ),
      row(
        button(id("actualiser", channel.id), "Actualiser", { emoji: "🔄", style: ButtonStyle.Secondary }),
        button(id("aide"), "Aide", { emoji: ICON.aide, style: ButtonStyle.Secondary }),
        button(id("fermer"), "Fermer", { emoji: ICON.fermer, style: ButtonStyle.Secondary }),
      ),
    ],
  };
}

/** Accès du membre aux commandes de salon, réglés dans `/config` (ou leur permission Discord par défaut). */
export function accessOf(settings: GuildSettings, member: GuildMember) {
  return (name: string) => {
    const command = getRegistry().find(name);
    return Boolean(command && canUse(settings, member, command));
  };
}

async function show(interaction: PanelInteraction, payload: Payload) {
  if (interaction.deferred || interaction.replied || interaction.isModalSubmit()) await interaction.editReply(payload);
  else await interaction.update(payload);
}

export const salonPanel: ComponentHandler = {
  prefix: PREFIX,
  command: "salon",
  async handle(interaction, { settings, action, args }) {
    if (action === "fermer") {
      await interaction.deferUpdate();
      return interaction.deleteReply();
    }
    if (action === "aide") {
      return interaction.reply({ embeds: [embed(settings, "parchemin").setTitle(`${ICON.aide} Aide · Outils de salon`).setDescription(GUIDE)], flags: MessageFlags.Ephemeral });
    }

    const guild = interaction.guild;
    const allowed = accessOf(settings, interaction.member);
    /** Le bouton est grisé pour qui n'a pas l'accès, mais l'accès est revérifié au clic. */
    const need = (command: string) => {
      if (!allowed(command)) throw new UserError(`Vous n'avez pas accès à \`/${command}\`.`);
    };
    const reason = `Panneau /salon (par ${interaction.user.tag})`;
    const pick = () => {
      if (action === "salon") {
        if (!interaction.isChannelSelectMenu()) throw new Error("Menu de salons attendu.");
        return manageableChannel(guild, interaction.channels.first() as GuildBasedChannel | undefined);
      }
      return manageableChannel(guild, guild.channels.cache.get(args[0] ?? ""));
    };
    const refresh = async (channel: ManagedChannel, notice?: string) =>
      show(interaction, salonView({ settings: await getSettings(guild.id), owner: interaction.user.id, allowed, notice }, channel));

    const channel = pick();
    switch (action) {
      case "salon":
      case "actualiser":
        return refresh(channel);
      case "ecriture": {
        const { locked } = channelState(channel);
        need(locked ? "unlock" : "lock");
        await interaction.deferUpdate();
        await setEveryone(settings, channel, "SendMessages", locked ? null : false, reason, locked ? LOCK_MESSAGES.unlock : LOCK_MESSAGES.lock);
        return refresh(channel, locked ? "Salon déverrouillé." : "Salon verrouillé.");
      }
      case "visibilite": {
        const { hidden } = channelState(channel);
        need(hidden ? "unhide" : "hide");
        await interaction.deferUpdate();
        await setEveryone(settings, channel, "ViewChannel", hidden ? null : false, reason, hidden ? LOCK_MESSAGES.unhide : LOCK_MESSAGES.hide);
        return refresh(channel, hidden ? "Salon de nouveau visible." : "Salon caché à @everyone.");
      }
      case "lent": {
        if (!interaction.isStringSelectMenu()) throw new Error("Menu attendu.");
        need("slowmode");
        const seconds = Number(interaction.values[0]);
        if (!SLOWMODE_CHOICES.includes(seconds)) throw new Error("Délai inconnu.");
        await interaction.deferUpdate();
        await channel.setRateLimitPerUser(seconds, `Mode lent (par ${interaction.user.tag})`);
        return refresh(channel, seconds ? `Mode lent : ${formatDuration(seconds * 1000)}.` : "Mode lent retiré.");
      }
      case "clear":
        need("clear");
        if (interaction.isModalSubmit()) throw new Error("Un formulaire ne peut pas en ouvrir un autre.");
        return interaction.showModal(
          modal(customId(PREFIX, interaction.user.id, "clear-ok", channel.id), `Supprimer dans #${channel.name}`, [
            { id: "nombre", label: `Nombre de messages (1 à ${MAX_CLEAR})`, required: true, maxLength: 3, value: "10" },
            { id: "membre", label: "Seulement ceux d'un membre (ID, facultatif)", maxLength: 25, placeholder: "123456789012345678" },
          ]),
        );
      case "clear-ok": {
        if (!interaction.isModalSubmit()) throw new Error("Formulaire attendu.");
        need("clear");
        const count = Number(field(interaction, "nombre"));
        if (!Number.isInteger(count) || count < 1 || count > MAX_CLEAR) throw new UserError(`Indiquez un nombre entre 1 et ${MAX_CLEAR}.`);
        const author = field(interaction, "membre")?.replace(/^<@!?(\d+)>$/, "$1") ?? undefined;
        if (author && !/^\d{17,20}$/.test(author)) throw new UserError("L'ID du membre n'est pas valide : 17 à 20 chiffres.");
        await interaction.deferUpdate();
        const deleted = await clearMessages(channel, count, author);
        return refresh(channel, `${deleted} message(s) supprimé(s)${author ? ` de <@${author}>` : ""}.`);
      }
      case "snipe": {
        need("snipe");
        const item = snipes.get(channel.id);
        if (!item) throw new UserError("Aucun message supprimé récemment dans ce salon.");
        return interaction.reply({ embeds: [snipeEmbed(settings, item)], flags: MessageFlags.Ephemeral });
      }
      case "nuke":
        need("nuke");
        if (isProtectedChannel(guild, channel.id)) throw new UserError("Ce salon est réservé par Discord : il ne peut pas être recréé.");
        return interaction.reply({ ...nukeConfirmation(channel, interaction.user.id), flags: MessageFlags.Ephemeral });
    }
    throw new Error(`Action de panneau inconnue : ${action}`);
  },
};
