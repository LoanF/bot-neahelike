import { PermissionFlagsBits, type GuildBasedChannel, type GuildMember, type Role, type User } from "discord.js";
import type { GuildSettings } from "@/config/store";
import type { CommandContext } from "./context";

/**
 * Permission Discord demandée par défaut. C'est aussi elle qui rend la commande slash visible :
 * sans cette permission, la commande n'apparaît pas dans la liste « / ».
 */
export const PERMISSION = {
  tous: null,
  gestion: PermissionFlagsBits.ManageGuild,
  messages: PermissionFlagsBits.ManageMessages,
  moderation: PermissionFlagsBits.ModerateMembers,
  expulsion: PermissionFlagsBits.KickMembers,
  bannissement: PermissionFlagsBits.BanMembers,
  salons: PermissionFlagsBits.ManageChannels,
} as const;

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
  /** Permission Discord requise tant qu'aucun accès n'est réglé depuis Discord (null : tout le monde). */
  defaultPermission: bigint | null;
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
