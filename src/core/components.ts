import type { ButtonInteraction, MessageComponentInteraction, ModalSubmitInteraction } from "discord.js";
import type { GuildSettings } from "@/config/store";

export type PanelInteraction = MessageComponentInteraction<"cached"> | ModalSubmitInteraction<"cached">;

/** Tout le monde peut se servir du composant (ex. bouton d'ouverture de ticket). */
export const ANYONE = "*";

/**
 * Gestionnaire de boutons, menus et formulaires.
 * Identifiant : `préfixe:propriétaire:action:arguments…` ; le propriétaire est l'auteur du panneau ou `*`.
 */
export interface ComponentHandler {
  prefix: string;
  /** Commande dont la permission est revérifiée à chaque clic. */
  command?: string;
  handle: (interaction: PanelInteraction, context: { settings: GuildSettings; action: string; args: string[] }) => Promise<unknown>;
  /** Boutons cliqués en message privé (par exemple la note d'un ticket), avec la configuration du serveur. */
  handleDm?: (interaction: ButtonInteraction, context: { settings: GuildSettings; action: string; args: string[] }) => Promise<unknown>;
}

const MAX_CUSTOM_ID = 100;

export function customId(prefix: string, ownerId: string, action: string, ...args: string[]): string {
  // Un « : » décalerait les champs au découpage, propriétaire compris (contrôle de qui peut cliquer).
  if ([prefix, ownerId, action].some(part => part.includes(":"))) throw new Error(`Champ d'identifiant de composant invalide : ${prefix}:${ownerId}:${action}`);
  const id = [prefix, ownerId, action, ...args].join(":");
  if (id.length > MAX_CUSTOM_ID) throw new Error(`Identifiant de composant trop long (${id.length}) : ${id}`);
  return id;
}

export function parseCustomId(id: string) {
  const [prefix = "", ownerId = "", action = "", ...args] = id.split(":");
  return { prefix, ownerId, action, args };
}
