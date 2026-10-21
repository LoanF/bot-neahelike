import type { BotModule } from "@/core/registry";
import { candidature, site } from "./commands";
import { resync, setupMemberSync } from "./events";
import { MODULE } from "./settings";

export const siteModule: BotModule = {
  id: MODULE,
  label: "Lien avec le site",
  icon: "🏛️",
  description: "Rangs du site synchronisés avec les rôles Discord, candidature, logs staff.",
  commands: [candidature, site],
  setup: setupMemberSync,
  onReady: async guild => {
    await resync(guild);
  },
  messages: [
    {
      key: "candidature.lien",
      module: MODULE,
      label: "Lien vers le portail",
      defaultContent: "Les portes de l'Agora sont ouvertes. Lie ton compte Discord et dépose ta candidature sur le portail : {lien}",
      variables: { "{lien}": "adresse du portail" },
    },
    {
      key: "candidature.statut.sans-compte",
      module: MODULE,
      label: "Statut : aucun compte sur le portail",
      defaultContent: "Tu ne t'es pas encore présenté à l'Agora. Connecte-toi au portail pour lier ton compte : {lien}",
      variables: { "{lien}": "adresse du portail" },
    },
    {
      key: "candidature.statut.cgu",
      module: MODULE,
      label: "Statut : conditions à accepter",
      defaultContent: "Ton compte est lié, mais il te reste à accepter les conditions d'utilisation sur le portail : {lien}",
      variables: { "{lien}": "adresse du portail" },
    },
    {
      key: "candidature.statut.compte-lie",
      module: MODULE,
      label: "Statut : compte lié, candidature à déposer",
      defaultContent: "Ton compte est lié au portail. Rends-toi sur ton tableau de bord pour rédiger ou suivre ta candidature : {lien}",
      variables: { "{lien}": "adresse du portail" },
    },
    {
      key: "candidature.statut.attente-vocal",
      module: MODULE,
      label: "Statut : candidature validée, attente du vocal",
      defaultContent: "Ta candidature a été validée. Il te reste l'entretien vocal : les salons de whitelist te sont ouverts.",
    },
    {
      key: "candidature.statut.whiteliste",
      module: MODULE,
      label: "Statut : whitelisté",
      defaultContent: "Tu es citoyen de Néa Hélikè : ta whitelist est validée. Bon vent.",
    },
  ],
};
