import {
  ApplicationCommandOptionType,
  ApplicationCommandType,
  InteractionContextType,
  type Client,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord.js";
import type { CommandDef, OptionDef, OptionType } from "./command";
import type { ComponentHandler } from "./components";
import { registerMessages, type MessageDef } from "./messages";

export interface BotModule {
  id: string;
  label: string;
  description: string;
  /** Module indispensable : ne peut pas être désactivé. */
  locked?: boolean;
  commands?: CommandDef[];
  components?: ComponentHandler[];
  messages?: MessageDef[];
  /** Branche les écouteurs d'événements du module. */
  setup?: (client: Client) => void;
}

const NAME = /^[\p{Ll}\p{Lo}\p{N}_-]{1,32}$/u;

const OPTION_TYPES: Record<OptionType, ApplicationCommandOptionType> = {
  string: ApplicationCommandOptionType.String,
  integer: ApplicationCommandOptionType.Integer,
  boolean: ApplicationCommandOptionType.Boolean,
  user: ApplicationCommandOptionType.User,
  role: ApplicationCommandOptionType.Role,
  channel: ApplicationCommandOptionType.Channel,
};

function checkOptions(where: string, options: OptionDef[] = []) {
  let optionalSeen = false;
  options.forEach((option, index) => {
    if (!NAME.test(option.name)) throw new Error(`${where} : nom d'option invalide « ${option.name} ».`);
    if (option.required && optionalSeen) throw new Error(`${where} : l'option obligatoire « ${option.name} » suit une option facultative.`);
    if (option.rest && index !== options.length - 1) throw new Error(`${where} : l'option « reste » « ${option.name} » doit être la dernière.`);
    if (!option.required) optionalSeen = true;
  });
}

function optionJson(option: OptionDef) {
  return {
    type: OPTION_TYPES[option.type],
    name: option.name,
    description: option.description.slice(0, 100),
    required: option.required ?? false,
    ...(option.choices && { choices: option.choices }),
    ...(option.autocomplete && { autocomplete: true }),
    ...(option.minValue !== undefined && { min_value: option.minValue }),
    ...(option.maxValue !== undefined && { max_value: option.maxValue }),
    ...(option.maxLength !== undefined && { max_length: option.maxLength }),
  };
}

export class Registry {
  readonly modules: BotModule[];
  private readonly commands = new Map<string, CommandDef>();
  private readonly aliases = new Map<string, CommandDef>();
  private readonly components = new Map<string, ComponentHandler>();

  constructor(modules: BotModule[]) {
    this.modules = modules;
    for (const module of modules) {
      for (const command of module.commands ?? []) this.addCommand(module, command);
      for (const handler of module.components ?? []) {
        if (this.components.has(handler.prefix)) throw new Error(`Préfixe de composant « ${handler.prefix} » utilisé deux fois.`);
        this.components.set(handler.prefix, handler);
      }
      registerMessages(module.messages ?? []);
    }
  }

  private addCommand(module: BotModule, command: CommandDef) {
    if (command.module !== module.id) throw new Error(`La commande « ${command.name} » déclare le module « ${command.module} » mais est rangée dans « ${module.id} ».`);
    if (!NAME.test(command.name)) throw new Error(`Nom de commande invalide « ${command.name} ».`);
    for (const name of [command.name, ...(command.aliases ?? [])]) {
      if (this.commands.has(name) || this.aliases.has(name)) throw new Error(`Nom de commande « ${name} » utilisé deux fois.`);
    }
    checkOptions(command.name, command.options);
    for (const subcommand of command.subcommands ?? []) checkOptions(`${command.name} ${subcommand.name}`, subcommand.options);
    this.commands.set(command.name, command);
    for (const alias of command.aliases ?? []) this.aliases.set(alias, command);
  }

  /** Par nom ou alias (préfixe), sans tenir compte de la casse. */
  find(name: string): CommandDef | undefined {
    const key = name.toLowerCase();
    return this.commands.get(key) ?? this.aliases.get(key);
  }

  allCommands(): CommandDef[] {
    return [...this.commands.values()];
  }

  module(id: string): BotModule | undefined {
    return this.modules.find(module => module.id === id);
  }

  component(prefix: string): ComponentHandler | undefined {
    return this.components.get(prefix);
  }

  slashCommands(): RESTPostAPIChatInputApplicationCommandsJSONBody[] {
    return this.allCommands().map(command => ({
      type: ApplicationCommandType.ChatInput,
      name: command.name,
      description: command.description.slice(0, 100),
      contexts: [InteractionContextType.Guild],
      options: command.subcommands
        ? command.subcommands.map(subcommand => ({
            type: ApplicationCommandOptionType.Subcommand,
            name: subcommand.name,
            description: subcommand.description.slice(0, 100),
            options: (subcommand.options ?? []).map(optionJson),
          }))
        : (command.options ?? []).map(optionJson),
    })) as RESTPostAPIChatInputApplicationCommandsJSONBody[];
  }
}

let current: Registry | undefined;

export function setRegistry(registry: Registry) {
  current = registry;
}

export function getRegistry(): Registry {
  if (!current) throw new Error("Registre des commandes non initialisé.");
  return current;
}
