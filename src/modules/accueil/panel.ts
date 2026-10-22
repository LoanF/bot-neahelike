import { ButtonStyle, ChannelSelectMenuBuilder, ChannelType, MessageFlags, PermissionFlagsBits, RoleSelectMenuBuilder, type Guild, type GuildBasedChannel, type ModalSubmitInteraction } from "discord.js";
import { getSettings, resetMessage, setMessage, type GuildSettings } from "@/config/store";
import { customId, type ComponentHandler, type PanelInteraction } from "@/core/components";
import type { Payload } from "@/core/context";
import { embed } from "@/core/embeds";
import { UserError } from "@/core/errors";
import { messageDef } from "@/core/messages";
import { button, choice, field, ICON, modal, row, status } from "@/core/panels";
import { findPanel, MAX_AUTOROLES, MAX_PANEL_ROLES, MAX_ROLE_PANELS, newPanelId, roleProblem, saveWelcomeSettings, welcomeSettings, type RolePanel, type WelcomeSettings } from "./settings";
import { leavePayload, refreshPublished, roleNameIn, rolePanelPayload, rulesPayload, welcomeDmPayload, welcomePayload } from "./ui";

const PREFIX = "acc";

const GUIDE =
  "**Bienvenue et départ** : choisissez les salons ; le texte se modifie ici (variables `{user}`, `{user.name}`, `{server}`, `{count}`). Le message privé de bienvenue est facultatif.\n" +
  "**Rôles à l'arrivée** : donnés automatiquement à chaque nouveau membre (par exemple « Novice (Non WL) »).\n" +
  "**Règlement** : écrivez le texte, choisissez le rôle donné en l'acceptant, puis publiez-le ; un bouton « J'accepte » apparaît dessous.\n" +
  "**Panneaux de rôles** : les membres prennent ou rendent eux-mêmes des rôles, par boutons ou menu déroulant. « Un seul rôle à la fois » convient aux couleurs.\n\n" +
  "Le bot ne distribue jamais un rôle placé au-dessus du sien, ni un rôle qui donne des permissions de gestion ou de modération. " +
  "Les rôles de la whitelist (« attente de wl », « Magistrat (wl) ») sont donnés par le site : ne les mettez pas dans un panneau.";

/** Textes modifiables depuis le panneau, avec le titre de leur formulaire. */
const TEXTS: Record<string, string> = {
  "accueil.bienvenue": "Message de bienvenue",
  "accueil.bienvenue-mp": "Message privé de bienvenue",
  "accueil.depart": "Message de départ",
  "accueil.reglement": "Texte du règlement",
};

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
  return embed(view.settings).setTitle(title).setDescription(description).setFooter({ text: `Accueil · ${view.guild.name}` });
}

const channel = (channelId?: string) => (channelId ? `<#${channelId}>` : "*Désactivé*");
const roles = (roleIds: string[]) => roleIds.map(roleId => `<@&${roleId}>`).join(" ") || "*Aucun*";
const link = (guildId: string, ref?: { channelId: string; messageId: string }) =>
  ref ? `[Voir le message](https://discord.com/channels/${guildId}/${ref.channelId}/${ref.messageId})` : "*Pas encore publié*";

function back(view: View, target = "accueil") {
  return row(
    button(id(view, "go", target), "Retour", { emoji: ICON.retour, style: ButtonStyle.Secondary }),
    button(id(view, "aide"), "Aide", { emoji: ICON.aide, style: ButtonStyle.Secondary }),
  );
}

function channelSelect(view: View, action: string, placeholder: string, current?: string) {
  const select = new ChannelSelectMenuBuilder().setCustomId(id(view, action)).setPlaceholder(placeholder).setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setMinValues(0).setMaxValues(1);
  if (current && view.guild.channels.cache.has(current)) select.addDefaultChannels(current);
  return select;
}

function roleSelect(view: View, action: string, placeholder: string, current: string[], max: number) {
  const select = new RoleSelectMenuBuilder().setCustomId(id(view, action)).setPlaceholder(placeholder).setMinValues(0).setMaxValues(max);
  const defaults = current.filter(roleId => view.guild.roles.cache.has(roleId));
  if (defaults.length) select.addDefaultRoles(defaults);
  return select;
}

// ─── Vues ───────────────────────────────────────────────────────────────────

function home(view: View): Payload {
  const welcome = welcomeSettings(view.settings);
  return withNotice(view, {
    embeds: [
      panel(view, "👋 Accueil", "Bienvenue et départ, rôles à l'arrivée, règlement et rôles en libre-service.").addFields(
        { name: "Bienvenue", value: `${channel(welcome.bienvenueId)}${welcome.bienvenueMp ? " · MP activé" : ""}`, inline: true },
        { name: "Départ", value: channel(welcome.departId), inline: true },
        { name: "Rôles à l'arrivée", value: roles(welcome.autoroles) },
        { name: "Règlement", value: `Rôle : ${welcome.reglementRoleId ? `<@&${welcome.reglementRoleId}>` : "*aucun*"} · ${link(view.guild.id, welcome.reglementMessage)}` },
        { name: `Panneaux de rôles (${welcome.panneaux.length})`, value: welcome.panneaux.map(item => `• **${item.title}** — ${item.roleIds.length} rôle(s), ${item.message ? "publié" : "non publié"}`).join("\n") || "*Aucun*" },
      ),
    ],
    components: [
      row(
        choice(id(view, "go", "nav"), [
          { label: "Bienvenue et départ", value: "messages", emoji: "👋", description: "Salons, textes et message privé" },
          { label: "Rôles à l'arrivée et règlement", value: "roles", emoji: "📜", description: "Autorôle, rôle du règlement, publication" },
          { label: "Panneaux de rôles", value: "panneaux", emoji: "🎭", description: "Rôles que les membres prennent eux-mêmes" },
        ]),
      ),
      row(
        button(id(view, "aide"), "Aide", { emoji: ICON.aide, style: ButtonStyle.Secondary }),
        button(id(view, "fermer"), "Fermer", { emoji: ICON.fermer, style: ButtonStyle.Secondary }),
      ),
    ],
  });
}

function messagesView(view: View): Payload {
  const welcome = welcomeSettings(view.settings);
  return withNotice(view, {
    embeds: [
      panel(view, "👋 Bienvenue et départ", "Choisissez les salons (vide pour désactiver) et modifiez les textes. « Essai » vous montre le résultat avec votre propre profil.").addFields(
        { name: "Salon de bienvenue", value: channel(welcome.bienvenueId), inline: true },
        { name: "Salon de départ", value: channel(welcome.departId), inline: true },
        { name: "Message privé", value: welcome.bienvenueMp ? "Activé" : "Désactivé", inline: true },
      ),
    ],
    components: [
      row(channelSelect(view, "salon-bienvenue", "Salon de bienvenue", welcome.bienvenueId)),
      row(channelSelect(view, "salon-depart", "Salon de départ", welcome.departId)),
      row(
        button(id(view, "texte", "accueil.bienvenue"), "Bienvenue", { emoji: ICON.modifier }),
        button(id(view, "texte", "accueil.depart"), "Départ", { emoji: ICON.modifier }),
        button(id(view, "texte", "accueil.bienvenue-mp"), "Message privé", { emoji: ICON.modifier }),
        button(id(view, "mp"), welcome.bienvenueMp ? "MP activé" : "MP désactivé", { emoji: welcome.bienvenueMp ? ICON.actif : ICON.inactif, style: ButtonStyle.Secondary }),
        button(id(view, "essai"), "Essai", { emoji: ICON.essai, style: ButtonStyle.Secondary }),
      ),
      back(view),
    ],
  });
}

function rolesView(view: View): Payload {
  const welcome = welcomeSettings(view.settings);
  return withNotice(view, {
    embeds: [
      panel(view, "📜 Rôles à l'arrivée et règlement", "Les rôles à l'arrivée sont donnés à chaque nouveau membre. Le rôle du règlement est donné en cliquant sur « J'accepte ».").addFields(
        { name: `Rôles à l'arrivée (${MAX_AUTOROLES} au plus)`, value: roles(welcome.autoroles) },
        { name: "Rôle du règlement", value: welcome.reglementRoleId ? `<@&${welcome.reglementRoleId}>` : `${ICON.attention} *Aucun : le bouton ne fera rien*`, inline: true },
        { name: "Règlement publié", value: link(view.guild.id, welcome.reglementMessage), inline: true },
      ),
    ],
    components: [
      row(roleSelect(view, "autoroles", "Rôles donnés à l'arrivée", welcome.autoroles, MAX_AUTOROLES)),
      row(roleSelect(view, "role-reglement", "Rôle donné en acceptant le règlement", welcome.reglementRoleId ? [welcome.reglementRoleId] : [], 1)),
      row(
        button(id(view, "texte", "accueil.reglement"), "Texte du règlement", { emoji: ICON.modifier }),
        button(id(view, "go", "publier", "reglement"), welcome.reglementMessage ? "Déplacer le règlement" : "Publier le règlement", { emoji: "📤" }),
      ),
      back(view),
    ],
  });
}

function panelsView(view: View): Payload {
  const welcome = welcomeSettings(view.settings);
  return withNotice(view, {
    embeds: [
      panel(view, "🎭 Panneaux de rôles", "Chaque panneau propose des rôles que les membres prennent ou rendent eux-mêmes.").addFields({
        name: `Panneaux (${welcome.panneaux.length} sur ${MAX_ROLE_PANELS})`,
        value: welcome.panneaux.map(item => `• **${item.title}** — ${item.roleIds.length} rôle(s), ${item.style}, ${item.message ? "publié" : "non publié"}`).join("\n") || "*Aucun panneau.*",
      }),
    ],
    components: [
      ...(welcome.panneaux.length
        ? [row(choice(id(view, "go", "pick"), welcome.panneaux.map(item => ({ label: item.title, value: `panneau:${item.id}`, description: `${item.roleIds.length} rôle(s)` })), "Régler un panneau"))]
        : []),
      row(
        button(id(view, "panneau-nouveau"), "Panneau", { emoji: ICON.ajouter, style: ButtonStyle.Success, disabled: welcome.panneaux.length >= MAX_ROLE_PANELS }),
        button(id(view, "go", "accueil"), "Retour", { emoji: ICON.retour, style: ButtonStyle.Secondary }),
        button(id(view, "aide"), "Aide", { emoji: ICON.aide, style: ButtonStyle.Secondary }),
      ),
    ],
  });
}

function panelView(view: View, panelId: string): Payload {
  const item = findPanel(welcomeSettings(view.settings), panelId);
  return withNotice(view, {
    embeds: [
      panel(view, `🎭 ${item.title}`, item.description || "*Sans description*").addFields(
        { name: `Rôles (${item.roleIds.length} sur ${MAX_PANEL_ROLES})`, value: roles(item.roleIds).slice(0, 1024) },
        { name: "Présentation", value: item.style === "boutons" ? "Boutons" : "Menu déroulant", inline: true },
        { name: "Un seul rôle à la fois", value: item.unique ? "Oui" : "Non", inline: true },
        { name: "Publié", value: link(view.guild.id, item.message), inline: true },
      ),
    ],
    components: [
      row(roleSelect(view, "panneau-roles", "Rôles proposés", item.roleIds, MAX_PANEL_ROLES).setCustomId(id(view, "panneau-roles", item.id))),
      row(
        button(id(view, "panneau-modifier", item.id), "Titre et texte", { emoji: ICON.modifier }),
        button(id(view, "panneau-style", item.id), item.style === "boutons" ? "Passer en menu" : "Passer en boutons", { emoji: "🔁" }),
        button(id(view, "panneau-unique", item.id), item.unique ? "Plusieurs rôles" : "Un seul rôle", { emoji: "1️⃣" }),
        button(id(view, "go", "publier", item.id), item.message ? "Déplacer" : "Publier", { emoji: "📤" }),
        button(id(view, "go", "suppr", item.id), "Supprimer", { emoji: ICON.supprimer, style: ButtonStyle.Danger }),
      ),
      back(view, "panneaux"),
    ],
  });
}

function deleteView(view: View, panelId: string): Payload {
  const item = findPanel(welcomeSettings(view.settings), panelId);
  return withNotice(view, {
    embeds: [embed(view.settings, "bronze").setTitle(`${ICON.attention} Supprimer le panneau ${item.title} ?`).setDescription("Le message publié est retiré. Les membres gardent les rôles qu'ils ont déjà pris.")],
    components: [
      row(
        button(id(view, "panneau-suppr", item.id), "Supprimer le panneau", { emoji: ICON.supprimer, style: ButtonStyle.Danger }),
        button(id(view, "go", "panneau", item.id), "Annuler", { emoji: ICON.annuler, style: ButtonStyle.Secondary }),
      ),
    ],
  });
}

function publishView(view: View, target: string): Payload {
  const preview = target === "reglement" ? rulesPayload(view.settings, view.guild) : rolePanelPayload(view.settings, findPanel(welcomeSettings(view.settings), target), roleNameIn(view.guild));
  return {
    ...preview,
    content: view.notice ? status(view.notice) : "📤 **Où publier ce message ?** Voici l'aperçu de ce que verront les membres.",
    components: [
      row(new ChannelSelectMenuBuilder().setCustomId(id(view, "publier", target)).setPlaceholder("Choisir le salon").setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),
      back(view, target === "reglement" ? "roles" : `panneau:${target}`),
    ],
  };
}

export function renderWelcomePanel(view: View, target = "accueil"): Payload {
  const [name, ...rest] = target.split(":");
  const arg = rest.join(":");
  switch (name) {
    case "messages":
      return messagesView(view);
    case "roles":
      return rolesView(view);
    case "panneaux":
      return panelsView(view);
    case "panneau":
      return panelView(view, arg);
    case "suppr":
      return deleteView(view, arg);
    case "publier":
      return publishView(view, arg);
    default:
      return home(view);
  }
}

// ─── Actions ────────────────────────────────────────────────────────────────

async function show(interaction: PanelInteraction, target: string, notice?: string) {
  const settings = await getSettings(interaction.guildId);
  const payload = renderWelcomePanel({ settings, guild: interaction.guild, owner: interaction.user.id, notice }, target);
  if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
  else if (interaction.isModalSubmit() && !interaction.isFromMessage()) await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
  else await interaction.update(payload);
}

function submitted(interaction: PanelInteraction): ModalSubmitInteraction<"cached"> {
  if (!interaction.isModalSubmit()) throw new Error("Formulaire attendu.");
  return interaction;
}

/** Refuse les rôles que le bot ne pourrait pas distribuer, avec la raison. */
export function checkDistributable(guild: Guild, roleIds: string[]) {
  const top = guild.members.me?.roles.highest.position ?? 0;
  const problems = roleIds.flatMap(roleId => {
    const role = guild.roles.cache.get(roleId);
    const problem = role ? roleProblem(role, guild.id, top) : "rôle introuvable";
    return problem ? [problem] : [];
  });
  if (problems.length) throw new UserError(problems.join("\n"));
}

function checkPublishable(guild: Guild, target: GuildBasedChannel | undefined) {
  if (!target?.isSendable()) throw new UserError("Ce salon ne peut pas recevoir de messages.");
  const me = guild.members.me;
  if (!me || !target.permissionsFor(me).has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
    throw new UserError(`Le bot ne peut pas publier dans ${target} : il lui faut Voir le salon, Envoyer des messages et Intégrer des liens.`);
  }
  return target;
}

/** Accuse réception tout de suite : mettre à jour les messages publiés peut dépasser les 3 secondes de Discord. */
async function deferPanel(interaction: PanelInteraction) {
  if (interaction.deferred || interaction.replied) return;
  if (interaction.isModalSubmit() && !interaction.isFromMessage()) return;
  await interaction.deferUpdate();
}

async function commit(interaction: PanelInteraction, settings: GuildSettings, next: WelcomeSettings, target: string, notice: string) {
  await deferPanel(interaction);
  await saveWelcomeSettings(settings, next);
  await refreshPublished(interaction.guild);
  return show(interaction, target, notice);
}

function panelModal(customIdValue: string, title: string, item?: RolePanel) {
  return modal(customIdValue, title, [
    { id: "titre", label: "Titre", value: item?.title, required: true, maxLength: 100, placeholder: "Notifications" },
    { id: "texte", label: "Texte au-dessus des rôles", value: item?.description, long: true, maxLength: 1000, placeholder: "Choisis les annonces que tu veux recevoir." },
  ]);
}

export const welcomePanel: ComponentHandler = {
  prefix: PREFIX,
  command: "accueil",
  async handle(interaction, { settings, action, args }) {
    const welcome = welcomeSettings(settings);
    const view: View = { settings, guild: interaction.guild, owner: interaction.user.id };
    const arg = args[0] ?? "";
    const openModal = (form: ReturnType<typeof modal>) => {
      if (interaction.isModalSubmit()) throw new Error("Un formulaire ne peut pas en ouvrir un autre.");
      return interaction.showModal(form);
    };
    const replace = (item: RolePanel) => welcome.panneaux.map(other => (other.id === item.id ? item : other));

    switch (action) {
      case "go":
        return show(interaction, interaction.isStringSelectMenu() ? (interaction.values[0] ?? "accueil") : args.join(":"));
      case "aide":
        return interaction.reply({ embeds: [embed(settings, "parchemin").setTitle(`${ICON.aide} Aide · Accueil`).setDescription(GUIDE)], flags: MessageFlags.Ephemeral });
      case "fermer":
        await interaction.deferUpdate();
        return interaction.deleteReply();

      case "salon-bienvenue":
      case "salon-depart": {
        if (!interaction.isChannelSelectMenu()) throw new Error("Menu de salons attendu.");
        const channelId = interaction.values[0];
        if (channelId) checkPublishable(interaction.guild, interaction.guild.channels.cache.get(channelId));
        const key = action === "salon-bienvenue" ? "bienvenueId" : "departId";
        const what = action === "salon-bienvenue" ? "Bienvenue" : "Départ";
        return commit(interaction, settings, { ...welcome, [key]: channelId }, "messages", channelId ? `${what} annoncé dans <#${channelId}>.` : `${what} : plus de message.`);
      }
      case "mp":
        return commit(interaction, settings, { ...welcome, bienvenueMp: !welcome.bienvenueMp }, "messages", welcome.bienvenueMp ? "Message privé désactivé." : "Message privé activé.");
      case "texte": {
        const title = TEXTS[arg];
        if (!title) throw new Error(`Texte inconnu : ${arg}`);
        const current = settings.messages.get(arg) ?? messageDef(arg)?.defaultContent;
        return openModal(
          modal(id(view, "texte-ok", arg), title, [{ id: "texte", label: "Texte (vide pour revenir au texte par défaut)", value: current, long: true, maxLength: 4000 }]),
        );
      }
      case "texte-ok": {
        if (!TEXTS[arg]) throw new Error(`Texte inconnu : ${arg}`);
        const text = field(submitted(interaction), "texte");
        await deferPanel(interaction);
        if (text) await setMessage(interaction.guildId, arg, text);
        else await resetMessage(interaction.guildId, arg);
        await refreshPublished(interaction.guild);
        return show(interaction, arg === "accueil.reglement" ? "roles" : "messages", text ? `${TEXTS[arg]} enregistré.` : `${TEXTS[arg]} : texte par défaut rétabli.`);
      }
      case "essai": {
        const member = interaction.member;
        const previews = [welcomePayload(settings, member), leavePayload(settings, member), ...(welcome.bienvenueMp ? [welcomeDmPayload(settings, member)] : [])];
        return interaction.reply({
          embeds: previews.flatMap(preview => preview.embeds ?? []),
          content: `${ICON.essai} Aperçu : bienvenue, départ${welcome.bienvenueMp ? " et message privé" : ""}.`,
          allowedMentions: { parse: [] },
          flags: MessageFlags.Ephemeral,
        });
      }

      case "autoroles": {
        if (!interaction.isRoleSelectMenu()) throw new Error("Menu de rôles attendu.");
        checkDistributable(interaction.guild, interaction.values);
        return commit(interaction, settings, { ...welcome, autoroles: interaction.values }, "roles", `${interaction.values.length} rôle(s) donné(s) à l'arrivée.`);
      }
      case "role-reglement": {
        if (!interaction.isRoleSelectMenu()) throw new Error("Menu de rôles attendu.");
        const roleId = interaction.values[0];
        if (roleId) checkDistributable(interaction.guild, [roleId]);
        return commit(interaction, settings, { ...welcome, reglementRoleId: roleId }, "roles", roleId ? `Le règlement donne <@&${roleId}>.` : "Plus aucun rôle lié au règlement.");
      }

      case "panneau-nouveau":
        return openModal(panelModal(id(view, "panneau-nouveau-ok"), "Nouveau panneau de rôles"));
      case "panneau-nouveau-ok": {
        if (welcome.panneaux.length >= MAX_ROLE_PANELS) throw new UserError(`${MAX_ROLE_PANELS} panneaux au plus.`);
        const form = submitted(interaction);
        const item: RolePanel = { id: newPanelId(), title: field(form, "titre") ?? "Rôles", description: field(form, "texte") ?? "", style: "boutons", unique: false, roleIds: [] };
        return commit(interaction, settings, { ...welcome, panneaux: [...welcome.panneaux, item] }, `panneau:${item.id}`, `Panneau ${item.title} créé : choisissez ses rôles.`);
      }
      case "panneau-modifier":
        return openModal(panelModal(id(view, "panneau-modifier-ok", arg), "Titre et texte", findPanel(welcome, arg)));
      case "panneau-modifier-ok": {
        const form = submitted(interaction);
        const item = { ...findPanel(welcome, arg), title: field(form, "titre") ?? "Rôles", description: field(form, "texte") ?? "" };
        return commit(interaction, settings, { ...welcome, panneaux: replace(item) }, `panneau:${item.id}`, "Panneau enregistré.");
      }
      case "panneau-roles": {
        if (!interaction.isRoleSelectMenu()) throw new Error("Menu de rôles attendu.");
        checkDistributable(interaction.guild, interaction.values);
        const item = { ...findPanel(welcome, arg), roleIds: interaction.values };
        return commit(interaction, settings, { ...welcome, panneaux: replace(item) }, `panneau:${item.id}`, `${item.roleIds.length} rôle(s) sur le panneau.`);
      }
      case "panneau-style": {
        const current = findPanel(welcome, arg);
        const item: RolePanel = { ...current, style: current.style === "boutons" ? "menu" : "boutons" };
        return commit(interaction, settings, { ...welcome, panneaux: replace(item) }, `panneau:${item.id}`, item.style === "boutons" ? "Présenté en boutons." : "Présenté en menu déroulant.");
      }
      case "panneau-unique": {
        const item = { ...findPanel(welcome, arg), unique: !findPanel(welcome, arg).unique };
        return commit(interaction, settings, { ...welcome, panneaux: replace(item) }, `panneau:${item.id}`, item.unique ? "Un seul rôle à la fois." : "Plusieurs rôles possibles.");
      }
      case "panneau-suppr": {
        const item = findPanel(welcome, arg);
        if (item.message) {
          const previous = interaction.guild.channels.cache.get(item.message.channelId);
          if (previous?.isTextBased()) await previous.messages.delete(item.message.messageId).catch(() => {});
        }
        return commit(interaction, settings, { ...welcome, panneaux: welcome.panneaux.filter(other => other.id !== item.id) }, "panneaux", `Panneau ${item.title} supprimé.`);
      }

      case "publier": {
        if (!interaction.isChannelSelectMenu()) throw new Error("Menu de salons attendu.");
        const target = checkPublishable(interaction.guild, interaction.guild.channels.cache.get(interaction.values[0] ?? ""));
        await deferPanel(interaction);
        const isRules = arg === "reglement";
        const previousRef = isRules ? welcome.reglementMessage : findPanel(welcome, arg).message;
        const payload = isRules ? rulesPayload(settings, interaction.guild) : rolePanelPayload(settings, findPanel(welcome, arg), roleNameIn(interaction.guild));
        const message = await target.send(payload);
        // Un seul message à jour à la fois : l'ancien est retiré.
        if (previousRef) {
          const previous = interaction.guild.channels.cache.get(previousRef.channelId);
          if (previous?.isTextBased()) await previous.messages.delete(previousRef.messageId).catch(() => {});
        }
        const ref = { channelId: target.id, messageId: message.id };
        const next = isRules ? { ...welcome, reglementMessage: ref } : { ...welcome, panneaux: replace({ ...findPanel(welcome, arg), message: ref }) };
        await saveWelcomeSettings(settings, next);
        return show(interaction, isRules ? "roles" : `panneau:${arg}`, `Publié dans ${target}.`);
      }
    }
    throw new Error(`Action de panneau inconnue : ${action}`);
  },
};
