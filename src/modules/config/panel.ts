import { ButtonStyle, MessageFlags, RoleSelectMenuBuilder, StringSelectMenuBuilder, type Guild, type ModalSubmitInteraction } from "discord.js";
import {
  createLevel,
  deleteLevel,
  getSettings,
  resetCommandLevel,
  resetMessage,
  setCommandLevel,
  setLevelRoles,
  setMessage,
  setModuleEnabled,
  setModuleLevel,
  updateConfig,
  updateLevel,
  type GuildSettings,
} from "@/config/store";
import { commandWeight, isModuleEnabled, requiredLabel } from "@/core/access";
import { normalizeHexColor } from "@/core/args";
import { customId, type ComponentHandler, type PanelInteraction } from "@/core/components";
import type { Payload } from "@/core/context";
import { embed } from "@/core/embeds";
import { UserError } from "@/core/errors";
import { messageDefs } from "@/core/messages";
import { button, field, modal, row, type Row } from "@/core/panels";
import { describeWeight } from "@/core/permissions";
import { getRegistry } from "@/core/registry";
import { BASE_VARIABLES, baseVars, renderTemplate } from "@/core/templates";
import { checkPrefix, DEFAULT_VALUE, EVERYONE_VALUE, findCommand, findMessage, findModule } from "./lookups";
import { ACTIVITIES, applyMemberProfile, applyPresence, describeActivity, imageUrl, STATUSES } from "./profile";

const PREFIX = "cfg";

export interface PanelView {
  settings: GuildSettings;
  guild: Guild;
  owner: string;
}

const SECTIONS = [
  { value: "home", label: "Accueil", description: "Vue d'ensemble" },
  { value: "general", label: "Général", description: "Préfixe et couleurs des embeds" },
  { value: "modules", label: "Modules", description: "Activer, désactiver, rang requis" },
  { value: "levels", label: "Niveaux", description: "Niveaux de permission et rôles liés" },
  { value: "commands", label: "Commandes", description: "Rang requis par commande" },
  { value: "profile", label: "Profil du bot", description: "Pseudo, avatar, bannière, statut" },
  { value: "messages", label: "Messages", description: "Textes personnalisables" },
];

/** Section à laquelle appartient une vue (`level:…` → `levels`). */
const SECTION_OF: Record<string, string> = {
  module: "modules",
  level: "levels",
  "level-delete": "levels",
  command: "commands",
  message: "messages",
};

function id(view: PanelView, action: string, ...args: string[]) {
  return customId(PREFIX, view.owner, action, ...args);
}

function goButton(view: PanelView, target: string, label = "Retour") {
  return button(id(view, "go", ...target.split(":")), label);
}

function navigation(view: PanelView, current: string): Row {
  const root = current.split(":")[0]!;
  const section = SECTION_OF[root] ?? root;
  return row(
    new StringSelectMenuBuilder()
      .setCustomId(id(view, "go"))
      .setPlaceholder("Choisir une section")
      .addOptions(SECTIONS.map(item => ({ ...item, default: item.value === section }))),
  );
}

function title(view: PanelView, text: string) {
  return embed(view.settings).setTitle(text).setFooter({ text: `Configuration · ${view.guild.name}` });
}

function levelLabel(settings: GuildSettings, levelId: string | null | undefined) {
  const level = levelId ? settings.levels.find(item => item.id === levelId) : undefined;
  return level ? `${level.name} (poids ${level.weight})` : null;
}

// ─── Vues ───────────────────────────────────────────────────────────────────

function home(view: PanelView): Payload {
  const { config, levels } = view.settings;
  const modules = getRegistry().modules.map(module => `${isModuleEnabled(view.settings, module.id) ? "●" : "○"} ${module.label}`);
  return {
    embeds: [
      title(view, "Configuration du bot")
        .setDescription("Toute la configuration est enregistrée en base. Choisissez une section dans le menu.")
        .addFields(
          { name: "Préfixe", value: `\`${config.prefix}\``, inline: true },
          { name: "Couleurs", value: `\`${config.embed_color}\` · \`${config.embed_color_dark}\` · \`${config.embed_color_light}\``, inline: true },
          { name: "Activité", value: describeActivity(config), inline: true },
          { name: "Modules", value: modules.join("\n") || "Aucun" },
          {
            name: "Niveaux",
            value: [...levels].reverse().map(level => `**${level.name}** · poids ${level.weight} · ${level.roleIds.length} rôle(s)`).join("\n") || "Aucun",
          },
        ),
    ],
    components: [navigation(view, "home")],
  };
}

function general(view: PanelView): Payload {
  const { config } = view.settings;
  return {
    embeds: [
      title(view, "Général").addFields(
        { name: "Préfixe", value: `\`${config.prefix}\` — les commandes slash \`/\` restent toujours disponibles.` },
        { name: "Principale (or)", value: `\`${config.embed_color}\``, inline: true },
        { name: "Neutre (bronze)", value: `\`${config.embed_color_dark}\``, inline: true },
        { name: "Accent (parchemin)", value: `\`${config.embed_color_light}\``, inline: true },
      ),
    ],
    components: [navigation(view, "general"), row(button(id(view, "prefix"), "Changer le préfixe"), button(id(view, "colors"), "Changer les couleurs"))],
  };
}

function modulesView(view: PanelView): Payload {
  const lines = getRegistry().modules.map(module => {
    const state = isModuleEnabled(view.settings, module.id) ? "Activé" : "Désactivé";
    const level = levelLabel(view.settings, view.settings.modules.get(module.id)?.levelId);
    return `**${module.label}** — ${state}${module.locked ? " (indispensable)" : ""}${level ? ` · rang ${level}` : ""}\n${module.description}`;
  });
  return {
    embeds: [title(view, "Modules").setDescription(lines.join("\n\n"))],
    components: [
      navigation(view, "modules"),
      row(
        new StringSelectMenuBuilder()
          .setCustomId(id(view, "go"))
          .setPlaceholder("Régler un module")
          .addOptions(getRegistry().modules.map(module => ({ label: module.label, value: `module:${module.id}`, description: module.description.slice(0, 100) }))),
      ),
    ],
  };
}

function moduleView(view: PanelView, moduleId: string): Payload {
  const module = findModule(moduleId);
  const levelId = view.settings.modules.get(module.id)?.levelId;
  const enabled = isModuleEnabled(view.settings, module.id);
  const commands = (module.commands ?? []).map(command => `\`${command.name}\` — ${requiredLabel(view.settings, command)}`);
  return {
    embeds: [
      title(view, `Module · ${module.label}`)
        .setDescription(module.description)
        .addFields(
          { name: "État", value: enabled ? "Activé" : "Désactivé", inline: true },
          { name: "Rang du module", value: levelLabel(view.settings, levelId) ?? "Valeur par défaut de chaque commande", inline: true },
          { name: "Commandes (rang effectif)", value: commands.join("\n").slice(0, 1024) || "Aucune" },
        ),
    ],
    components: [
      navigation(view, "modules"),
      row(
        new StringSelectMenuBuilder()
          .setCustomId(id(view, "mod-level", module.id))
          .setPlaceholder("Rang requis pour tout le module")
          .addOptions([
            { label: "Valeur par défaut de chaque commande", value: DEFAULT_VALUE, default: !levelId },
            ...[...view.settings.levels].reverse().map(level => ({ label: `${level.name} (poids ${level.weight})`, value: level.id, default: levelId === level.id })),
          ]),
      ),
      row(
        button(
          id(view, "mod-toggle", module.id),
          module.locked ? "Toujours actif" : enabled ? "Désactiver" : "Activer",
          enabled ? ButtonStyle.Secondary : ButtonStyle.Success,
          module.locked,
        ),
        goButton(view, "modules"),
      ),
    ],
  };
}

function roleList(roleIds: string[]) {
  return roleIds.length ? roleIds.map(roleId => `<@&${roleId}>`).join(" ") : "*Aucun rôle lié*";
}

function levelsView(view: PanelView): Payload {
  const levels = [...view.settings.levels].reverse();
  return {
    embeds: [
      title(view, "Niveaux de permission")
        .setDescription(
          "Un niveau de poids supérieur hérite des droits des niveaux inférieurs. Un niveau peut être lié à plusieurs rôles.\nLa permission Discord « Administrateur » donne toujours accès à tout.",
        )
        .addFields(levels.map(level => ({ name: `${level.name} · poids ${level.weight}`, value: roleList(level.roleIds).slice(0, 1024) }))),
    ],
    components: [
      navigation(view, "levels"),
      ...(levels.length
        ? [
            row(
              new StringSelectMenuBuilder()
                .setCustomId(id(view, "go"))
                .setPlaceholder("Régler un niveau")
                .addOptions(levels.map(level => ({ label: `${level.name} (poids ${level.weight})`, value: `level:${level.id}` }))),
            ),
          ]
        : []),
      row(button(id(view, "lvl-new"), "Créer un niveau", ButtonStyle.Success)),
    ],
  };
}

function levelOf(view: PanelView, levelId: string) {
  const level = view.settings.levels.find(item => item.id === levelId);
  if (!level) throw new UserError("Ce niveau n'existe plus.");
  return level;
}

function levelView(view: PanelView, levelId: string): Payload {
  const level = levelOf(view, levelId);
  const defaults = level.roleIds.filter(roleId => view.guild.roles.cache.has(roleId));
  const select = new RoleSelectMenuBuilder().setCustomId(id(view, "lvl-roles", level.id)).setPlaceholder("Rôles liés à ce niveau").setMinValues(0).setMaxValues(25);
  if (defaults.length) select.addDefaultRoles(defaults);
  return {
    embeds: [
      title(view, `Niveau · ${level.name}`)
        .setDescription("Sélectionnez dans le menu l'ensemble des rôles liés à ce niveau : la sélection remplace la liste actuelle.")
        .addFields({ name: "Poids", value: String(level.weight), inline: true }, { name: "Rôles", value: roleList(level.roleIds).slice(0, 1024) }),
    ],
    components: [
      navigation(view, "levels"),
      row(select),
      row(button(id(view, "lvl-edit", level.id), "Renommer ou changer le poids"), goButton(view, `level-delete:${level.id}`, "Supprimer"), goButton(view, "levels")),
    ],
  };
}

function levelDeleteView(view: PanelView, levelId: string): Payload {
  const level = levelOf(view, levelId);
  return {
    embeds: [
      title(view, `Supprimer le niveau ${level.name} ?`).setDescription(
        "Les rôles liés perdent ce niveau. Les commandes réglées sur ce niveau et les modules qui l'utilisent reviennent à leur valeur par défaut.",
      ),
    ],
    components: [row(button(id(view, "lvl-del", level.id), "Supprimer définitivement", ButtonStyle.Danger), goButton(view, `level:${level.id}`, "Annuler"))],
  };
}

function commandsView(view: PanelView): Payload {
  const modules = getRegistry().modules.filter(module => module.commands?.length);
  return {
    embeds: [
      title(view, "Rang requis par commande").setDescription("Choisissez un module, puis une commande. Le réglage d'une commande l'emporte sur celui de son module."),
    ],
    components: [
      navigation(view, "commands"),
      row(
        new StringSelectMenuBuilder()
          .setCustomId(id(view, "go"))
          .setPlaceholder("Choisir un module")
          .addOptions(modules.map(module => ({ label: module.label, value: `commands:${module.id}`, description: `${module.commands!.length} commande(s)` }))),
      ),
    ],
  };
}

function moduleCommandsView(view: PanelView, moduleId: string): Payload {
  const module = findModule(moduleId);
  const commands = module.commands ?? [];
  const lines = commands.map(
    command => `\`${command.name}\` — ${requiredLabel(view.settings, command)}${view.settings.commandOverrides.has(command.name) ? " *(réglé)*" : ""}`,
  );
  return {
    embeds: [title(view, `Commandes · ${module.label}`).setDescription(lines.join("\n") || "Aucune commande.")],
    components: [
      navigation(view, "commands"),
      ...(commands.length
        ? [
            row(
              new StringSelectMenuBuilder()
                .setCustomId(id(view, "go"))
                .setPlaceholder("Régler une commande")
                .addOptions(commands.map(command => ({ label: command.name, value: `command:${command.name}`, description: command.description.slice(0, 100) }))),
            ),
          ]
        : []),
      row(goButton(view, "commands")),
    ],
  };
}

function commandView(view: PanelView, name: string): Payload {
  const command = findCommand(name);
  const override = view.settings.commandOverrides.get(command.name);
  const moduleLevel = view.settings.modules.get(command.module)?.levelId;
  const source = override ? "Réglage propre à la commande" : moduleLevel ? "Rang du module" : "Valeur par défaut";
  return {
    embeds: [
      title(view, `${view.settings.config.prefix}${command.name}`)
        .setDescription(command.description)
        .addFields(
          { name: "Rang effectif", value: describeWeight(view.settings.levels, commandWeight(view.settings, command)), inline: true },
          { name: "Origine", value: source, inline: true },
          { name: "Par défaut", value: describeWeight(view.settings.levels, command.defaultWeight), inline: true },
        ),
    ],
    components: [
      navigation(view, "commands"),
      row(
        new StringSelectMenuBuilder()
          .setCustomId(id(view, "cmd-level", command.name))
          .setPlaceholder("Rang requis")
          .addOptions([
            { label: "Par défaut (module ou valeur du code)", value: DEFAULT_VALUE, default: !override },
            ...(command.protected ? [] : [{ label: "Tout le monde", value: EVERYONE_VALUE, default: override?.levelId === null }]),
            ...[...view.settings.levels].reverse().map(level => ({ label: `${level.name} (poids ${level.weight})`, value: level.id, default: override?.levelId === level.id })),
          ]),
      ),
      row(goButton(view, `commands:${command.module}`)),
    ],
  };
}

function profileView(view: PanelView): Payload {
  const { config } = view.settings;
  const result = title(view, "Profil du bot").addFields(
    { name: "Pseudo sur le serveur", value: config.nickname ?? "*Nom de l'application*", inline: true },
    { name: "Statut", value: STATUSES[config.presence_status]?.label ?? config.presence_status, inline: true },
    { name: "Activité", value: describeActivity(config), inline: true },
    { name: "Bio", value: config.bio ?? "*Aucune*" },
    { name: "Avatar", value: config.avatar_url ?? "*Avatar de l'application*", inline: true },
    { name: "Bannière", value: config.banner_url ?? "*Aucune*", inline: true },
  );
  if (config.avatar_url) result.setThumbnail(config.avatar_url);
  return {
    embeds: [result],
    components: [
      navigation(view, "profile"),
      row(
        new StringSelectMenuBuilder()
          .setCustomId(id(view, "prof-status"))
          .setPlaceholder("Statut")
          .addOptions(Object.entries(STATUSES).map(([value, status]) => ({ label: status.label, value, default: value === config.presence_status }))),
      ),
      row(
        new StringSelectMenuBuilder()
          .setCustomId(id(view, "prof-activity"))
          .setPlaceholder("Changer l'activité")
          .addOptions(Object.entries(ACTIVITIES).map(([value, activity]) => ({ label: activity.label, value }))),
      ),
      row(button(id(view, "prof-identity"), "Pseudo et bio"), button(id(view, "prof-images"), "Avatar et bannière")),
    ],
  };
}

function messagesView(view: PanelView): Payload {
  const modules = getRegistry().modules.filter(module => messageDefs().some(message => message.module === module.id));
  return {
    embeds: [
      title(view, "Messages personnalisables").setDescription(
        `Choisissez un module. Variables communes :\n${Object.entries(BASE_VARIABLES)
          .map(([name, label]) => `\`${name}\` ${label}`)
          .join(" · ")}`,
      ),
    ],
    components: [
      navigation(view, "messages"),
      row(
        new StringSelectMenuBuilder()
          .setCustomId(id(view, "go"))
          .setPlaceholder("Choisir un module")
          .addOptions(modules.map(module => ({ label: module.label, value: `messages:${module.id}` }))),
      ),
    ],
  };
}

function moduleMessagesView(view: PanelView, moduleId: string): Payload {
  const module = findModule(moduleId);
  const messages = messageDefs().filter(message => message.module === module.id);
  return {
    embeds: [
      title(view, `Messages · ${module.label}`).setDescription(
        messages.map(message => `\`${message.key}\` — ${message.label}${view.settings.messages.has(message.key) ? " *(personnalisé)*" : ""}`).join("\n") ||
          "Aucun message.",
      ),
    ],
    components: [
      navigation(view, "messages"),
      ...(messages.length
        ? [
            row(
              new StringSelectMenuBuilder()
                .setCustomId(id(view, "go"))
                .setPlaceholder("Modifier un message")
                .addOptions(messages.map(message => ({ label: message.label.slice(0, 100), value: `message:${message.key}`, description: message.key }))),
            ),
          ]
        : []),
      row(goButton(view, "messages")),
    ],
  };
}

function messageView(view: PanelView, key: string): Payload {
  const definition = findMessage(key);
  const content = view.settings.messages.get(definition.key) ?? definition.defaultContent;
  const member = view.guild.members.cache.get(view.owner);
  const user = member && { id: member.id, username: member.user.username, displayName: member.displayName };
  const preview = renderTemplate(content, baseVars({ user, guild: view.guild }));
  const variables = { ...BASE_VARIABLES, ...definition.variables };
  return {
    embeds: [
      title(view, definition.label)
        .setDescription(`\`\`\`\n${content.slice(0, 1800)}\n\`\`\``)
        .addFields(
          { name: "Aperçu", value: preview.slice(0, 1024) },
          {
            name: "Variables",
            value: Object.entries(variables)
              .map(([name, label]) => `\`${name}\` ${label}`)
              .join("\n")
              .slice(0, 1024),
          },
        ),
    ],
    components: [
      navigation(view, "messages"),
      row(
        button(id(view, "msg-edit", definition.key), "Modifier", ButtonStyle.Primary),
        button(id(view, "msg-reset", definition.key), "Texte par défaut", ButtonStyle.Secondary, !view.settings.messages.has(definition.key)),
        goButton(view, `messages:${definition.module}`),
      ),
    ],
  };
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
    case "levels":
      return levelsView(view);
    case "level":
      return levelView(view, arg);
    case "level-delete":
      return levelDeleteView(view, arg);
    case "commands":
      return arg ? moduleCommandsView(view, arg) : commandsView(view);
    case "command":
      return commandView(view, arg);
    case "profile":
      return profileView(view);
    case "messages":
      return arg ? moduleMessagesView(view, arg) : messagesView(view);
    case "message":
      return messageView(view, arg);
    default:
      return home(view);
  }
}

// ─── Actions ────────────────────────────────────────────────────────────────

/** Relit la configuration et redessine le panneau à la vue demandée. */
async function show(interaction: PanelInteraction, target: string) {
  const settings = await getSettings(interaction.guildId);
  const payload = renderPanel({ settings, guild: interaction.guild, owner: interaction.user.id }, target);
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

function levelInput(form: ModalSubmitInteraction) {
  const name = field(form, "name") ?? "";
  const weight = Number(field(form, "weight"));
  if (!Number.isInteger(weight)) throw new UserError("Le poids doit être un nombre entier.");
  return { name, weight };
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

      // Général
      case "prefix":
        return openModal(
          modal(id(view, "prefix-save"), "Préfixe des commandes", [
            { id: "prefix", label: "Préfixe (1 à 5 caractères)", value: settings.config.prefix, required: true, maxLength: 5 },
          ]),
        );
      case "prefix-save":
        await updateConfig(guildId, { prefix: checkPrefix(field(submitted(interaction), "prefix") ?? "") });
        return show(interaction, "general");
      case "colors":
        return openModal(
          modal(id(view, "colors-save"), "Couleurs des embeds", [
            { id: "main", label: "Principale (or)", value: settings.config.embed_color, required: true, maxLength: 7 },
            { id: "dark", label: "Neutre (bronze)", value: settings.config.embed_color_dark, required: true, maxLength: 7 },
            { id: "light", label: "Accent (parchemin)", value: settings.config.embed_color_light, required: true, maxLength: 7 },
          ]),
        );
      case "colors-save": {
        const form = submitted(interaction);
        await updateConfig(guildId, { embed_color: color(form, "main"), embed_color_dark: color(form, "dark"), embed_color_light: color(form, "light") });
        return show(interaction, "general");
      }

      // Modules
      case "mod-toggle": {
        const module = findModule(arg);
        if (module.locked) throw new UserError("Ce module ne peut pas être désactivé.");
        await setModuleEnabled(guildId, module.id, !isModuleEnabled(settings, module.id));
        return show(interaction, `module:${module.id}`);
      }
      case "mod-level": {
        const module = findModule(arg);
        const value = selected(interaction);
        await setModuleLevel(guildId, module.id, value === DEFAULT_VALUE ? null : levelOf(view, value).id);
        return show(interaction, `module:${module.id}`);
      }

      // Niveaux
      case "lvl-new":
        return openModal(
          modal(id(view, "lvl-new-save"), "Nouveau niveau", [
            { id: "name", label: "Nom", required: true, maxLength: 32, placeholder: "Modérateur" },
            { id: "weight", label: "Poids (1 à 1000, plus haut = plus de droits)", required: true, maxLength: 4, placeholder: "30" },
          ]),
        );
      case "lvl-new-save": {
        const input = levelInput(submitted(interaction));
        const levelId = await createLevel(guildId, input.name, input.weight);
        return show(interaction, `level:${levelId}`);
      }
      case "lvl-edit": {
        const level = levelOf(view, arg);
        return openModal(
          modal(id(view, "lvl-edit-save", level.id), `Niveau ${level.name}`, [
            { id: "name", label: "Nom", value: level.name, required: true, maxLength: 32 },
            { id: "weight", label: "Poids (1 à 1000)", value: String(level.weight), required: true, maxLength: 4 },
          ]),
        );
      }
      case "lvl-edit-save":
        await updateLevel(guildId, levelOf(view, arg).id, levelInput(submitted(interaction)));
        return show(interaction, `level:${arg}`);
      case "lvl-roles":
        if (!interaction.isRoleSelectMenu()) throw new Error("Menu de rôles attendu.");
        await setLevelRoles(guildId, levelOf(view, arg).id, interaction.values);
        return show(interaction, `level:${arg}`);
      case "lvl-del":
        await deleteLevel(guildId, levelOf(view, arg).id);
        return show(interaction, "levels");

      // Commandes
      case "cmd-level": {
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
        return show(interaction, `command:${command.name}`);
      }

      // Profil
      case "prof-status":
        await updateConfig(guildId, { presence_status: selected(interaction) });
        applyPresence(interaction.client, (await getSettings(guildId)).config);
        return show(interaction, "profile");
      case "prof-activity": {
        const type = selected(interaction);
        return openModal(
          modal(id(view, "prof-activity-save", type), ACTIVITIES[type]?.label ?? "Activité", [
            { id: "text", label: "Texte (vide pour retirer l'activité)", value: settings.config.activity_text, maxLength: 128 },
          ]),
        );
      }
      case "prof-activity-save":
        if (!ACTIVITIES[arg]) throw new UserError("Type d'activité inconnu.");
        await updateConfig(guildId, { activity_type: arg, activity_text: field(submitted(interaction), "text") });
        applyPresence(interaction.client, (await getSettings(guildId)).config);
        return show(interaction, "profile");
      case "prof-identity":
        return openModal(
          modal(id(view, "prof-identity-save"), "Pseudo et bio du bot", [
            { id: "nick", label: "Pseudo (vide = nom de l'application)", value: settings.config.nickname, maxLength: 32 },
            { id: "bio", label: "Bio sur le serveur", value: settings.config.bio, long: true, maxLength: 190 },
          ]),
        );
      case "prof-identity-save": {
        const form = submitted(interaction);
        const nick = field(form, "nick");
        const bio = field(form, "bio");
        await form.deferUpdate();
        await applyMemberProfile(interaction.guild, { nick, bio });
        await updateConfig(guildId, { nickname: nick, bio });
        return show(interaction, "profile");
      }
      case "prof-images":
        return openModal(
          modal(id(view, "prof-images-save"), "Avatar et bannière du bot", [
            { id: "avatar", label: "Adresse de l'avatar (vide = par défaut)", value: settings.config.avatar_url, maxLength: 500 },
            { id: "banner", label: "Adresse de la bannière (vide = aucune)", value: settings.config.banner_url, maxLength: 500 },
          ]),
        );
      case "prof-images-save": {
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
        return show(interaction, "profile");
      }

      // Messages
      case "msg-edit": {
        const definition = findMessage(arg);
        return openModal(
          modal(id(view, "msg-edit-save", definition.key), definition.label, [
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
      case "msg-edit-save": {
        const definition = findMessage(arg);
        await setMessage(guildId, definition.key, field(submitted(interaction), "content") ?? definition.defaultContent);
        return show(interaction, `message:${definition.key}`);
      }
      case "msg-reset": {
        const definition = findMessage(arg);
        await resetMessage(guildId, definition.key);
        return show(interaction, `message:${definition.key}`);
      }
    }
    throw new Error(`Action de panneau inconnue : ${action}`);
  },
};
