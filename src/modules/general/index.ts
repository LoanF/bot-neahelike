import type { BotModule } from "@/core/registry";
import { aide } from "./aide";
import { ping } from "./ping";

export const general: BotModule = {
  id: "general",
  label: "Général",
  icon: "📖",
  description: "Aide, latence et messages communs à tous les modules.",
  locked: true,
  commands: [aide, ping],
  messages: [
    {
      key: "permission.refusee",
      module: "general",
      label: "Commande refusée (accès insuffisant)",
      defaultContent: "Tu n'as pas accès à cette commande. Elle est réservée à : **{acces}**.",
      variables: { "{acces}": "qui peut utiliser la commande" },
    },
    {
      key: "module.desactive",
      module: "general",
      label: "Module désactivé",
      defaultContent: "Le module **{module}** est désactivé sur ce serveur.",
      variables: { "{module}": "nom du module" },
    },
    {
      key: "erreur.inattendue",
      module: "general",
      label: "Erreur inattendue",
      defaultContent: "Une erreur inattendue est survenue. Réessaie dans un instant.",
    },
  ],
};
