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
 */
export function statusKey(account: Account | undefined, application: Application | undefined, roles: Iterable<string>, now = new Date()): string {
  if (!account) return "candidature.statut.sans-compte";
  if (!account.cgu_accepted_at) return "candidature.statut.cgu";
  const { DISCORD_ROLE_ATTENTE_WL, DISCORD_ROLE_WL } = env();
  const journey = journeyFromRoles(roles, { aspirant: DISCORD_ROLE_ATTENTE_WL, helikeen: DISCORD_ROLE_WL });
  if (journey === "whiteliste") return "candidature.statut.whiteliste";
  if (application) {
    if (application.status === "refusee") {
      const until = reapplyDate(application);
      // Délai écoulé : le joueur peut déposer une nouvelle candidature.
      if (until && until <= now) return "candidature.statut.compte-lie";
    }
    return STATUS_KEYS[application.status];
  }
  if (journey === "attente-vocal") return "candidature.statut.attente-vocal";
  return "candidature.statut.compte-lie";
}

const discordDate = (date: Date) => `<t:${Math.floor(date.getTime() / 1000)}:D>`;

/** Variables des messages de statut, tirées de la candidature. */
export function statusVars(application: Application | undefined, link: string): Record<string, string> {
  const until = application ? reapplyDate(application) : null;
  const comment = application?.status === "refusee" ? application.refusal_comment : application?.changes_comment;
  return {
    lien: link,
    etapes: labelList(STEP_LABELS, application?.changes_steps).join(", ") || "—",
    criteres: labelList(CRITERION_LABELS, application?.refusal_criteria).map(item => `• ${item}`).join("\n") || "—",
    commentaire: comment?.trim() || "Aucun commentaire.",
    envoi: application?.submitted_at ? discordDate(new Date(application.submitted_at)) : "—",
    date: until ? discordDate(until) : "—",
  };
}
