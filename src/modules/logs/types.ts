/** Types de logs : chacun peut partir dans son propre salon, ou plusieurs dans le même. */
export const LOG_CATEGORIES = {
  messages: { label: "Messages", emoji: "💬" },
  membres: { label: "Membres", emoji: "👥" },
  moderation: { label: "Modération", emoji: "⚖️" },
  vocal: { label: "Vocal", emoji: "🔊" },
  serveur: { label: "Serveur", emoji: "🏛️" },
  tickets: { label: "Tickets", emoji: "🎫" },
} as const;

export type LogCategory = keyof typeof LOG_CATEGORIES;

export interface LogType {
  id: string;
  label: string;
  emoji: string;
  category: LogCategory;
  description: string;
}

export const LOG_TYPES = [
  { id: "message-supprime", label: "Messages supprimés", emoji: "🗑️", category: "messages", description: "Contenu, auteur et salon d'un message supprimé" },
  { id: "message-modifie", label: "Messages modifiés", emoji: "✏️", category: "messages", description: "Texte avant et après la modification" },
  { id: "messages-purges", label: "Suppressions en masse", emoji: "🧹", category: "messages", description: "Messages effacés d'un coup, avec leur copie en fichier" },
  { id: "arrivee", label: "Arrivées", emoji: "📥", category: "membres", description: "Nouveaux membres et âge de leur compte" },
  { id: "depart", label: "Départs", emoji: "📤", category: "membres", description: "Membres partis et rôles qu'ils avaient" },
  { id: "pseudo", label: "Pseudos", emoji: "🏷️", category: "membres", description: "Changements de pseudo sur le serveur" },
  { id: "roles-membre", label: "Rôles des membres", emoji: "🎭", category: "membres", description: "Rôles ajoutés ou retirés à un membre" },
  { id: "boost", label: "Boosts", emoji: "💎", category: "membres", description: "Nouveaux boosts du serveur" },
  { id: "bannissement", label: "Bannissements", emoji: "🔨", category: "moderation", description: "Bannissements et débannissements, avec l'auteur et la raison" },
  { id: "expulsion", label: "Expulsions", emoji: "👢", category: "moderation", description: "Membres expulsés, avec l'auteur et la raison" },
  { id: "avertissement", label: "Avertissements", emoji: "⚠️", category: "moderation", description: "Avertissements donnés ou retirés avec le bot" },
  { id: "exclusion", label: "Exclusions temporaires", emoji: "⏳", category: "moderation", description: "Exclusions temporaires posées ou levées" },
  { id: "vocal", label: "Salons vocaux", emoji: "🔊", category: "vocal", description: "Entrées, sorties et changements de salon vocal" },
  { id: "salons", label: "Salons", emoji: "#️⃣", category: "serveur", description: "Salons créés, modifiés ou supprimés" },
  { id: "roles", label: "Rôles du serveur", emoji: "🛡️", category: "serveur", description: "Rôles créés, modifiés ou supprimés" },
  { id: "invitations", label: "Invitations", emoji: "✉️", category: "serveur", description: "Invitations créées ou supprimées" },
  { id: "fils", label: "Fils de discussion", emoji: "🧵", category: "serveur", description: "Fils créés ou supprimés" },
  { id: "tickets", label: "Tickets", emoji: "🎫", category: "tickets", description: "Ouvertures, prises en charge, fermetures et réouvertures" },
] as const satisfies readonly LogType[];

export type LogTypeId = (typeof LOG_TYPES)[number]["id"];

export function logType(id: string): LogType | undefined {
  return LOG_TYPES.find(type => type.id === id);
}
