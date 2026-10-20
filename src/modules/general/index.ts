import type { BotModule } from "@/core/registry";
import { aide } from "./aide";
import { ping } from "./ping";

export const general: BotModule = {
  id: "general",
  label: "Général",
  description: "Aide, latence et messages communs à tous les modules.",
  locked: true,
  commands: [aide, ping],
  messages: [
    {
      key: "permission.refusee",
      module: "general",
      label: "Commande refusée (rang insuffisant)",
      defaultContent: "Cette commande est réservée au rang **{niveau}**.",
      variables: { "{niveau}": "niveau requis" },
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
      defaultContent: "Une erreur inattendue est survenue. Réessayez dans un instant.",
    },
  ],
};
