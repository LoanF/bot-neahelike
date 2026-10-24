import { sql, type Tables } from "@/db";
import { env } from "@/env";
import { CRITERION_LABELS, labelList, REAPPLY_MONTHS, STEP_LABELS } from "./labels";
import { journeyFromRoles } from "./ranks";

export type Account = Pick<Tables<"users">, "cgu_accepted_at" | "rank">;
export type Application = Tables<"applications">;

/** Dernière candidature du joueur, comme sur son tableau de bord (une seule peut être ouverte à la fois). */
export async function latestApplication(userId: string): Promise<Application | undefined> {
  const [application] = await sql()<Application[]>`
    select * from applications where user_id = ${userId} order by created_at desc limit 1
  `;
  return application;
}

/** Date à partir de laquelle un joueur refusé peut candidater de nouveau (même calcul que le site). */
export function reapplyDate(application: Pick<Application, "decided_at">): Date | null {
  if (!application.decided_at) return null;
  const date = new Date(application.decided_at);
  date.setMonth(date.getMonth() + REAPPLY_MONTHS);
  return date;
}

const STATUS_KEYS: Record<Application["status"], string> = {
  brouillon: "candidature.statut.brouillon",
  envoyee: "candidature.statut.envoyee",
  a_modifier: "candidature.statut.a-modifier",
  entretien: "candidature.statut.attente-vocal",
  whitelistee: "candidature.statut.whiteliste",
  refusee: "candidature.statut.refusee",
};

/**
 * Clé du message de statut. La candidature fait foi ; les rôles du parcours servent quand il n'y en a pas
 * (joueur whitelisté avant le portail) et le rôle de citoyen l'emporte toujours.
 * `lockUntil` : délai de recandidature gardé par le site après la suppression d'un ancien compte (`reapply_locks`).
 */
export function statusKey(account: Account | undefined, application: Application | undefined, roles: Iterable<string>, now = new Date(), lockUntil: Date | null = null): string {
  if (!account) return "candidature.statut.sans-compte";
  if (!account.cgu_accepted_at) return "candidature.statut.cgu";
  const { DISCORD_ROLE_ATTENTE_WL, DISCORD_ROLE_WL } = env();
  const journey = journeyFromRoles(roles, { aspirant: DISCORD_ROLE_ATTENTE_WL, helikeen: DISCORD_ROLE_WL });
  if (journey === "whiteliste") return "candidature.statut.whiteliste";
  // Comme sur le portail : une whitelist retirée, un refus dont le délai est écoulé ou levé par un admin ne comptent plus.
  if (application && !blocksNewApplication(application, now)) application = undefined;
  if (application) return STATUS_KEYS[application.status];
  if (journey === "attente-vocal") return "candidature.statut.attente-vocal";
  if (lockUntil && lockUntil > now) return "candidature.statut.delai";
  return "candidature.statut.compte-lie";
}

/** La candidature est-elle encore « en cours » pour le joueur, ou peut-il en déposer une nouvelle ? */
function blocksNewApplication(application: Application, now: Date): boolean {
  if (application.status === "whitelistee") return !application.whitelist_revoked_at;
  if (application.status === "refusee") {
    if (application.reapply_lifted_at) return false;
    const until = reapplyDate(application);
    return !until || until > now;
  }
  return true;
}

/** Délai de recandidature gardé par le site après la suppression d'un ancien compte, s'il court encore. */
export async function reapplyLock(userId: string): Promise<Date | null> {
  const [lock] = await sql()<{ until: string }[]>`select until from reapply_locks where discord_id = ${userId} and until > now()`;
  return lock ? new Date(lock.until) : null;
}

const discordDate = (date: Date) => `<t:${Math.floor(date.getTime() / 1000)}:D>`;

/** Créneau de la prochaine session de whitelist, choisi par le recruteur à la validation écrite (heure locale de chacun dans Discord). */
export function sessionText(application: Pick<Application, "interview_slot_start" | "interview_slot_end"> | undefined, now = new Date()): string {
  const start = application?.interview_slot_start ? new Date(application.interview_slot_start) : null;
  const end = application?.interview_slot_end ? new Date(application.interview_slot_end) : null;
  if (!start || !end || end <= now) return "elle sera annoncée par l'équipe sur le Discord";
  const unix = (date: Date) => Math.floor(date.getTime() / 1000);
  return `<t:${unix(start)}:F> → <t:${unix(end)}:t> (<t:${unix(start)}:R>)`;
}

/** Variables des messages de statut, tirées de la candidature. */
export function statusVars(application: Application | undefined, link: string, lockUntil: Date | null = null, now = new Date()): Record<string, string> {
  const until = (application?.status === "refusee" && reapplyDate(application)) || lockUntil;
  const comment = application?.status === "refusee" ? application.refusal_comment : application?.changes_comment;
  return {
    lien: link,
    etapes: labelList(STEP_LABELS, application?.changes_steps).join(", ") || "—",
    criteres: labelList(CRITERION_LABELS, application?.refusal_criteria).map(item => `• ${item}`).join("\n") || "—",
    commentaire: comment?.trim() || "Aucun commentaire.",
    envoi: application?.submitted_at ? discordDate(new Date(application.submitted_at)) : "—",
    date: until ? discordDate(until) : "—",
    session: sessionText(application, now),
  };
}
