import type { CommandDef } from "@/core/command";
import { UserError } from "@/core/errors";
import { messageDef, type MessageDef } from "@/core/messages";
import { getRegistry, type BotModule } from "@/core/registry";

/** Valeurs spéciales acceptées à la place d'un niveau. */
export const EVERYONE_VALUE = "tous";
export const DEFAULT_VALUE = "defaut";

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

/** Préfixe de 1 à 5 caractères, sans espace. */
export function checkPrefix(input: string): string {
  const prefix = input.trim();
  if (prefix.length < 1 || prefix.length > 5 || /\s/.test(prefix)) throw new UserError("Le préfixe doit faire de 1 à 5 caractères, sans espace.");
  return prefix;
}
