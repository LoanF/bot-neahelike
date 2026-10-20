import type { GuildSettings } from "@/config/store";
import { renderTemplate, type TemplateVars } from "./templates";

/** Message dont le texte est modifiable depuis Discord ; le texte par défaut reste dans le code. */
export interface MessageDef {
  key: string;
  module: string;
  label: string;
  defaultContent: string;
  /** Variables propres à ce message, en plus des variables communes. */
  variables?: Record<string, string>;
}

const definitions = new Map<string, MessageDef>();

export function registerMessages(messages: MessageDef[]) {
  for (const message of messages) {
    if (definitions.has(message.key)) throw new Error(`Message « ${message.key} » défini deux fois.`);
    definitions.set(message.key, message);
  }
}

export function messageDefs(): MessageDef[] {
  return [...definitions.values()];
}

export function messageDef(key: string): MessageDef | undefined {
  return definitions.get(key);
}

/** Texte personnalisé du serveur, ou texte par défaut, avec les variables remplacées. */
export function renderMessage(settings: GuildSettings, key: string, vars: TemplateVars = {}): string {
  const definition = definitions.get(key);
  if (!definition) throw new Error(`Message inconnu : ${key}`);
  return renderTemplate(settings.messages.get(key) ?? definition.defaultContent, vars);
}
