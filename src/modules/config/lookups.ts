import type { GuildSettings } from "@/config/store";
import type { Choice, CommandDef } from "@/core/command";
import { UserError } from "@/core/errors";
import { messageDef, messageDefs, type MessageDef } from "@/core/messages";
import { ladder, type PermissionLevel } from "@/core/permissions";
import { getRegistry, type BotModule } from "@/core/registry";

/** Valeurs spéciales acceptées à la place d'un niveau. */
export const EVERYONE_VALUE = "tous";
export const DEFAULT_VALUE = "defaut";

export function findLevel(settings: GuildSettings, name: string): PermissionLevel {
  const key = name.trim().toLowerCase();
  const level = settings.levels.find(candidate => candidate.name.toLowerCase() === key || candidate.id === key);
  if (!level) throw new UserError(`Accès inconnu : « ${name} ». Accès existants : ${settings.levels.map(item => item.name).join(", ") || "aucun"}.`);
  return level;
}

export function findModule(id: string): BotModule {
  const module = getRegistry().modules.find(candidate => candidate.id === id.toLowerCase() || candidate.label.toLowerCase() === id.toLowerCase());
  if (!module) throw new UserError(`Module inconnu : « ${id} ».`);
  return module;
}

export function findCommand(name: string): CommandDef {
  const command = getRegistry().find(name.replace(/^[/+]/, ""));
  if (!command) throw new UserError(`Commande inconnue : « ${name} ».`);
  return command;
}

export function findMessage(key: string): MessageDef {
  const definition = messageDef(key.toLowerCase());
  if (!definition) throw new UserError(`Message inconnu : « ${key} ».`);
  return definition;
}

export const levelChoices = ({ settings }: { settings: GuildSettings }): Choice[] =>
  ladder(settings.levels).map(level => ({ name: level.name, value: level.name }));

export const moduleChoices = (): Choice[] => getRegistry().modules.map(module => ({ name: module.label, value: module.id }));

export const commandChoices = (): Choice[] => getRegistry().allCommands().map(command => ({ name: command.name, value: command.name }));

export const messageChoices = (): Choice[] => messageDefs().map(message => ({ name: `${message.key} — ${message.label}`.slice(0, 100), value: message.key }));

/** Préfixe de 1 à 5 caractères, sans espace. */
export function checkPrefix(input: string): string {
  const prefix = input.trim();
  if (prefix.length < 1 || prefix.length > 5 || /\s/.test(prefix)) throw new UserError("Le préfixe doit faire de 1 à 5 caractères, sans espace.");
  return prefix;
}
