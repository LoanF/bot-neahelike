import type { GuildBasedChannel, GuildMember, Role, User } from "discord.js";
import type { GuildSettings } from "@/config/store";
import type { CommandContext } from "./context";

/** Poids par défaut, alignés sur les niveaux créés au premier démarrage (Joueur 10, Staff 50, Admin 100). */
export const LEVEL = { tous: 0, joueur: 10, staff: 50, admin: 100 } as const;

export type OptionType = "string" | "integer" | "boolean" | "user" | "role" | "channel";

export interface Choice {
  name: string;
  value: string;
}

export interface AutocompleteInput {
  settings: GuildSettings;
  member: GuildMember;
  query: string;
}

export interface OptionDef {
  /** Minuscules, sans espace : sert de nom d'option slash. */
  name: string;
  description: string;
  type: OptionType;
  required?: boolean;
  choices?: Choice[];
  autocomplete?: (input: AutocompleteInput) => Choice[] | Promise<Choice[]>;
  /** En préfixe : l'option prend tout le reste de la ligne (texte libre, retours à la ligne compris). */
  rest?: boolean;
  minValue?: number;
  maxValue?: number;
  maxLength?: number;
}

export interface SubcommandDef {
  name: string;
  description: string;
  options?: OptionDef[];
}

/** Une définition unique, servie à la fois en commande slash et en commande préfixe. */
export interface CommandDef {
  name: string;
  description: string;
  module: string;
  /** Noms supplémentaires, en préfixe uniquement. */
  aliases?: string[];
  /** Poids requis tant que rien n'est configuré depuis Discord. */
  defaultWeight: number;
  /** Commande de configuration : ne peut jamais être ouverte à tout le monde. */
  protected?: boolean;
  options?: OptionDef[];
  subcommands?: SubcommandDef[];
  run: (ctx: CommandContext) => Promise<void>;
}

export type ArgValue = string | number | boolean | User | Role | GuildBasedChannel;

export function defineCommand(command: CommandDef): CommandDef {
  return command;
}

/** `+niveau creer <nom> <poids> [description]` */
export function usage(command: CommandDef, prefix: string, subcommand?: SubcommandDef): string {
  const options = subcommand?.options ?? command.options ?? [];
  const parts = [`${prefix}${command.name}`, subcommand?.name, ...options.map(option => (option.required ? `<${option.name}>` : `[${option.name}]`))];
  return parts.filter(Boolean).join(" ");
}
