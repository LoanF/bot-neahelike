import type { EmbedBuilder } from "discord.js";
import type { GuildSettings } from "@/config/store";
import { embed } from "@/core/embeds";
import { sql, type Tables } from "@/db";
import { env } from "@/env";
import type { Application } from "./applications";
import { AFFINITY_LABELS, CREATURE_LABELS, CRITERION_LABELS, DOSSIER_KIND_LABELS, label, labelList, STATUS_LABELS, STEP_LABELS } from "./labels";

export type Profile = Pick<Tables<"users">, "id" | "username" | "global_name" | "rank" | "cgu_accepted_at" | "in_guild" | "created_at">;

export const RANK_LABELS: Record<string, string> = { joueur: "Joueur", recruteur: "Recruteur", admin: "Admin", owner: "Owner" };

export async function findProfile(userId: string): Promise<Profile | undefined> {
  const [profile] = await sql()<Profile[]>`
    select id, username, global_name, rank, cgu_accepted_at, in_guild, created_at from users where id = ${userId}
  `;
  return profile;
}

/** Rôles Discord réglés sur le site pour chaque rang (lecture seule ; vide tant que le site utilise ses variables de secours). */
export async function roleRanks(): Promise<{ admin: string[]; recruteur: string[] }> {
  const rows = await sql()<Pick<Tables<"role_ranks">, "role_id" | "rank">[]>`select role_id, rank from role_ranks`;
  return { admin: rows.filter(row => row.rank === "admin").map(row => row.role_id), recruteur: rows.filter(row => row.rank === "recruteur").map(row => row.role_id) };
}

/** Fiche du joueur sur l'espace staff du site. */
export function profileUrl(userId: string) {
  return `${env().SITE_URL}/equipe/joueurs/${userId}`;
}

const when = (value: string | null) => (value ? `<t:${Math.floor(new Date(value).getTime() / 1000)}:f>` : null);
const yesNo = (value: unknown) => (value === true ? "Oui" : value === false ? "Non" : "—");
const text = (value: unknown, max = 1024) => {
  const result = value === undefined || value === null || value === "" ? "—" : String(value).trim();
  return result.length > max ? `${result.slice(0, max - 1)}…` : result;
};

/** Lien Markdown sûr : une parenthèse dans l'adresse fermerait le lien. */
const link = (title: string, url: string) => `[${title}](${url.replaceAll("(", "%28").replaceAll(")", "%29")})`;

function steps(application: Application) {
  const record = (value: unknown) => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
  return { hrp: record(application.hrp), rp: record(application.rp), background: record(application.background), dossier: record(application.dossier) };
}

function dossierTarget(kind: unknown, target: unknown) {
  if (kind === "affinite") return label(AFFINITY_LABELS, target);
  if (kind === "creature") return label(CREATURE_LABELS, target);
  return text(target, 80);
}

/**
 * Résumé d'un joueur pour le staff : compte, candidature, personnage et décision.
 * Les notes de l'équipe restent sur le site, où leur visibilité est gérée.
 */
export function ficheEmbed(settings: GuildSettings, profile: Profile, application: Application | undefined): EmbedBuilder {
  const name = profile.global_name ?? profile.username;
  const account = [
    `Rang : **${label(RANK_LABELS, profile.rank)}**`,
    `Compte lié : ${when(profile.created_at)}`,
    `CGU : ${profile.cgu_accepted_at ? `acceptées ${when(profile.cgu_accepted_at)}` : "**non acceptées**"}`,
    profile.in_guild ? null : "**N'est plus sur le Discord**",
  ];
  const result = embed(settings)
    .setTitle(`Fiche de ${name}`)
    .setDescription(`<@${profile.id}> · \`${profile.username}\``)
    .addFields({ name: "Compte", value: account.filter(Boolean).join("\n") });

  if (!application) return result.addFields({ name: "Candidature", value: "Aucune candidature déposée." });

  const { hrp, rp, background, dossier } = steps(application);
  const dates = [
    `Statut : **${label(STATUS_LABELS, application.status)}**`,
    `Commencée ${when(application.created_at)}`,
    application.submitted_at && `Envoyée ${when(application.submitted_at)}`,
    application.viewed_at && `Lue ${when(application.viewed_at)}`,
    application.decided_at && `Décision ${when(application.decided_at)}${application.reviewer_id ? ` par <@${application.reviewer_id}>` : ""}`,
    application.whitelist_revoked_at &&
      `**Whitelist retirée** ${when(application.whitelist_revoked_at)}${application.whitelist_revoked_by_id ? ` par <@${application.whitelist_revoked_by_id}>` : ""}${application.whitelist_revoke_reason ? ` : ${text(application.whitelist_revoke_reason, 300)}` : ""}`,
  ];
  result.addFields({ name: "Candidature", value: dates.filter(Boolean).join("\n") });

  if (Object.keys(rp).length > 0) {
    const character = [
      `**${text(rp.firstName, 40)} ${text(rp.lastName, 40)}**, ${text(rp.age, 3)} ans`,
      rp.affinity ? `Affinité : ${label(AFFINITY_LABELS, rp.affinity)}` : null,
      rp.creature ? `Créature : ${label(CREATURE_LABELS, rp.creature)}` : null,
      `Origine : ${text(rp.origin, 600)}`,
    ];
    result.addFields({ name: "Personnage", value: character.filter(Boolean).join("\n") });
  }
  if (Object.keys(hrp).length > 0) {
    result.addFields({
      name: "HRP",
      value: [
        `Âge : ${text(hrp.age, 3)} · Heures de RP : ${text(hrp.rpHours, 10)}`,
        `Bon micro : ${yesNo(hrp.goodMic)} · Souhaite un dossier : ${yesNo(hrp.wantsDossier)}`,
        `Expérience : ${text(hrp.experience, 700)}`,
      ].join("\n"),
    });
  }
  const documents = [
    typeof background.url === "string" ? link("Background", background.url) : null,
    typeof dossier.url === "string"
      ? `${link("Dossier", dossier.url)} : ${label(DOSSIER_KIND_LABELS, dossier.kind)} (${dossierTarget(dossier.kind, dossier.target)})`
      : null,
  ].filter(Boolean);
  if (documents.length > 0) result.addFields({ name: "Documents", value: documents.join("\n") });

  if (application.status === "a_modifier") {
    result.addFields({
      name: "Modification demandée",
      value: text(`${labelList(STEP_LABELS, application.changes_steps).join(", ") || "—"}\n${application.changes_comment ?? ""}`),
    });
  }
  if (application.status === "refusee") {
    const criteria = labelList(CRITERION_LABELS, application.refusal_criteria).map(item => `• ${item}`);
    result.addFields({ name: "Refus", value: text([...criteria, application.refusal_comment ?? ""].filter(Boolean).join("\n")) });
  }
  return result;
}
