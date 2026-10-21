import { ButtonStyle, MessageFlags, type GuildMember } from "discord.js";
import { getSettings, type GuildSettings } from "@/config/store";
import { canUse, isModuleEnabled, requiredLabel } from "@/core/access";
import { defineCommand, PERMISSION, usage, type CommandDef } from "@/core/command";
import { customId, type ComponentHandler } from "@/core/components";
import type { Payload } from "@/core/context";
import { embed } from "@/core/embeds";
import { UserError } from "@/core/errors";
import { button, choice, ICON, row } from "@/core/panels";
import { getRegistry, type BotModule } from "@/core/registry";

const PREFIX = "aide";

interface View {
  settings: GuildSettings;
  member: GuildMember;
}

/** Modules actifs qui ont au moins une commande utilisable par le membre, avec ces commandes. */
function visibleModules(view: View): { module: BotModule; commands: CommandDef[] }[] {
  return getRegistry()
    .modules.filter(module => isModuleEnabled(view.settings, module.id))
    .map(module => ({ module, commands: (module.commands ?? []).filter(command => canUse(view.settings, view.member, command)) }))
    .filter(item => item.commands.length > 0);
}

/** Exemples d'utilisation : en slash, et avec le préfixe. */
function examples(command: CommandDef, prefix: string): string {
  const lines = command.subcommands
    ? command.subcommands.map(sub => `\`${usage(command, "/", sub)}\` — ${sub.description}`)
    : [`\`${usage(command, "/")}\``];
  return `${lines.join("\n")}\n-# Aussi avec le préfixe : \`${usage(command, prefix)}\``;
}

function id(view: View, action: string, ...args: string[]) {
  return customId(PREFIX, view.member.id, action, ...args);
}

function home(view: View): Payload {
  const prefix = view.settings.config.prefix;
  const modules = visibleModules(view);
  const lines = modules.map(({ module, commands }) => `${module.icon} **${module.label}** — ${module.description}\n-# ${commands.map(command => `/${command.name}`).join(" · ")}`);

  return {
    embeds: [
      embed(view.settings)
        .setTitle(`📖 Aide · ${view.member.guild.name}`)
        .setDescription(
          `Choisis un module dans le menu pour voir ses commandes et des exemples.\n\n${lines.join("\n\n")}\n\n` +
            `-# Toutes les commandes s'utilisent avec \`/\` ou avec le préfixe \`${prefix}\` (par exemple \`${prefix}aide\`). Seules les commandes que tu peux utiliser sont affichées.`,
        ),
    ],
    components: modules.length
      ? [
          row(
            choice(
              id(view, "module"),
              modules.map(({ module, commands }) => ({ label: module.label, value: module.id, emoji: module.icon, description: `${commands.length} commande(s)` })),
            ),
          ),
        ]
      : [],
  };
}

function modulePage(view: View, moduleId: string): Payload {
  const modules = visibleModules(view);
  const entry = modules.find(item => item.module.id === moduleId);
  if (!entry) throw new UserError("Ce module n'a aucune commande que tu peux utiliser.");
  const prefix = view.settings.config.prefix;
  const result = embed(view.settings).setTitle(`${entry.module.icon} ${entry.module.label}`).setDescription(entry.module.description);
  for (const command of entry.commands.slice(0, 25)) {
    result.addFields({
      name: `/${command.name}`,
      value: `${command.description}\n${examples(command, prefix)}\n-# Qui peut l'utiliser : ${requiredLabel(view.settings, command)}`.slice(0, 1024),
    });
  }
  return {
    embeds: [result],
    components: [
      row(choice(id(view, "module"), modules.map(({ module }) => ({ label: module.label, value: module.id, emoji: module.icon, default: module.id === moduleId })))),
      row(button(id(view, "accueil"), "Tous les modules", { emoji: ICON.retour, style: ButtonStyle.Secondary })),
    ],
  };
}

function commandPage(view: View, command: CommandDef): Payload {
  const module = getRegistry().module(command.module);
  const result = embed(view.settings)
    .setTitle(`/${command.name}`)
    .setDescription(command.description)
    .addFields(
      { name: "Utilisation", value: examples(command, view.settings.config.prefix).slice(0, 1024) },
      { name: "Qui peut l'utiliser", value: requiredLabel(view.settings, command), inline: true },
      { name: "Module", value: module ? `${module.icon} ${module.label}` : command.module, inline: true },
    );
  if (command.aliases?.length) {
    result.addFields({ name: "Autres noms (préfixe)", value: command.aliases.map(alias => `\`${view.settings.config.prefix}${alias}\``).join(", "), inline: true });
  }
  return { embeds: [result], components: [row(button(id(view, "accueil"), "Tous les modules", { emoji: ICON.retour, style: ButtonStyle.Secondary }))] };
}

export function renderHelp(view: View, target: { module?: string; command?: CommandDef } = {}): Payload {
  if (target.command) return commandPage(view, target.command);
  if (target.module) return modulePage(view, target.module);
  return home(view);
}

export const aide = defineCommand({
  name: "aide",
  description: "Les commandes que tu peux utiliser, module par module, avec des exemples.",
  module: "general",
  aliases: ["help"],
  defaultPermission: PERMISSION.tous,
  options: [
    {
      name: "commande",
      description: "Commande à détailler",
      type: "string",
      autocomplete: ({ settings, member }) =>
        getRegistry()
          .allCommands()
          .filter(command => canUse(settings, member, command))
          .map(command => ({ name: `/${command.name}`, value: command.name })),
    },
  ],
  async run(ctx) {
    const view = { settings: ctx.settings, member: ctx.member };
    const wanted = ctx.string("commande");
    if (!wanted) {
      await ctx.reply(renderHelp(view), { private: true });
      return;
    }
    const command = getRegistry().find(wanted.replace(/^[/+]/, ""));
    if (!command || !canUse(ctx.settings, ctx.member, command)) throw new UserError(`Aucune commande que tu peux utiliser ne s'appelle « ${wanted} ».`);
    await ctx.reply(renderHelp(view, { command }), { private: true });
  },
});

export const aidePanel: ComponentHandler = {
  prefix: PREFIX,
  async handle(interaction, { action }) {
    const view = { settings: await getSettings(interaction.guildId), member: interaction.member };
    const payload = action === "module" && interaction.isStringSelectMenu() ? renderHelp(view, { module: interaction.values[0] }) : renderHelp(view);
    if (interaction.isModalSubmit()) return interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
    return interaction.update(payload);
  },
};
