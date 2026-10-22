import type { BotModule } from "@/core/registry";
import { candidature, fiche, site } from "./commands";
import { resync, setupMemberSync } from "./events";
import { startJournalRelay } from "./journal";
import { MODULE } from "./settings";

export const siteModule: BotModule = {
  id: MODULE,
  label: "Lien avec le site",
  icon: "🏛️",
  description: "Présence des comptes du site, statut de candidature, fiche staff et décisions du site dans les logs staff.",
  commands: [candidature, fiche, site],
  setup: setupMemberSync,
  onReady: async guild => {
    // Le relais démarre d'abord : un échec de la resynchronisation ne doit pas le priver de logs.
    startJournalRelay(guild);
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
      defaultContent: "Ton compte est lié au portail. Rends-toi sur ton tableau de bord pour rédiger ta candidature : {lien}",
      variables: { "{lien}": "adresse du portail" },
    },
    {
      key: "candidature.statut.brouillon",
      module: MODULE,
      label: "Statut : candidature en cours de rédaction",
      defaultContent: "Ta candidature est en cours de rédaction. Termine-la et envoie-la depuis le portail : {lien}",
      variables: { "{lien}": "adresse du portail" },
    },
    {
      key: "candidature.statut.envoyee",
      module: MODULE,
      label: "Statut : candidature envoyée",
      defaultContent: "Ta candidature a été envoyée le {envoi}. Les recruteurs la liront bientôt : tu seras prévenu en message privé.",
      variables: { "{envoi}": "date d'envoi", "{lien}": "adresse du portail" },
    },
    {
      key: "candidature.statut.a-modifier",
      module: MODULE,
      label: "Statut : modification demandée",
      defaultContent: "Les recruteurs te demandent de reprendre ta candidature.\n**Étapes à revoir :** {etapes}\n**Commentaire :** {commentaire}\n\nCorrige-la puis renvoie-la depuis le portail : {lien}",
      variables: { "{etapes}": "étapes à revoir", "{commentaire}": "commentaire des recruteurs", "{lien}": "adresse du portail" },
    },
    {
      key: "candidature.statut.refusee",
      module: MODULE,
      label: "Statut : candidature refusée",
      defaultContent: "Ta candidature n'a pas été retenue.\n{criteres}\n**Commentaire :** {commentaire}\n\nTu pourras en déposer une nouvelle à partir du {date}.",
      variables: { "{criteres}": "motifs du refus", "{commentaire}": "commentaire des recruteurs", "{date}": "date de la prochaine candidature possible" },
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
