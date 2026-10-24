import { ButtonStyle, ChannelSelectMenuBuilder, ChannelType, MessageFlags, PermissionFlagsBits, RoleSelectMenuBuilder, type Guild, type ModalSubmitInteraction } from "discord.js";
import { getSettings, type GuildSettings } from "@/config/store";
import { customId, type ComponentHandler, type PanelInteraction } from "@/core/components";
import type { Payload } from "@/core/context";
import { embed } from "@/core/embeds";
import { UserError } from "@/core/errors";
import { logger } from "@/logger";
import { button, choice, field, ICON, modal, row, status } from "@/core/panels";
import { roleProblem } from "@/modules/accueil/settings";
import { counterValues, lastFivemStatus, reconcileAllSupport, refreshFivem, statusPayload, updateCounters } from "./live";
import { addSupportText, COUNTERS, counterName, DEFAULT_VOICE_NAME, MAX_SUPPORT_TEXTS, parseAddress, removeSupportText, saveServerSettings, serverSettings, SUPPORT_TEXT_MAX, type CounterId, type ServerSettings } from "./settings";

const PREFIX = "srv";
/** Même panneau, réduit au rôle soutien, ouvert par `/soutien`. */
const SUPPORT_PREFIX = "sou";

const GUIDE =
  "**Statut FiveM** : indiquez l'adresse du serveur (IP:port) et, si vous voulez, le lien de connexion (cfx.re/join/…). Publiez le statut dans un salon : il se met à jour chaque minute. `/statut` le montre à tout le monde.\n" +
  "**Compteurs** : choisissez un salon (vocal de préférence, verrouillé) pour chaque compteur ; son nom affiche la valeur, `{n}`. Discord limite les renommages : mise à jour toutes les 10 minutes.\n" +
  "**Rôle soutien** (aussi par `/soutien`) : donné automatiquement à qui affiche le tag du serveur sur son profil, ou l'un des textes autorisés dans son statut personnalisé ; retiré quand ce n'est plus le cas.\n" +
  "**Vocaux temporaires** : rejoindre le salon créateur ouvre un salon vocal à son nom, dans la même catégorie, supprimé une fois vide. Son créateur peut le renommer et le limiter.";

interface View {
  settings: GuildSettings;
  guild: Guild;
  owner: string;
  notice?: string;
  /** `SUPPORT_PREFIX` : panneau du rôle soutien seul, sans retour vers la vie du serveur. */
  prefix?: string;
}

function id(view: View, action: string, ...args: string[]) {
  return customId(view.prefix ?? PREFIX, view.owner, action, ...args);
}

function withNotice(view: View, payload: Payload): Payload {
  return { content: view.notice ? status(view.notice) : "", ...payload };
}

function panel(view: View, title: string, description: string) {
  return embed(view.settings).setTitle(title).setDescription(description).setFooter({ text: `Vie du serveur · ${view.guild.name}` });
}

const channel = (channelId?: string) => (channelId ? `<#${channelId}>` : "*Aucun*");

function back(view: View) {
  return row(
    view.prefix === SUPPORT_PREFIX
      ? button(id(view, "fermer"), "Fermer", { emoji: ICON.fermer, style: ButtonStyle.Secondary })
      : button(id(view, "go", "accueil"), "Retour", { emoji: ICON.retour, style: ButtonStyle.Secondary }),
    button(id(view, "aide"), "Aide", { emoji: ICON.aide, style: ButtonStyle.Secondary }),
  );
}

function channelSelect(view: View, action: string, placeholder: string, types: ChannelType[], current?: string) {
  const select = new ChannelSelectMenuBuilder().setCustomId(id(view, action)).setPlaceholder(placeholder).setChannelTypes(...types).setMinValues(0).setMaxValues(1);
  if (current && view.guild.channels.cache.has(current)) select.addDefaultChannels(current);
  return select;
}

function fivemSummary(server: ServerSettings) {
  const status = lastFivemStatus();
  if (!server.fivemAdresse) return "*Aucune adresse*";
  if (!status) return `\`${server.fivemAdresse}\` · *pas encore vérifié*`;
  return `\`${server.fivemAdresse}\` · ${status.online ? `🟢 ${status.players}/${status.max}` : "🔴 hors ligne"}`;
}

// ─── Vues ───────────────────────────────────────────────────────────────────

function home(view: View): Payload {
  const server = serverSettings(view.settings);
  const counters = (Object.keys(COUNTERS) as CounterId[]).filter(counter => server.compteurs?.[counter]);
  return withNotice(view, {
    embeds: [
      panel(view, "🏛️ Vie du serveur", "Statut du serveur FiveM, salons compteurs, rôle soutien et vocaux temporaires.").addFields(
        { name: "Serveur FiveM", value: fivemSummary(server) },
        { name: "Compteurs", value: counters.map(counter => `${COUNTERS[counter].label} : ${channel(server.compteurs?.[counter]?.channelId)}`).join("\n") || "*Aucun*" },
        { name: "Rôle soutien", value: server.soutienRoleId ? `<@&${server.soutienRoleId}>` : "*Aucun*", inline: true },
        { name: "Vocaux temporaires", value: channel(server.vocalCreateurId), inline: true },
      ),
    ],
    components: [
      row(
        choice(id(view, "go", "nav"), [
          { label: "Statut FiveM", value: "fivem", emoji: "🎮", description: "Adresse, lien de connexion, message de statut" },
          { label: "Compteurs", value: "compteurs", emoji: "📊", description: "Membres, joueurs en jeu, citoyens" },
          { label: "Rôle soutien", value: "soutien", emoji: "💛", description: "Tag du serveur ou texte dans le statut" },
          { label: "Vocaux temporaires", value: "vocaux", emoji: "🔊", description: "Salon « rejoindre pour créer »" },
        ]),
      ),
      row(
        button(id(view, "aide"), "Aide", { emoji: ICON.aide, style: ButtonStyle.Secondary }),
        button(id(view, "fermer"), "Fermer", { emoji: ICON.fermer, style: ButtonStyle.Secondary }),
      ),
    ],
  });
}

function fivemView(view: View): Payload {
  const server = serverSettings(view.settings);
  const published = server.statutMessage ? `[Voir le message](https://discord.com/channels/${view.guild.id}/${server.statutMessage.channelId}/${server.statutMessage.messageId})` : "*Pas encore publié*";
  return withNotice(view, {
    embeds: [
      panel(view, "🎮 Statut FiveM", "Le bot interroge le serveur chaque minute.").addFields(
        { name: "Serveur", value: fivemSummary(server) },
        { name: "Lien de connexion", value: server.fivemLien ?? "*Aucun*", inline: true },
        { name: "Message de statut", value: published, inline: true },
      ),
    ],
    components: [
      row(
        button(id(view, "fivem-modifier"), "Adresse et lien", { emoji: ICON.modifier }),
        button(id(view, "fivem-tester"), "Vérifier maintenant", { emoji: "🔄", disabled: !server.fivemAdresse }),
        button(id(view, "go", "publier"), server.statutMessage ? "Déplacer le statut" : "Publier le statut", { emoji: "📤", disabled: !server.fivemAdresse }),
      ),
      back(view),
    ],
  });
}

function countersView(view: View): Payload {
  const server = serverSettings(view.settings);
  const values = counterValues(view.guild);
  const counters = Object.keys(COUNTERS) as CounterId[];
  return withNotice(view, {
    embeds: [
      panel(view, "📊 Compteurs", "Choisissez un salon pour chaque compteur (vide pour l'arrêter). Un salon vocal verrouillé est l'usage habituel.").addFields(
        counters.map(counter => ({
          name: COUNTERS[counter].label,
          value: server.compteurs?.[counter] ? `${channel(server.compteurs[counter].channelId)} → « ${counterName(server.compteurs[counter].name, values[counter])} »` : "*Aucun salon*",
        })),
      ),
    ],
    components: [
      ...counters.map(counter => row(channelSelect(view, `compteur:${counter}`, `Salon : ${COUNTERS[counter].label}`, [ChannelType.GuildVoice, ChannelType.GuildText, ChannelType.GuildAnnouncement], server.compteurs?.[counter]?.channelId))),
      row(
        button(id(view, "compteurs-noms"), "Noms des salons", { emoji: ICON.modifier }),
        button(id(view, "go", "accueil"), "Retour", { emoji: ICON.retour, style: ButtonStyle.Secondary }),
        button(id(view, "aide"), "Aide", { emoji: ICON.aide, style: ButtonStyle.Secondary }),
      ),
    ],
  });
}

function supportView(view: View): Payload {
  const server = serverSettings(view.settings);
  const texts = server.soutienTextes ?? [];
  const select = new RoleSelectMenuBuilder().setCustomId(id(view, "soutien-role")).setPlaceholder("Rôle soutien").setMinValues(0).setMaxValues(1);
  if (server.soutienRoleId && view.guild.roles.cache.has(server.soutienRoleId)) select.addDefaultRoles(server.soutienRoleId);
  return withNotice(view, {
    embeds: [
      panel(view, "💛 Rôle soutien", "Remerciez ceux qui affichent le serveur : le rôle est donné et retiré automatiquement.").addFields(
        { name: "Rôle", value: server.soutienRoleId ? `<@&${server.soutienRoleId}>` : "*Aucun*", inline: true },
        { name: "Tag du serveur", value: server.soutienTag ? "Compté" : "Ignoré", inline: true },
        {
          name: `Textes autorisés dans le statut (${texts.length} sur ${MAX_SUPPORT_TEXTS})`,
          value: texts.map(text => `• \`${text.replace(/`/g, "'")}\``).join("\n").slice(0, 1024) || "*Aucun : seul le tag du serveur compte.*",
        },
      ),
    ],
    components: [
      row(select),
      ...(texts.length
        ? [row(choice(id(view, "soutien-retirer"), texts.map((text, index) => ({ label: text.slice(0, 100), value: String(index), emoji: ICON.supprimer })), "Retirer un texte"))]
        : []),
      row(
        button(id(view, "soutien-tag"), server.soutienTag ? "Tag compté" : "Tag ignoré", { emoji: server.soutienTag ? ICON.actif : ICON.inactif, style: ButtonStyle.Secondary }),
        button(id(view, "soutien-ajouter"), "Ajouter un texte", { emoji: ICON.ajouter, style: ButtonStyle.Success, disabled: texts.length >= MAX_SUPPORT_TEXTS }),
        button(id(view, "soutien-verifier"), "Vérifier tout le monde", { emoji: "🔄", disabled: !server.soutienRoleId }),
      ),
      back(view),
    ],
  });
}

function voiceView(view: View): Payload {
  const server = serverSettings(view.settings);
  return withNotice(view, {
    embeds: [
      panel(view, "🔊 Vocaux temporaires", "Rejoindre le salon créateur ouvre un vocal personnel, supprimé une fois vide.").addFields(
        { name: "Salon créateur", value: channel(server.vocalCreateurId), inline: true },
        { name: "Nom", value: `\`${server.vocalNom ?? DEFAULT_VOICE_NAME}\``, inline: true },
        { name: "Limite", value: server.vocalLimite ? `${server.vocalLimite} membres` : "Aucune", inline: true },
        { name: "Ouverts en ce moment", value: String(server.vocalTemporaires?.length ?? 0), inline: true },
      ),
    ],
    components: [
      row(channelSelect(view, "vocal-createur", "Salon créateur", [ChannelType.GuildVoice], server.vocalCreateurId)),
      row(button(id(view, "vocal-modifier"), "Nom et limite", { emoji: ICON.modifier })),
      back(view),
    ],
  });
}

function publishView(view: View): Payload {
  const server = serverSettings(view.settings);
  return {
    ...statusPayload(view.settings, server, lastFivemStatus(), view.guild.name),
    content: view.notice ? status(view.notice) : "📤 **Où publier le statut ?** Il sera mis à jour chaque minute.",
    components: [
      row(new ChannelSelectMenuBuilder().setCustomId(id(view, "publier")).setPlaceholder("Choisir le salon").setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),
      row(button(id(view, "go", "fivem"), "Retour", { emoji: ICON.retour, style: ButtonStyle.Secondary })),
    ],
  };
}

export function renderServerPanel(view: View, target = "accueil"): Payload {
  if (view.prefix === SUPPORT_PREFIX) return supportView(view);
  switch (target) {
    case "fivem":
      return fivemView(view);
    case "compteurs":
      return countersView(view);
    case "soutien":
      return supportView(view);
    case "vocaux":
      return voiceView(view);
    case "publier":
      return publishView(view);
    default:
      return home(view);
  }
}

// ─── Actions ────────────────────────────────────────────────────────────────

async function show(interaction: PanelInteraction, prefix: string, target: string, notice?: string) {
  const settings = await getSettings(interaction.guildId);
  const payload = renderServerPanel({ settings, guild: interaction.guild, owner: interaction.user.id, notice, prefix }, target);
  if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
  else if (interaction.isModalSubmit() && !interaction.isFromMessage()) await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
  else await interaction.update(payload);
}

function submitted(interaction: PanelInteraction): ModalSubmitInteraction<"cached"> {
  if (!interaction.isModalSubmit()) throw new Error("Formulaire attendu.");
  return interaction;
}

async function commit(interaction: PanelInteraction, prefix: string, settings: GuildSettings, next: ServerSettings, target: string, notice: string) {
  await saveServerSettings(settings, next);
  return show(interaction, prefix, target, notice);
}

/** Lien de connexion : https uniquement. */
export function parseJoinLink(input: string | null): string | undefined {
  if (!input) return undefined;
  const value = /^https?:\/\//.test(input) ? input : `https://${input}`;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new UserError("Lien de connexion invalide (exemple : https://cfx.re/join/abc123).");
  }
  if (url.protocol !== "https:") throw new UserError("Le lien de connexion doit commencer par https://.");
  return url.toString();
}

/** Actions du panneau du rôle soutien, seules permises depuis `/soutien`. */
const SUPPORT_ACTIONS = new Set(["go", "aide", "fermer", "soutien-role", "soutien-tag", "soutien-ajouter", "soutien-ajouter-ok", "soutien-retirer", "soutien-verifier"]);

function panelHandler(prefix: string, command: string): ComponentHandler {
  return {
    prefix,
    command,
    handle: async (interaction, context) => {
      if (prefix === SUPPORT_PREFIX && !SUPPORT_ACTIONS.has(context.action)) throw new Error(`Action hors du panneau du rôle soutien : ${context.action}`);
      return handlePanel(prefix, interaction, context);
    },
  };
}

export const serverPanel = panelHandler(PREFIX, "serveur");
export const supportPanel = panelHandler(SUPPORT_PREFIX, "soutien");

/** Panneau du rôle soutien seul, ouvert par `/soutien`. */
export function renderSupportPanel(view: Omit<View, "prefix">): Payload {
  return renderServerPanel({ ...view, prefix: SUPPORT_PREFIX }, "soutien");
}

async function handlePanel(prefix: string, interaction: PanelInteraction, { settings, action, args }: { settings: GuildSettings; action: string; args: string[] }) {
  const server = serverSettings(settings);
  const view: View = { settings, guild: interaction.guild, owner: interaction.user.id, prefix };
  const openModal = (form: ReturnType<typeof modal>) => {
    if (interaction.isModalSubmit()) throw new Error("Un formulaire ne peut pas en ouvrir un autre.");
    return interaction.showModal(form);
  };

  switch (action) {
    case "go":
      return show(interaction, prefix, interaction.isStringSelectMenu() ? (interaction.values[0] ?? "accueil") : args.join(":"));
    case "aide":
      return interaction.reply({ embeds: [embed(settings, "parchemin").setTitle(`${ICON.aide} Aide · Vie du serveur`).setDescription(GUIDE)], flags: MessageFlags.Ephemeral });
    case "fermer":
      await interaction.deferUpdate();
      return interaction.deleteReply();

    case "fivem-modifier":
      return openModal(
        modal(id(view, "fivem-modifier-ok"), "Serveur FiveM", [
          { id: "adresse", label: "Adresse (IP:port, vide pour retirer)", value: server.fivemAdresse, maxLength: 100, placeholder: "51.75.12.34:30120" },
          { id: "lien", label: "Lien de connexion (facultatif)", value: server.fivemLien, maxLength: 200, placeholder: "https://cfx.re/join/abc123" },
        ]),
      );
    case "fivem-modifier-ok": {
      const form = submitted(interaction);
      const address = field(form, "adresse");
      if (address) parseAddress(address);
      const next = { ...server, fivemAdresse: address ?? undefined, fivemLien: parseJoinLink(field(form, "lien")) };
      await interaction.deferUpdate();
      await saveServerSettings(settings, next);
      const status = await refreshFivem(next);
      return show(interaction, prefix, "fivem", status ? (status.online ? `Serveur joint : ${status.players}/${status.max} joueurs.` : "Adresse enregistrée, mais le serveur ne répond pas.") : "Serveur FiveM retiré.");
    }
    case "fivem-tester": {
      await interaction.deferUpdate();
      const status = await refreshFivem(server);
      return show(interaction, prefix, "fivem", status?.online ? `En ligne : ${status.players}/${status.max} joueurs.` : "Le serveur ne répond pas.");
    }
    case "publier": {
      if (!interaction.isChannelSelectMenu()) throw new Error("Menu de salons attendu.");
      const target = interaction.guild.channels.cache.get(interaction.values[0] ?? "");
      const me = interaction.guild.members.me;
      if (!target?.isSendable() || !me || !target.permissionsFor(me).has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
        throw new UserError("Le bot ne peut pas publier dans ce salon : il lui faut Voir le salon, Envoyer des messages et Intégrer des liens.");
      }
      await interaction.deferUpdate();
      await refreshFivem(server);
      const message = await target.send(statusPayload(settings, server, lastFivemStatus(), interaction.guild.name));
      if (server.statutMessage) {
        const previous = interaction.guild.channels.cache.get(server.statutMessage.channelId);
        if (previous?.isTextBased()) await previous.messages.delete(server.statutMessage.messageId).catch(() => {});
      }
      await saveServerSettings(settings, { ...server, statutMessage: { channelId: target.id, messageId: message.id } });
      return show(interaction, prefix, "fivem", `Statut publié dans ${target}.`);
    }

    case "compteur": {
      if (!interaction.isChannelSelectMenu()) throw new Error("Menu de salons attendu.");
      const counter = args[0] as CounterId;
      if (!Object.hasOwn(COUNTERS, counter)) throw new Error(`Compteur inconnu : ${counter}`);
      const channelId = interaction.values[0];
      if (channelId) {
        const target = interaction.guild.channels.cache.get(channelId);
        const me = interaction.guild.members.me;
        if (!target || !me || !target.permissionsFor(me).has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels])) {
          throw new UserError("Le bot doit pouvoir voir et gérer ce salon pour le renommer.");
        }
      }
      const current = server.compteurs?.[counter];
      const compteurs = { ...server.compteurs, [counter]: channelId ? { channelId, name: current?.name ?? COUNTERS[counter].defaultName } : undefined };
      await interaction.deferUpdate();
      const next = { ...server, compteurs };
      await saveServerSettings(settings, next);
      // Sans attendre : Discord peut faire patienter un renommage plusieurs minutes.
      void updateCounters(interaction.guild, next).catch(error => logger.warn({ err: error }, "Mise à jour des compteurs impossible"));
      return show(interaction, prefix, "compteurs", channelId ? `${COUNTERS[counter].label} affiché dans <#${channelId}>.` : `${COUNTERS[counter].label} : compteur arrêté.`);
    }
    case "compteurs-noms":
      return openModal(
        modal(
          id(view, "compteurs-noms-ok"),
          "Noms des compteurs",
          (Object.keys(COUNTERS) as CounterId[]).map(counter => ({
            id: counter,
            label: `${COUNTERS[counter].label} ({n} = valeur)`,
            value: server.compteurs?.[counter]?.name ?? COUNTERS[counter].defaultName,
            maxLength: 90,
            placeholder: COUNTERS[counter].defaultName,
          })),
        ),
      );
    case "compteurs-noms-ok": {
      const form = submitted(interaction);
      const compteurs = { ...server.compteurs };
      for (const counter of Object.keys(COUNTERS) as CounterId[]) {
        const name = field(form, counter) ?? COUNTERS[counter].defaultName;
        if (!name.includes("{n}")) throw new UserError(`Le nom du compteur « ${COUNTERS[counter].label} » doit contenir {n}, remplacé par la valeur.`);
        const current = compteurs[counter];
        if (current) compteurs[counter] = { ...current, name };
      }
      return commit(interaction, prefix, settings, { ...server, compteurs }, "compteurs", "Noms enregistrés : les salons seront renommés sous 10 minutes.");
    }

    case "soutien-role": {
      if (!interaction.isRoleSelectMenu()) throw new Error("Menu de rôles attendu.");
      const roleId = interaction.values[0];
      if (roleId) {
        const role = interaction.guild.roles.cache.get(roleId);
        const problem = role ? roleProblem(role, interaction.guild.id, interaction.guild.members.me?.roles.highest.position ?? 0) : "rôle introuvable";
        if (problem) throw new UserError(problem);
      }
      return commit(interaction, prefix, settings, { ...server, soutienRoleId: roleId }, "soutien", roleId ? `Rôle soutien : <@&${roleId}>.` : "Plus de rôle soutien.");
    }
    case "soutien-tag":
      return commit(interaction, prefix, settings, { ...server, soutienTag: !server.soutienTag }, "soutien", server.soutienTag ? "Le tag du serveur n'est plus compté." : "Le tag du serveur donne le rôle soutien.");
    case "soutien-ajouter":
      return openModal(
        modal(id(view, "soutien-ajouter-ok"), "Texte autorisé dans le statut", [
          { id: "texte", label: "Texte à chercher dans le statut", required: true, maxLength: SUPPORT_TEXT_MAX, placeholder: "discord.gg/neahelike" },
        ]),
      );
    case "soutien-ajouter-ok": {
      const text = field(submitted(interaction), "texte") ?? "";
      const soutienTextes = addSupportText(server.soutienTextes ?? [], text);
      return commit(interaction, prefix, settings, { ...server, soutienTextes }, "soutien", `Un statut contenant « ${text} » donne le rôle soutien.`);
    }
    case "soutien-retirer": {
      if (!interaction.isStringSelectMenu()) throw new Error("Menu attendu.");
      const text = (server.soutienTextes ?? [])[Number(interaction.values[0])];
      if (!text) return show(interaction, prefix, "soutien");
      return commit(interaction, prefix, settings, { ...server, soutienTextes: removeSupportText(server.soutienTextes ?? [], text) }, "soutien", `« ${text} » retiré des textes du rôle soutien.`);
    }
    case "soutien-verifier": {
      await interaction.deferUpdate();
      await reconcileAllSupport(interaction.guild, server);
      return show(interaction, prefix, "soutien", "Rôle soutien vérifié pour les membres connus du bot.");
    }

    case "vocal-createur": {
      if (!interaction.isChannelSelectMenu()) throw new Error("Menu de salons attendu.");
      const channelId = interaction.values[0];
      if (channelId) {
        const target = interaction.guild.channels.cache.get(channelId);
        const me = interaction.guild.members.me;
        const parent = target?.parent ?? target;
        if (!parent || !me || !parent.permissionsFor(me).has([PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers])) {
          throw new UserError("Le bot doit pouvoir gérer les salons et déplacer les membres dans cette catégorie.");
        }
      }
      return commit(interaction, prefix, settings, { ...server, vocalCreateurId: channelId }, "vocaux", channelId ? `Rejoindre <#${channelId}> crée un vocal temporaire.` : "Vocaux temporaires désactivés.");
    }
    case "vocal-modifier":
      return openModal(
        modal(id(view, "vocal-modifier-ok"), "Vocaux temporaires", [
          { id: "nom", label: "Nom ({user.name} = membre)", value: server.vocalNom ?? DEFAULT_VOICE_NAME, maxLength: 90 },
          { id: "limite", label: "Limite de membres (0 = aucune)", value: String(server.vocalLimite ?? 0), maxLength: 2 },
        ]),
      );
    case "vocal-modifier-ok": {
      const form = submitted(interaction);
      const limit = Number(field(form, "limite") ?? 0);
      if (!Number.isInteger(limit) || limit < 0 || limit > 99) throw new UserError("La limite doit être un nombre entre 0 et 99.");
      return commit(interaction, prefix, settings, { ...server, vocalNom: field(form, "nom") ?? undefined, vocalLimite: limit || undefined }, "vocaux", "Vocaux temporaires enregistrés.");
    }
  }
  throw new Error(`Action de panneau inconnue : ${action}`);
}
