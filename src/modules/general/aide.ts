import { canUse, isModuleEnabled, requiredLabel } from "@/core/access";
import { defineCommand, LEVEL, usage, type CommandDef } from "@/core/command";
import { embed } from "@/core/embeds";
import { UserError } from "@/core/errors";
import { getRegistry } from "@/core/registry";

/** Coupe une liste de lignes en blocs de 1024 caractères au plus (limite d'un champ d'embed). */
function chunk(lines: string[], size = 1024): string[] {
  const blocks: string[] = [];
  let current = "";
  for (const line of lines) {
    if (current && current.length + line.length + 1 > size) {
      blocks.push(current);
      current = "";
    }
    current = current ? `${current}\n${line}` : line;
  }
  if (current) blocks.push(current);
  return blocks;
}

function usages(command: CommandDef, prefix: string): string[] {
  if (!command.subcommands) return [`\`${usage(command, prefix)}\``];
  return command.subcommands.map(sub => `\`${usage(command, prefix, sub)}\` — ${sub.description}`);
}

export const aide = defineCommand({
  name: "aide",
  description: "Liste les commandes accessibles, ou détaille l'une d'elles.",
  module: "general",
  aliases: ["help"],
  defaultWeight: LEVEL.tous,
  options: [
    {
      name: "commande",
      description: "Commande à détailler",
      type: "string",
      autocomplete: ({ settings, member }) =>
        getRegistry()
          .allCommands()
          .filter(command => canUse(settings, member, command))
          .map(command => ({ name: command.name, value: command.name })),
    },
  ],
  async run(ctx) {
    const { settings, member } = ctx;
    const prefix = settings.config.prefix;
    const registry = getRegistry();
    const wanted = ctx.string("commande");

    if (wanted) {
      const command = registry.find(wanted.replace(/^[/+]/, ""));
      if (!command || !canUse(settings, member, command)) throw new UserError(`Aucune commande accessible ne s'appelle « ${wanted} ».`);
      const result = embed(settings)
        .setTitle(`${prefix}${command.name}`)
        .setDescription(command.description)
        .addFields(
          { name: "Utilisation", value: usages(command, prefix).join("\n").slice(0, 1024) },
          { name: "Rang requis", value: requiredLabel(settings, command), inline: true },
          { name: "Module", value: registry.module(command.module)?.label ?? command.module, inline: true },
        );
      if (command.aliases?.length) result.addFields({ name: "Alias", value: command.aliases.map(alias => `\`${prefix}${alias}\``).join(", "), inline: true });
      await ctx.reply({ embeds: [result] }, { private: true });
      return;
    }

    const result = embed(settings)
      .setTitle(`Commandes de ${ctx.guild.name}`)
      .setDescription(`Préfixe : \`${prefix}\` · toutes les commandes existent aussi en \`/\`.\n\`${prefix}aide <commande>\` pour le détail d'une commande.`);
    for (const module of registry.modules) {
      if (!isModuleEnabled(settings, module.id)) continue;
      const lines = (module.commands ?? []).filter(command => canUse(settings, member, command)).map(command => `\`${command.name}\` — ${command.description}`);
      chunk(lines).forEach((block, index) => result.addFields({ name: index === 0 ? module.label : `${module.label} (suite)`, value: block }));
    }
    await ctx.reply({ embeds: [result] }, { private: true });
  },
});
