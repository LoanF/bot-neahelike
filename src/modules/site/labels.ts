/**
 * Libellés de la candidature, en miroir du site (lib/application.ts, content/staff.ts, content/candidature.ts).
 * Une valeur inconnue s'affiche telle quelle : un ajout côté site ne casse rien ici.
 */

export const STEP_LABELS: Record<string, string> = {
  hrp: "HRP",
  rp: "Personnage",
  background: "Background",
  dossier: "Dossier",
  recapitulatif: "Récapitulatif",
};

export const CRITERION_LABELS: Record<string, string> = {
  background: "Background trop court ou peu travaillé",
  coherence: "Personnage incohérent",
  lore: "Non-respect du lore",
  redaction: "Orthographe et rédaction",
  experience: "Expérience RP insuffisante",
  hrp: "Informations HRP incomplètes ou incohérentes",
  document: "Document inaccessible",
  dossier: "Dossier de reprise insuffisant",
  entretien: "Entretien vocal non concluant",
  autre: "Autre (voir le commentaire)",
};

export const AFFINITY_LABELS: Record<string, string> = {
  fendeciels: "Fendeciels",
  abyssiens: "Abyssiens",
  toxotes: "Toxotes",
  ardents: "Ardents",
  guerriers: "Guerriers",
};

export const CREATURE_LABELS: Record<string, string> = {
  minotaures: "Minotaures",
  colosses: "Colosses",
  centaures: "Centaures",
  sirenes: "Sirènes",
  satyres: "Satyres",
};

export const DOSSIER_KIND_LABELS: Record<string, string> = {
  entreprise: "Une entreprise",
  affinite: "Le lead d'une affinité",
  creature: "Le lead d'une créature",
};

export const STATUS_LABELS: Record<string, string> = {
  brouillon: "Brouillon",
  envoyee: "Envoyée, en attente de lecture",
  a_modifier: "Modification demandée",
  entretien: "Validée, entretien vocal à passer",
  whitelistee: "Whitelistée",
  refusee: "Refusée",
};

/** Délai avant de pouvoir candidater de nouveau après un refus (REAPPLY_DELAY_MONTHS du site). */
export const REAPPLY_MONTHS = 3;

export function label(labels: Record<string, string>, value: unknown): string {
  return labels[String(value)] ?? String(value);
}

export function labelList(labels: Record<string, string>, values: unknown): string[] {
  return Array.isArray(values) ? values.map(value => label(labels, value)) : [];
}
