import { ButtonStyle, EmbedBuilder, MessageFlags, RoleSelectMenuBuilder, type Guild, type ModalSubmitInteraction } from "discord.js";
import {
  createLevel,
  deleteLevel,
  getSettings,
  moveLevel,
  renameLevel,
  resetCommandLevel,
  resetMessage,
  setCommandLevel,
  setLevelRoles,
  setMessage,
  setModuleEnabled,
  setModuleLevel,
  updateConfig,
  type GuildSettings,
} from "@/config/store";
import { isModuleEnabled, requiredLabel, requirementOf } from "@/core/access";
import { hexToInt, normalizeHexColor } from "@/core/args";
import { customId, type ComponentHandler, type PanelInteraction } from "@/core/components";
import type { Payload } from "@/core/context";
import { embed } from "@/core/embeds";
import { UserError } from "@/core/errors";
import { messageDefs, renderMessage } from "@/core/messages";
import { button, choice, field, ICON, modal, row, status } from "@/core/panels";
import { describeResolved, ladder, permissionName } from "@/core/permissions";
import { getRegistry } from "@/core/registry";
import { BASE_VARIABLES, baseVars } from "@/core/templates";
import { checkPrefix, DEFAULT_VALUE, EVERYONE_VALUE, findCommand, findMessage, findModule } from "./lookups";
import { ACTIVITIES, applyMemberProfile, applyPresence, describeActivity, imageUrl, STATUSES } from "./profile";

const PREFIX = "cfg";

/** Couleurs d'origine, d'après la charte du site. */
export const DEFAULT_COLORS = { embed_color: "#d1a64a", embed_color_dark: "#1a150f", embed_color_light: "#f1ece2" } as const;

export interface PanelView {
  settings: GuildSettings;
  guild: Guild;
  owner: string;
  /** Ligne de confirmation après une action. */
  notice?: string;
}

const SECTIONS = [
  { value: "general", label: "Général", emoji: ICON.general, description: "Préfixe des commandes et couleurs des messages" },
  { value: "modules", label: "Modules", emoji: ICON.modules, description: "Activer ou désactiver les fonctions du bot" },
  { value: "acces", label: "Accès", emoji: ICON.acces, description: "Qui a des droits dans le bot, et avec quels rôles" },
  { value: "commandes", label: "Commandes", emoji: ICON.commandes, description: "Qui peut utiliser chaque commande" },
  { value: "profil", label: "Profil du bot", emoji: ICON.profil, description: "Pseudo, avatar, bannière, statut et activité" },
  { value: "messages", label: "Messages", emoji: ICON.messages, description: "Textes personnalisables du bot" },
];

/** Petit guide de chaque section, ouvert par le bouton « Aide ». */
const GUIDES: Record<string, string> = {
  accueil:
    "Ce panneau règle tout le bot. Choisissez une section dans le menu « Fais un choix ».\n\n" +
    "**Par où commencer ?**\n1. **Accès** : liez vos rôles de staff aux accès Staff et Admin.\n2. **Modules** : coupez ce dont vous n'avez pas besoin.\n3. **Messages** et **Profil** : donnez au bot le ton de la cité.\n\n" +
    "Chaque réglage est enregistré aussitôt. Les commandes existent en `/` et avec le préfixe (`+config`).",
  general:
    "**Préfixe** : le caractère placé devant les commandes écrites, par exemple `+aide`. Les commandes `/` fonctionnent toujours, quel que soit le préfixe.\n\n" +
    "**Couleurs** : la barre colorée à gauche des messages du bot. La principale sert presque partout (logs compris), la neutre aux refus, l'accent à l'aide.",
  modules:
    "Un module regroupe une fonction du bot et ses commandes. Cliquez sur un module pour l'activer ou le désactiver : ses commandes ne répondent plus quand il est désactivé.\n\n" +
    "Pour réserver tout un module à un accès (par exemple Staff), choisissez-le dans le menu « Régler qui peut utiliser un module ».",
  acces:
    "Un **accès** donne des droits dans le bot. Il est lié à un ou plusieurs rôles Discord.\n\n" +
    "L'échelle se lit de haut en bas : un accès placé plus haut a **tous les droits** de ceux du dessous. Utilisez Monter et Descendre pour changer l'ordre.\n\n" +
    "Tant qu'aucun accès n'est réglé sur une commande, elle suit sa **permission Discord** (celle qui l'affiche dans la liste `/`). Les administrateurs Discord ont toujours tout.",
  commandes:
    "Choisissez une commande, puis qui peut l'utiliser :\n" +
    "• **Par défaut** : la permission Discord de la commande, qui décide aussi si elle apparaît dans la liste `/`.\n" +
    "• **Un accès** : les membres de cet accès et des accès au-dessus.\n" +
    "• **Tout le monde**.\n\n" +
    `${ICON.attention} Discord cache une commande \`/\` aux membres sans sa permission par défaut. Si vous l'ouvrez à un accès plus large, ces membres l'utilisent avec le préfixe.`,
  profil:
    "Le pseudo, la bio, l'avatar et la bannière ne s'appliquent qu'à ce serveur. Le statut et l'activité s'affichent sous le nom du bot.\n\n" +
    "Pour une image, collez une adresse qui commence par `https://` et mène directement au fichier (PNG, JPEG, GIF ou WebP).",
  messages:
    "Chaque message peut être réécrit. Les variables entre accolades, comme `{user}` ou `{server}`, sont remplacées automatiquement.\n\n" +
    "Le bouton **M'envoyer un essai** vous montre le message tel que le joueur le recevra.",
};

function id(view: PanelView, action: string, ...args: string[]) {
  return customId(PREFIX, view.owner, action, ...args);
}

/** Vue parente de chaque vue, pour le bouton Retour. */
const PARENT: Record<string, string> = {
  general: "accueil",
  modules: "accueil",
  module: "modules",
  acces: "accueil",
  niveau: "acces",
  commandes: "accueil",
  commande: "commandes",
  profil: "accueil",
  messages: "accueil",
  message: "messages",
};

/** Guide affiché par le bouton Aide de chaque vue. */
const GUIDE_OF: Record<string, string> = { module: "modules", niveau: "acces", commande: "commandes", message: "messages" };

/** Rangée du bas : actions propres à la vue, puis Retour et Aide. */
function footer(view: PanelView, current: string, ...actions: ReturnType<typeof button>[]) {
  const name = current.split(":")[0] ?? "accueil";
  const parent = PARENT[name] ?? "accueil";
  return row(
    ...actions,
    button(id(view, "go", parent), "Retour", { emoji: ICON.retour, style: ButtonStyle.Secondary }),
    button(id(view, "aide", GUIDE_OF[name] ?? name), "Aide", { emoji: ICON.aide, style: ButtonStyle.Secondary }),
  );
}

function panel(view: PanelView, title: string, description: string) {
  return embed(view.settings).setTitle(title).setDescription(description).setFooter({ text: `Configuration · ${view.guild.name}` });
}

/** La ligne de confirmation est vidée à la navigation suivante. */
function withNotice(view: PanelView, payload: Payload): Payload {
  return { content: view.notice ? status(view.notice) : "", ...payload };
}

function roleList(roleIds: string[]) {
  return roleIds.length ? roleIds.map(roleId => `<@&${roleId}>`).join(" ") : "*aucun rôle*";
}

// ─── Vues ───────────────────────────────────────────────────────────────────

function home(view: PanelView): Payload {
  const { settings } = view;
  const { config } = settings;
  const modules = getRegistry().modules;
  const active = modules.filter(module => isModuleEnabled(settings, module.id)).length;
  const rolesLinked = settings.levels.some(level => level.roleIds.length > 0);
  const profileSet = Boolean(config.nickname || config.avatar_url || config.activity_text);
  const check = (done: boolean, text: string) => `${done ? ICON.fait : ICON.afaire} ${text}`;

  return withNotice(view, {
    embeds: [
      panel(
        view,
        `${ICON.general} Configuration du bot`,
        "Réglez le bot depuis ce panneau : choisissez une section dans le menu ci-dessous.\n\n" +
          `**Mise en route**\n${check(rolesLinked, "Lier vos rôles aux accès")}\n${check(profileSet, "Personnaliser le profil du bot")}`,
      ).addFields(
        { name: "Préfixe", value: `\`${config.prefix}\``, inline: true },
        { name: "Modules actifs", value: `${active} sur ${modules.length}`, inline: true },
        { name: "Accès", value: ladder(settings.levels).map(level => level.name).join(" ▸ ") || "Aucun", inline: true },
      ),
    ],
    components: [
      row(choice(id(view, "go"), SECTIONS)),
      row(
        button(id(view, "aide", "accueil"), "Aide", { emoji: ICON.aide, style: ButtonStyle.Secondary }),
        button(id(view, "fermer"), "Fermer", { emoji: ICON.fermer, style: ButtonStyle.Secondary }),
      ),
    ],
  });
}

function general(view: PanelView): Payload {
  const { config } = view.settings;
  const sample = (color: string, text: string) => new EmbedBuilder().setColor(hexToInt(color)).setDescription(`${text} · \`${color}\``);
  const isDefault =
    config.embed_color === DEFAULT_COLORS.embed_color &&
    config.embed_color_dark === DEFAULT_COLORS.embed_color_dark &&
    config.embed_color_light === DEFAULT_COLORS.embed_color_light;

  return withNotice(view, {
    embeds: [
      panel(view, `${ICON.general} Général`, "Le préfixe et les couleurs des messages du bot. Les trois encadrés ci-dessous montrent le rendu de chaque couleur.").addFields({
        name: "Préfixe",
        value: `\`${config.prefix}\` — exemple : \`${config.prefix}aide\`. Les commandes \`/\` restent toujours disponibles.`,
      }),
      sample(config.embed_color, "**Principale** — la plupart des messages"),
      sample(config.embed_color_dark, "**Neutre** — refus et confirmations de suppression"),
      sample(config.embed_color_light, "**Accent** — détails"),
    ],
    components: [
      row(
        button(id(view, "prefixe"), "Préfixe", { emoji: ICON.modifier }),
        button(id(view, "couleurs"), "Couleurs", { emoji: ICON.couleurs }),
        button(id(view, "couleurs-origine"), "Couleurs d'origine", { emoji: ICON.reinitialiser, style: ButtonStyle.Secondary, disabled: isDefault }),
      ),
      footer(view, "general"),
    ],
  });
}

function modulesView(view: PanelView): Payload {
  const modules = getRegistry().modules;
  const lines = modules.map(module => {
    const state = module.locked ? ICON.verrou : isModuleEnabled(view.settings, module.id) ? ICON.actif : ICON.inactif;
    return `${state} ${module.icon} **${module.label}** — ${module.description}`;
  });
  const toggles = modules.map(module =>
    button(id(view, "module-bascule", module.id), module.label, {
      emoji: module.locked ? ICON.verrou : module.icon,
      style: isModuleEnabled(view.settings, module.id) ? ButtonStyle.Success : ButtonStyle.Secondary,
      disabled: module.locked,
    }),
  );
  // Trois rangées de boutons au plus, pour garder la place du menu et du pied.
  const toggleRows = [];
  for (let index = 0; index < toggles.length && toggleRows.length < 3; index += 5) toggleRows.push(row(...toggles.slice(index, index + 5)));

  return withNotice(view, {
    embeds: [
      panel(
        view,
        `${ICON.modules} Modules`,
        `Cliquez sur un module pour l'activer ou le désactiver.\n${ICON.actif} actif · ${ICON.inactif} désactivé · ${ICON.verrou} toujours actif\n\n${lines.join("\n")}`,
      ),
    ],
    components: [
      ...toggleRows,
      row(
        choice(
          id(view, "go", "pick"),
          modules.map(module => ({ label: module.label, value: `module:${module.id}`, emoji: module.icon, description: "Qui peut utiliser ses commandes" })),
          "Régler qui peut utiliser un module",
        ),
      ),
      footer(view, "modules"),
    ],
  });
}

function moduleView(view: PanelView, moduleId: string): Payload {
  const module = findModule(moduleId);
  const levelId = view.settings.modules.get(module.id)?.levelId;
  const level = levelId ? view.settings.levels.find(item => item.id === levelId) : undefined;
  const enabled = isModuleEnabled(view.settings, module.id);
  const commands = (module.commands ?? []).map(command => `\`/${command.name}\` — ${requiredLabel(view.settings, command)}`);

  return withNotice(view, {
    embeds: [
      panel(view, `${module.icon} ${module.label}`, module.description).addFields(
        { name: "État", value: module.locked ? `${ICON.verrou} Toujours actif` : enabled ? `${ICON.actif} Actif` : `${ICON.inactif} Désactivé`, inline: true },
        { name: "Réservé à", value: level ? `Accès ${level.name} et au-dessus` : "Selon chaque commande", inline: true },
        { name: "Commandes et qui peut les utiliser", value: commands.join("\n").slice(0, 1024) || "Aucune commande" },
      ),
    ],
    components: [
      row(
        choice(
          id(view, "module-acces", module.id),
          [
            { label: "Selon chaque commande", value: DEFAULT_VALUE, description: "Réglage par défaut", default: !level },
            ...ladder(view.settings.levels).map(item => ({ label: `Accès ${item.name} et au-dessus`, value: item.id, emoji: ICON.acces, default: item.id === level?.id })),
          ],
          "Réserver le module à un accès",
        ),
      ),
      footer(
        view,
        `module:${module.id}`,
        button(id(view, "module-bascule", module.id, "page"), module.locked ? "Toujours actif" : enabled ? "Désactiver" : "Activer", {
          emoji: module.locked ? ICON.verrou : enabled ? ICON.inactif : ICON.actif,
          style: enabled ? ButtonStyle.Secondary : ButtonStyle.Success,
          disabled: module.locked,
        }),
      ),
    ],
  });
}

function accesView(view: PanelView): Payload {
  const levels = ladder(view.settings.levels);
  const lines = levels.map(level => `**${level.name}** — ${roleList(level.roleIds)}`).join("\n") || "*Aucun accès*";
  return withNotice(view, {
    embeds: [
      panel(
        view,
        `${ICON.acces} Accès`,
        "Un accès donne des droits dans le bot. Un accès placé **plus haut** a tous les droits de ceux du dessous.\n\n" +
          `${ICON.monter} *plus de droits*\n${lines}\n${ICON.descendre} *moins de droits*`,
      ),
    ],
    components: [
      ...(levels.length
        ? [
            row(
              choice(
                id(view, "go", "pick"),
                levels.map(level => ({ label: level.name, value: `niveau:${level.id}`, emoji: ICON.acces, description: `${level.roleIds.length} rôle(s) lié(s)` })),
              ),
            ),
          ]
        : []),
      footer(view, "acces", button(id(view, "niveau-nouveau"), "Créer un accès", { emoji: ICON.ajouter, style: ButtonStyle.Success })),
    ],
  });
}

function levelOf(view: PanelView, levelId: string) {
  const level = view.settings.levels.find(item => item.id === levelId);
  if (!level) throw new UserError("Cet accès n'existe plus.");
  return level;
}

function levelView(view: PanelView, levelId: string): Payload {
  const level = levelOf(view, levelId);
  const levels = ladder(view.settings.levels);
  const index = levels.findIndex(item => item.id === level.id);
  const above = levels[index - 1];
  const below = levels[index + 1];
  const position = [above && `sous **${above.name}**`, below && `au-dessus de **${below.name}**`].filter(Boolean).join(", ") || "seul accès";
  const defaults = level.roleIds.filter(roleId => view.guild.roles.cache.has(roleId));
  const select = new RoleSelectMenuBuilder()
    .setCustomId(id(view, "niveau-roles", level.id))
    .setPlaceholder("Choisir les rôles qui donnent cet accès")
    .setMinValues(0)
    .setMaxValues(25);
  if (defaults.length) select.addDefaultRoles(defaults);

  return withNotice(view, {
    embeds: [
      panel(view, `${ICON.acces} Accès ${level.name}`, `Position : ${index + 1} sur ${levels.length} (${position}).\nSélectionnez dans le menu **tous** les rôles qui donnent cet accès.`).addFields({
        name: "Rôles liés",
        value: roleList(level.roleIds).slice(0, 1024),
      }),
    ],
    components: [
      row(select),
      row(
        button(id(view, "niveau-monter", level.id), "Monter", { emoji: ICON.monter, disabled: index === 0 }),
        button(id(view, "niveau-descendre", level.id), "Descendre", { emoji: ICON.descendre, disabled: index === levels.length - 1 }),
        button(id(view, "niveau-renommer", level.id), "Renommer", { emoji: ICON.modifier }),
        button(id(view, "go", "niveau-suppr", level.id), "Supprimer", { emoji: ICON.supprimer, style: ButtonStyle.Danger }),
      ),
      footer(view, `niveau:${level.id}`),
    ],
  });
}

function levelDeleteView(view: PanelView, levelId: string): Payload {
  const level = levelOf(view, levelId);
  return withNotice(view, {
    embeds: [
      embed(view.settings, "bronze")
        .setTitle(`${ICON.attention} Supprimer l'accès ${level.name} ?`)
        .setDescription("Les rôles liés perdent cet accès. Les commandes et modules réglés sur lui reviennent à leur réglage par défaut. Cette action est définitive."),
    ],
    components: [
      row(
        button(id(view, "niveau-suppr", level.id), "Supprimer définitivement", { emoji: ICON.supprimer, style: ButtonStyle.Danger }),
        button(id(view, "go", "niveau", level.id), "Annuler", { emoji: ICON.annuler, style: ButtonStyle.Secondary }),
      ),
    ],
  });
}

function commandsView(view: PanelView): Payload {
  const modules = getRegistry().modules.filter(module => module.commands?.length);
  const blocks = modules.map(
    module =>
      `${module.icon} **${module.label}**\n` +
      module
        .commands!.map(command => `\`/${command.name}\` — ${requiredLabel(view.settings, command)}${view.settings.commandOverrides.has(command.name) ? " *(réglé)*" : ""}`)
        .join("\n"),
  );
  const commands = modules.flatMap(module => module.commands!.map(command => ({ command, module })));

  return withNotice(view, {
    embeds: [panel(view, `${ICON.commandes} Commandes`, `Qui peut utiliser chaque commande. Choisissez-en une pour la régler.\n\n${blocks.join("\n\n")}`.slice(0, 4096))],
    components: [
      row(
        choice(
          id(view, "go", "pick"),
          commands.map(({ command, module }) => ({
            label: `/${command.name}`,
            value: `commande:${command.name}`,
            emoji: module.icon,
            description: requiredLabel(view.settings, command),
          })),
        ),
      ),
      footer(view, "commandes"),
    ],
  });
}

function commandView(view: PanelView, name: string): Payload {
  const command = findCommand(name);
  const override = view.settings.commandOverrides.get(command.name);
  const resolved = requirementOf(view.settings, command);
  const defaultLabel = command.defaultPermission === null ? "Tout le monde" : `Permission « ${permissionName(command.defaultPermission)} »`;
  const visibility =
    command.defaultPermission === null ? "Visible par tout le monde." : `Visible par les membres ayant la permission « ${permissionName(command.defaultPermission)} ».`;
  const result = panel(view, `${ICON.commandes} /${command.name}`, command.description).addFields(
    { name: "Qui peut l'utiliser", value: describeResolved(resolved), inline: true },
    { name: "Par défaut", value: defaultLabel, inline: true },
    { name: "Liste « / »", value: visibility },
  );
  // Un accès réglé peut viser des membres qui ne voient pas la commande dans la liste « / ».
  if (resolved.kind !== "permission" && command.defaultPermission !== null) {
    result.addFields({
      name: `${ICON.attention} À savoir`,
      value: "Les membres sans la permission par défaut ne voient pas cette commande dans la liste « / » : ils l'utilisent avec le préfixe.",
    });
  }

  return withNotice(view, {
    embeds: [result],
    components: [
      row(
        choice(
          id(view, "commande-acces", command.name),
          [
            { label: "Par défaut", value: DEFAULT_VALUE, description: defaultLabel, default: !override },
            ...(command.protected ? [] : [{ label: "Tout le monde", value: EVERYONE_VALUE, emoji: "🌐", default: override?.levelId === null }]),
            ...ladder(view.settings.levels).map(level => ({
              label: `Accès ${level.name} et au-dessus`,
              value: level.id,
              emoji: ICON.acces,
              default: override?.levelId === level.id,
            })),
          ],
          "Qui peut utiliser cette commande ?",
        ),
      ),
      footer(view, `commande:${command.name}`),
    ],
  });
}

function profileView(view: PanelView): Payload {
  const { config } = view.settings;
  const me = view.guild.members.me;
  const avatar = config.avatar_url ?? me?.displayAvatarURL();
  const preview = embed(view.settings)
    .setAuthor({ name: config.nickname ?? me?.displayName ?? "Bot", ...(avatar && { iconURL: avatar }) })
    .setTitle(`${ICON.profil} Profil du bot`)
    .setDescription(config.bio ?? "*Aucune bio*")
    .addFields(
      { name: "Statut", value: STATUSES[config.presence_status]?.label ?? config.presence_status, inline: true },
      { name: "Activité", value: describeActivity(config), inline: true },
    )
    .setFooter({ text: `Configuration · ${view.guild.name}` });
  if (avatar) preview.setThumbnail(avatar);
  if (config.banner_url) preview.setImage(config.banner_url);

  return withNotice(view, {
    embeds: [preview],
    components: [
      row(
        choice(id(view, "profil-action"), [
          { label: "Pseudo et bio", value: "identite", emoji: ICON.modifier, description: "Nom affiché et bio sur ce serveur" },
          { label: "Avatar et bannière", value: "images", emoji: ICON.image, description: "Images du bot sur ce serveur" },
          { label: "Retirer l'activité", value: "sans-activite", emoji: ICON.retirer },
        ]),
      ),
      row(choice(id(view, "profil-statut"), Object.entries(STATUSES).map(([value, item]) => ({ label: item.label, value, default: value === config.presence_status })), "Statut")),
      row(choice(id(view, "profil-activite"), Object.entries(ACTIVITIES).map(([value, item]) => ({ label: item.label, value, emoji: ICON.activite })), "Changer l'activité")),
      footer(view, "profil"),
    ],
  });
}

function messagesView(view: PanelView): Payload {
  const defs = messageDefs();
  const modules = getRegistry().modules.filter(module => defs.some(message => message.module === module.id));
  const blocks = modules.map(
    module =>
      `${module.icon} **${module.label}**\n` +
      defs
        .filter(message => message.module === module.id)
        .map(message => `• ${message.label}${view.settings.messages.has(message.key) ? " *(personnalisé)*" : ""}`)
        .join("\n"),
  );
  return withNotice(view, {
    embeds: [panel(view, `${ICON.messages} Messages`, `Les textes que le bot envoie. Choisissez-en un pour le modifier.\n\n${blocks.join("\n\n")}`.slice(0, 4096))],
    components: [
      row(
        choice(
          id(view, "go", "pick"),
          defs.map(message => ({
            label: message.label,
            value: `message:${message.key}`,
            emoji: getRegistry().module(message.module)?.icon,
            description: view.settings.messages.has(message.key) ? "Personnalisé" : "Texte d'origine",
          })),
        ),
      ),
      footer(view, "messages"),
    ],
  });
}

/** Le message tel que le joueur le recevra, avec les variables du membre qui regarde. */
export function messagePreview(view: Pick<PanelView, "settings" | "guild" | "owner">, key: string): EmbedBuilder {
  const member = view.guild.members.cache.get(view.owner);
  const user = member && { id: member.id, username: member.user.username, displayName: member.displayName };
  return embed(view.settings).setDescription(renderMessage(view.settings, key, baseVars({ user, guild: view.guild })).slice(0, 4096));
}

function messageView(view: PanelView, key: string): Payload {
  const definition = findMessage(key);
  const custom = view.settings.messages.has(definition.key);
  const content = view.settings.messages.get(definition.key) ?? definition.defaultContent;
  const variables = { ...BASE_VARIABLES, ...definition.variables };

  return withNotice(view, {
    embeds: [
      panel(view, `${ICON.messages} ${definition.label}`, `**Texte ${custom ? "personnalisé" : "d'origine"}**\n\`\`\`\n${content.slice(0, 1500)}\n\`\`\``).addFields({
        name: "Variables disponibles",
        value: Object.entries(variables)
          .map(([name, label]) => `\`${name}\` ${label}`)
          .join("\n")
          .slice(0, 1024),
      }),
      messagePreview(view, definition.key).setAuthor({ name: "Aperçu : ce que verra le joueur" }),
    ],
    components: [
      row(
        button(id(view, "message-modifier", definition.key), "Modifier", { emoji: ICON.modifier }),
        button(id(view, "message-essai", definition.key), "M'envoyer un essai", { emoji: ICON.essai, style: ButtonStyle.Secondary }),
        button(id(view, "message-origine", definition.key), "Texte d'origine", { emoji: ICON.reinitialiser, style: ButtonStyle.Secondary, disabled: !custom }),
      ),
      footer(view, `message:${definition.key}`),
    ],
  });
}

/** Rendu d'une vue du panneau, identifiée par `section[:argument]`. */
export function renderPanel(view: PanelView, target: string): Payload {
  const [name, ...rest] = target.split(":");
  const arg = rest.join(":");
  switch (name) {
    case "general":
      return general(view);
    case "modules":
      return modulesView(view);
    case "module":
      return moduleView(view, arg);
    case "acces":
      return accesView(view);
    case "niveau":
      return levelView(view, arg);
    case "niveau-suppr":
      return levelDeleteView(view, arg);
    case "commandes":
      return commandsView(view);
    case "commande":
      return commandView(view, arg);
    case "profil":
      return profileView(view);
    case "messages":
      return messagesView(view);
    case "message":
      return messageView(view, arg);
    default:
      return home(view);
  }
}

// ─── Actions ────────────────────────────────────────────────────────────────

/** Relit la configuration et redessine le panneau, avec une éventuelle ligne de confirmation. */
async function show(interaction: PanelInteraction, target: string, notice?: string) {
  const settings = await getSettings(interaction.guildId);
  const payload = renderPanel({ settings, guild: interaction.guild, owner: interaction.user.id, notice }, target);
  if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
  else if (interaction.isModalSubmit() && !interaction.isFromMessage()) await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
  else if (interaction.isModalSubmit()) await interaction.update(payload);
  else await interaction.update(payload);
}

function selected(interaction: PanelInteraction): string {
  if (!interaction.isAnySelectMenu()) throw new Error("Menu attendu.");
  return interaction.values[0] ?? "";
}

function submitted(interaction: PanelInteraction): ModalSubmitInteraction<"cached"> {
  if (!interaction.isModalSubmit()) throw new Error("Formulaire attendu.");
  return interaction;
}

function color(form: ModalSubmitInteraction, key: string) {
  const raw = field(form, key) ?? "";
  const value = normalizeHexColor(raw);
  if (!value) throw new UserError(`Couleur invalide : « ${raw} ». Format attendu : #d1a64a.`);
  return value;
}

export const configPanel: ComponentHandler = {
  prefix: PREFIX,
  command: "config",
  async handle(interaction, { settings, action, args }) {
    const guildId = interaction.guildId;
    const view: PanelView = { settings, guild: interaction.guild, owner: interaction.user.id };
    const arg = args[0] ?? "";
    const openModal = (form: ReturnType<typeof modal>) => {
      if (interaction.isModalSubmit()) throw new Error("Un formulaire ne peut pas en ouvrir un autre.");
      return interaction.showModal(form);
    };

    switch (action) {
      case "go":
        return show(interaction, interaction.isStringSelectMenu() ? selected(interaction) : args.join(":"));
      case "aide":
        return interaction.reply({
          embeds: [embed(settings, "parchemin").setTitle(`${ICON.aide} Aide`).setDescription(GUIDES[arg] ?? GUIDES.accueil!)],
          flags: MessageFlags.Ephemeral,
        });
      case "fermer":
        await interaction.deferUpdate();
        return interaction.deleteReply();

      // Général
      case "prefixe":
        return openModal(
          modal(id(view, "prefixe-ok"), "Préfixe des commandes", [
            { id: "prefix", label: "Préfixe (1 à 5 caractères, sans espace)", value: settings.config.prefix, required: true, maxLength: 5, placeholder: "+" },
          ]),
        );
      case "prefixe-ok": {
        const prefix = checkPrefix(field(submitted(interaction), "prefix") ?? "");
        await updateConfig(guildId, { prefix });
        return show(interaction, "general", `Préfixe changé : \`${prefix}\` (exemple : \`${prefix}aide\`).`);
      }
      case "couleurs":
        return openModal(
          modal(id(view, "couleurs-ok"), "Couleurs des messages", [
            { id: "main", label: "Principale (or par défaut)", value: settings.config.embed_color, required: true, maxLength: 7, placeholder: "#d1a64a" },
            { id: "dark", label: "Neutre (bronze par défaut)", value: settings.config.embed_color_dark, required: true, maxLength: 7, placeholder: "#1a150f" },
            { id: "light", label: "Accent (parchemin par défaut)", value: settings.config.embed_color_light, required: true, maxLength: 7, placeholder: "#f1ece2" },
          ]),
        );
      case "couleurs-ok": {
        const form = submitted(interaction);
        await updateConfig(guildId, { embed_color: color(form, "main"), embed_color_dark: color(form, "dark"), embed_color_light: color(form, "light") });
        return show(interaction, "general", "Couleurs enregistrées.");
      }
      case "couleurs-origine":
        await updateConfig(guildId, { ...DEFAULT_COLORS });
        return show(interaction, "general", "Couleurs d'origine rétablies.");

      // Modules
      case "module-bascule": {
        const module = findModule(arg);
        if (module.locked) throw new UserError("Ce module est indispensable : il ne peut pas être désactivé.");
        const enabled = !isModuleEnabled(settings, module.id);
        await setModuleEnabled(guildId, module.id, enabled);
        return show(interaction, args[1] === "page" ? `module:${module.id}` : "modules", `Module ${module.label} ${enabled ? "activé" : "désactivé"}.`);
      }
      case "module-acces": {
        const module = findModule(arg);
        const value = selected(interaction);
        const level = value === DEFAULT_VALUE ? null : levelOf(view, value);
        await setModuleLevel(guildId, module.id, level?.id ?? null);
        return show(
          interaction,
          `module:${module.id}`,
          level ? `Module ${module.label} réservé à l'accès ${level.name} et au-dessus.` : `Module ${module.label} : chaque commande suit son propre réglage.`,
        );
      }

      // Accès
      case "niveau-nouveau":
        return openModal(modal(id(view, "niveau-nouveau-ok"), "Nouvel accès", [{ id: "name", label: "Nom de l'accès", required: true, maxLength: 32, placeholder: "Modérateur" }]));
      case "niveau-nouveau-ok": {
        const name = field(submitted(interaction), "name") ?? "";
        const levelId = await createLevel(guildId, name);
        return show(interaction, `niveau:${levelId}`, `Accès ${name} créé en bas de l'échelle : montez-le à sa place, puis choisissez ses rôles.`);
      }
      case "niveau-renommer": {
        const level = levelOf(view, arg);
        return openModal(modal(id(view, "niveau-renommer-ok", level.id), `Renommer ${level.name}`, [{ id: "name", label: "Nouveau nom", value: level.name, required: true, maxLength: 32 }]));
      }
      case "niveau-renommer-ok": {
        const name = field(submitted(interaction), "name") ?? "";
        await renameLevel(guildId, levelOf(view, arg).id, name);
        return show(interaction, `niveau:${arg}`, `Accès renommé : ${name}.`);
      }
      case "niveau-monter":
      case "niveau-descendre": {
        const level = levelOf(view, arg);
        const up = action === "niveau-monter";
        await moveLevel(guildId, level.id, up ? "monter" : "descendre");
        return show(interaction, `niveau:${level.id}`, `Accès ${level.name} ${up ? "monté" : "descendu"} d'un cran.`);
      }
      case "niveau-roles": {
        if (!interaction.isRoleSelectMenu()) throw new Error("Menu de rôles attendu.");
        const level = levelOf(view, arg);
        await setLevelRoles(guildId, level.id, interaction.values);
        return show(interaction, `niveau:${level.id}`, `${interaction.values.length} rôle(s) lié(s) à l'accès ${level.name}.`);
      }
      case "niveau-suppr": {
        const level = levelOf(view, arg);
        await deleteLevel(guildId, level.id);
        return show(interaction, "acces", `Accès ${level.name} supprimé.`);
      }

      // Commandes
      case "commande-acces": {
        const command = findCommand(arg);
        const value = selected(interaction);
        if (value === DEFAULT_VALUE) {
          await resetCommandLevel(guildId, command.name);
        } else if (value === EVERYONE_VALUE) {
          if (command.protected) throw new UserError("Une commande de configuration ne peut pas être ouverte à tout le monde.");
          await setCommandLevel(guildId, command.name, null);
        } else {
          await setCommandLevel(guildId, command.name, levelOf(view, value).id);
        }
        const updated = await getSettings(guildId);
        return show(interaction, `commande:${command.name}`, `/${command.name} : ${requiredLabel(updated, command)}.`);
      }

      // Profil
      case "profil-action": {
        const value = selected(interaction);
        if (value === "identite") {
          return openModal(
            modal(id(view, "profil-identite-ok"), "Pseudo et bio du bot", [
              { id: "nick", label: "Pseudo (vide = nom de l'application)", value: settings.config.nickname, maxLength: 32 },
              { id: "bio", label: "Bio sur ce serveur", value: settings.config.bio, long: true, maxLength: 190 },
            ]),
          );
        }
        if (value === "images") {
          return openModal(
            modal(id(view, "profil-images-ok"), "Avatar et bannière du bot", [
              { id: "avatar", label: "Adresse de l'avatar (vide = par défaut)", value: settings.config.avatar_url, maxLength: 500, placeholder: "https://…" },
              { id: "banner", label: "Adresse de la bannière (vide = aucune)", value: settings.config.banner_url, maxLength: 500, placeholder: "https://…" },
            ]),
          );
        }
        await updateConfig(guildId, { activity_text: null });
        applyPresence(interaction.client, (await getSettings(guildId)).config);
        return show(interaction, "profil", "Activité retirée.");
      }
      case "profil-statut": {
        const value = selected(interaction);
        await updateConfig(guildId, { presence_status: value });
        applyPresence(interaction.client, (await getSettings(guildId)).config);
        return show(interaction, "profil", `Statut : ${STATUSES[value]?.label ?? value}.`);
      }
      case "profil-activite": {
        const type = selected(interaction);
        return openModal(
          modal(id(view, "profil-activite-ok", type), ACTIVITIES[type]?.label ?? "Activité", [
            { id: "text", label: "Texte (vide pour retirer l'activité)", value: settings.config.activity_text, maxLength: 128, placeholder: "Veille sur la cité" },
          ]),
        );
      }
      case "profil-activite-ok": {
        if (!ACTIVITIES[arg]) throw new UserError("Type d'activité inconnu.");
        await updateConfig(guildId, { activity_type: arg, activity_text: field(submitted(interaction), "text") });
        const updated = await getSettings(guildId);
        applyPresence(interaction.client, updated.config);
        return show(interaction, "profil", `Activité : ${describeActivity(updated.config)}.`);
      }
      case "profil-identite-ok": {
        const form = submitted(interaction);
        const nick = field(form, "nick");
        const bio = field(form, "bio");
        await form.deferUpdate();
        await applyMemberProfile(interaction.guild, { nick, bio });
        await updateConfig(guildId, { nickname: nick, bio });
        return show(interaction, "profil", "Pseudo et bio enregistrés.");
      }
      case "profil-images-ok": {
        const form = submitted(interaction);
        const avatar = imageUrl(field(form, "avatar"));
        const banner = imageUrl(field(form, "banner"));
        const patch = {
          ...(avatar !== settings.config.avatar_url && { avatar }),
          ...(banner !== settings.config.banner_url && { banner }),
        };
        await form.deferUpdate();
        if (Object.keys(patch).length) await applyMemberProfile(interaction.guild, patch);
        await updateConfig(guildId, { avatar_url: avatar, banner_url: banner });
        return show(interaction, "profil", "Images enregistrées.");
      }

      // Messages
      case "message-modifier": {
        const definition = findMessage(arg);
        return openModal(
          modal(id(view, "message-modifier-ok", definition.key), definition.label, [
            {
              id: "content",
              label: "Texte (variables entre accolades)",
              value: settings.messages.get(definition.key) ?? definition.defaultContent,
              long: true,
              required: true,
              maxLength: 2000,
            },
          ]),
        );
      }
      case "message-modifier-ok": {
        const definition = findMessage(arg);
        await setMessage(guildId, definition.key, field(submitted(interaction), "content") ?? definition.defaultContent);
        return show(interaction, `message:${definition.key}`, "Message enregistré.");
      }
      case "message-essai": {
        const definition = findMessage(arg);
        return interaction.reply({
          content: "Voici le message tel que le joueur le recevra :",
          embeds: [messagePreview(view, definition.key)],
          flags: MessageFlags.Ephemeral,
        });
      }
      case "message-origine": {
        const definition = findMessage(arg);
        await resetMessage(guildId, definition.key);
        return show(interaction, `message:${definition.key}`, "Texte d'origine rétabli.");
      }
    }
    throw new Error(`Action de panneau inconnue : ${action}`);
  },
};
