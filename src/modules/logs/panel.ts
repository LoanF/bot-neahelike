import { ButtonStyle, ChannelSelectMenuBuilder, ChannelType, MessageFlags, PermissionFlagsBits, type Guild, type GuildBasedChannel } from "discord.js";
import { getSettings, type GuildSettings } from "@/config/store";
import { hexToInt } from "@/core/args";
import { customId, type ComponentHandler, type PanelInteraction } from "@/core/components";
import type { Payload } from "@/core/context";
import { embed } from "@/core/embeds";
import { UserError } from "@/core/errors";
import { button, choice, ICON, row, status } from "@/core/panels";
import { sample } from "./format";
import { byChannel, logSettings, routeLogs } from "./settings";
import { LOG_CATEGORIES, LOG_TYPES, logType, type LogCategory, type LogTypeId } from "./types";

const PREFIX = "logs";

export interface LogsView {
  settings: GuildSettings;
  guild: Guild;
  owner: string;
  notice?: string;
}

const GUIDE =
  "Chaque **type de log** peut partir dans son propre salon, ou plusieurs types dans le même salon.\n\n" +
  "• Choisissez un type dans le menu « Fais un choix », puis son salon.\n" +
  "• Pour aller vite, choisissez une **catégorie** (ou « Tout ») : tous ses types partent dans le salon choisi.\n" +
  "• Un type sans salon est désactivé.\n\n" +
  "Pour un message supprimé, le bot ne connaît le contenu que s'il l'a vu passer depuis son dernier démarrage. Les bannissements, expulsions, exclusions et changements du serveur indiquent leur auteur et la raison, d'après le journal d'audit de Discord.";

/** Permissions dont le bot a besoin dans un salon de logs. */
const NEEDED = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles];

function id(view: LogsView, action: string, ...args: string[]) {
  return customId(PREFIX, view.owner, action, ...args);
}

function withNotice(view: LogsView, payload: Payload): Payload {
  return { content: view.notice ? status(view.notice) : "", ...payload };
}

function panel(view: LogsView, title: string, description: string) {
  return embed(view.settings).setTitle(title).setDescription(description).setFooter({ text: `Logs · ${view.guild.name}` });
}

function footer(view: LogsView, parent: string | null, ...actions: ReturnType<typeof button>[]) {
  return row(
    ...actions,
    ...(parent ? [button(id(view, "go", parent), "Retour", { emoji: ICON.retour, style: ButtonStyle.Secondary })] : []),
    button(id(view, "aide"), "Aide", { emoji: ICON.aide, style: ButtonStyle.Secondary }),
    ...(parent ? [] : [button(id(view, "fermer"), "Fermer", { emoji: ICON.fermer, style: ButtonStyle.Secondary })]),
  );
}

function channelSelect(view: LogsView, action: string, arg: string, current?: string) {
  const select = new ChannelSelectMenuBuilder()
    .setCustomId(id(view, action, arg))
    .setPlaceholder("Choisir le salon")
    .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
  if (current && view.guild.channels.cache.has(current)) select.addDefaultChannels(current);
  return select;
}

// ─── Vues ───────────────────────────────────────────────────────────────────

function home(view: LogsView): Payload {
  const { salons } = logSettings(view.settings);
  const groups = [...byChannel(salons).entries()].map(
    ([channelId, types]) => `<#${channelId}>\n${types.map(type => `${logType(type)!.emoji} ${logType(type)!.label}`).join(" · ")}`,
  );
  const off = LOG_TYPES.filter(type => !salons[type.id]);

  return withNotice(view, {
    embeds: [
      panel(
        view,
        `${ICON.salon} Logs du serveur`,
        "Choisissez où part chaque type de log. Plusieurs types peuvent partager un salon.\n\n" +
          (groups.length ? `**Salons configurés**\n${groups.join("\n\n")}` : "*Aucun log n'est encore activé.*") +
          (off.length ? `\n\n**Désactivés**\n${off.map(type => type.label).join(" · ")}` : ""),
      ),
    ],
    components: [
      row(
        choice(
          id(view, "go", "type"),
          LOG_TYPES.map(type => ({
            label: type.label,
            value: `type:${type.id}`,
            emoji: type.emoji,
            description: salons[type.id] ? `Salon : #${view.guild.channels.cache.get(salons[type.id]!)?.name ?? "introuvable"}` : "Désactivé",
          })),
          "Régler un type de log",
        ),
      ),
      row(
        choice(
          id(view, "go", "groupe"),
          [
            { label: "Tout", value: "groupe:tout", emoji: ICON.salon, description: "Tous les types dans un même salon" },
            ...Object.entries(LOG_CATEGORIES).map(([key, category]) => ({
              label: category.label,
              value: `groupe:${key}`,
              emoji: category.emoji,
              description: LOG_TYPES.filter(type => type.category === key)
                .map(type => type.label)
                .join(", "),
            })),
          ],
          "Régler une catégorie entière",
        ),
      ),
      footer(view, null, button(id(view, "go", "tout-desactiver"), "Tout désactiver", { emoji: ICON.inactif, style: ButtonStyle.Danger, disabled: groups.length === 0 })),
    ],
  });
}

function typeView(view: LogsView, typeId: string): Payload {
  const type = logType(typeId);
  if (!type) throw new UserError("Ce type de log n'existe pas.");
  const current = logSettings(view.settings).salons[type.id as LogTypeId];

  return withNotice(view, {
    embeds: [
      panel(view, `${type.emoji} ${type.label}`, `${type.description}.`).addFields(
        { name: "Catégorie", value: `${LOG_CATEGORIES[type.category].emoji} ${LOG_CATEGORIES[type.category].label}`, inline: true },
        { name: "Salon", value: current ? `<#${current}>` : `${ICON.inactif} Désactivé`, inline: true },
      ),
    ],
    components: [
      row(channelSelect(view, "salon", type.id, current)),
      footer(
        view,
        "accueil",
        button(id(view, "essai", type.id), "Envoyer un essai", { emoji: ICON.essai, disabled: !current }),
        button(id(view, "desactiver", type.id), "Désactiver", { emoji: ICON.inactif, style: ButtonStyle.Secondary, disabled: !current }),
      ),
    ],
  });
}

function typesOf(group: string): LogTypeId[] {
  if (group === "tout") return LOG_TYPES.map(type => type.id);
  if (!Object.hasOwn(LOG_CATEGORIES, group)) throw new UserError("Cette catégorie n'existe pas.");
  return LOG_TYPES.filter(type => type.category === (group as LogCategory)).map(type => type.id);
}

function groupView(view: LogsView, group: string): Payload {
  const types = typesOf(group);
  const { salons } = logSettings(view.settings);
  const category = group === "tout" ? { label: "Tous les logs", emoji: ICON.salon } : LOG_CATEGORIES[group as LogCategory];
  const lines = types.map(type => `${logType(type)!.emoji} ${logType(type)!.label} — ${salons[type] ? `<#${salons[type]}>` : "*désactivé*"}`);

  return withNotice(view, {
    embeds: [panel(view, `${category.emoji} ${category.label}`, `Le salon choisi ci-dessous recevra **tous** ces types :\n\n${lines.join("\n")}`)],
    components: [
      row(channelSelect(view, "salon-groupe", group)),
      footer(
        view,
        "accueil",
        button(id(view, "desactiver-groupe", group), "Tout désactiver ici", {
          emoji: ICON.inactif,
          style: ButtonStyle.Secondary,
          disabled: !types.some(type => salons[type]),
        }),
      ),
    ],
  });
}

function disableAllView(view: LogsView): Payload {
  return withNotice(view, {
    embeds: [embed(view.settings, "bronze").setTitle(`${ICON.attention} Désactiver tous les logs ?`).setDescription("Plus aucun log ne sera envoyé. Les salons ne sont pas supprimés.")],
    components: [
      row(
        button(id(view, "desactiver-groupe", "tout"), "Tout désactiver", { emoji: ICON.inactif, style: ButtonStyle.Danger }),
        button(id(view, "go", "accueil"), "Annuler", { emoji: ICON.annuler, style: ButtonStyle.Secondary }),
      ),
    ],
  });
}

export function renderLogsPanel(view: LogsView, target: string): Payload {
  const [name, ...rest] = target.split(":");
  const arg = rest.join(":");
  switch (name) {
    case "type":
      return typeView(view, arg);
    case "groupe":
      return groupView(view, arg);
    case "tout-desactiver":
      return disableAllView(view);
    default:
      return home(view);
  }
}

// ─── Actions ────────────────────────────────────────────────────────────────

async function show(interaction: PanelInteraction, target: string, notice?: string) {
  const settings = await getSettings(interaction.guildId);
  const payload = renderLogsPanel({ settings, guild: interaction.guild, owner: interaction.user.id, notice }, target);
  if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
  else if (interaction.isModalSubmit()) await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
  else await interaction.update(payload);
}

/** Vérifie que le bot peut écrire dans le salon choisi. */
function checkChannel(guild: Guild, channel: GuildBasedChannel | undefined) {
  if (!channel) throw new UserError("Salon introuvable.");
  const me = guild.members.me;
  if (!me || !channel.permissionsFor(me).has(NEEDED)) {
    throw new UserError(`Le bot ne peut pas écrire dans ${channel} : il lui faut Voir le salon, Envoyer des messages, Intégrer des liens et Joindre des fichiers.`);
  }
  return channel;
}

export const logsPanel: ComponentHandler = {
  prefix: PREFIX,
  command: "logs",
  async handle(interaction, { settings, action, args }) {
    const arg = args[0] ?? "";
    switch (action) {
      case "go":
        return show(interaction, interaction.isStringSelectMenu() ? (interaction.values[0] ?? "accueil") : args.join(":"));
      case "aide":
        return interaction.reply({ embeds: [embed(settings, "parchemin").setTitle(`${ICON.aide} Aide · Logs`).setDescription(GUIDE)], flags: MessageFlags.Ephemeral });
      case "fermer":
        await interaction.deferUpdate();
        return interaction.deleteReply();
      case "salon": {
        if (!interaction.isChannelSelectMenu()) throw new Error("Menu de salons attendu.");
        const type = logType(arg);
        if (!type) throw new UserError("Ce type de log n'existe pas.");
        const channel = checkChannel(interaction.guild, interaction.guild.channels.cache.get(interaction.values[0] ?? ""));
        await routeLogs(settings, [type.id as LogTypeId], channel.id);
        return show(interaction, `type:${type.id}`, `${type.label} : envoyés dans ${channel}.`);
      }
      case "salon-groupe": {
        if (!interaction.isChannelSelectMenu()) throw new Error("Menu de salons attendu.");
        const types = typesOf(arg);
        const channel = checkChannel(interaction.guild, interaction.guild.channels.cache.get(interaction.values[0] ?? ""));
        await routeLogs(settings, types, channel.id);
        return show(interaction, "accueil", `${types.length} type(s) de log envoyés dans ${channel}.`);
      }
      case "desactiver": {
        const type = logType(arg);
        if (!type) throw new UserError("Ce type de log n'existe pas.");
        await routeLogs(settings, [type.id as LogTypeId], null);
        return show(interaction, `type:${type.id}`, `${type.label} : désactivés.`);
      }
      case "desactiver-groupe": {
        const types = typesOf(arg);
        await routeLogs(settings, types, null);
        return show(interaction, "accueil", arg === "tout" ? "Tous les logs sont désactivés." : `${types.length} type(s) de log désactivés.`);
      }
      case "essai": {
        const type = logType(arg);
        const channelId = type && logSettings(settings).salons[type.id as LogTypeId];
        if (!type || !channelId) throw new UserError("Ce type de log n'a pas de salon.");
        const channel = checkChannel(interaction.guild, interaction.guild.channels.cache.get(channelId));
        if (!channel.isSendable()) throw new UserError("Ce salon ne peut pas recevoir de messages.");
        await channel.send({ embeds: [sample(hexToInt(settings.config.embed_color), type.id as LogTypeId)] });
        return show(interaction, `type:${type.id}`, `Essai envoyé dans ${channel}.`);
      }
    }
    throw new Error(`Action de panneau inconnue : ${action}`);
  },
};
