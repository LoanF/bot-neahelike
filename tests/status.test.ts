import { describe, expect, it } from "vitest";
import type { Application } from "@/modules/site/applications";

const ASPIRANT = "700000000000000001";
const HELIKEEN = "700000000000000002";

describe("statut de candidature", async () => {
  Object.assign(process.env, {
    DATABASE_URL: "postgresql://localhost/inutilise",
    DISCORD_BOT_TOKEN: "test",
    DISCORD_GUILD_ID: "100000000000000001",
    SITE_URL: "https://example.test/",
    DISCORD_ROLE_ATTENTE_WL: ASPIRANT,
    DISCORD_ROLE_WL: HELIKEEN,
  });
  const { portalUrl } = await import("@/modules/site/commands");
  const { reapplyDate, statusKey, statusVars } = await import("@/modules/site/applications");
  const linked = { cgu_accepted_at: "2026-10-01T00:00:00.000Z", rank: "joueur" as const };
  const now = new Date("2026-10-21T12:00:00Z");

  const application = (patch: Partial<Application>): Application => ({
    id: "00000000-0000-4000-8000-000000000001",
    user_id: "900000000000000001",
    status: "brouillon",
    hrp: null,
    rp: null,
    background: null,
    dossier: null,
    submitted_at: null,
    viewed_at: null,
    reviewer_id: null,
    changes_steps: null,
    changes_comment: null,
    refusal_criteria: null,
    refusal_comment: null,
    decided_at: null,
    whitelist_revoked_at: null,
    interview_slot_start: null,
    interview_slot_end: null,
    reapply_lifted_at: null,
    whitelist_revoked_by_id: null,
    whitelist_revoke_reason: null,
    created_at: "2026-10-01 10:00:00+00",
    updated_at: "2026-10-01 10:00:00+00",
    ...patch,
  });

  it("suit le compte puis les rôles du parcours sans candidature", () => {
    expect(statusKey(undefined, undefined, [])).toBe("candidature.statut.sans-compte");
    expect(statusKey({ ...linked, cgu_accepted_at: null }, undefined, [])).toBe("candidature.statut.cgu");
    expect(statusKey(linked, undefined, [])).toBe("candidature.statut.compte-lie");
    expect(statusKey(linked, undefined, [ASPIRANT])).toBe("candidature.statut.attente-vocal");
    expect(statusKey(linked, undefined, [ASPIRANT, HELIKEEN])).toBe("candidature.statut.whiteliste");
  });

  it("suit l'état de la candidature quand elle existe", () => {
    const key = (patch: Partial<Application>) => statusKey(linked, application(patch), [], now);
    expect(key({ status: "brouillon" })).toBe("candidature.statut.brouillon");
    expect(key({ status: "envoyee" })).toBe("candidature.statut.envoyee");
    expect(key({ status: "a_modifier" })).toBe("candidature.statut.a-modifier");
    expect(key({ status: "entretien" })).toBe("candidature.statut.attente-vocal");
    expect(key({ status: "whitelistee" })).toBe("candidature.statut.whiteliste");
    expect(key({ status: "refusee", decided_at: "2026-09-01 10:00:00+00" })).toBe("candidature.statut.refusee");
  });

  it("laisse candidater de nouveau une fois le délai de refus écoulé", () => {
    const refused = application({ status: "refusee", decided_at: "2026-07-01 10:00:00+00" });
    expect(reapplyDate(refused)?.toISOString()).toBe("2026-10-01T10:00:00.000Z");
    expect(statusKey(linked, refused, [], now)).toBe("candidature.statut.compte-lie");
  });

  it("repart de zéro quand la whitelist a été retirée, comme le portail", () => {
    const revoked = application({ status: "whitelistee", whitelist_revoked_at: "2026-10-20 10:00:00+00", whitelist_revoked_by_id: "900000000000000002" });
    expect(statusKey(linked, revoked, [], now)).toBe("candidature.statut.compte-lie");
    expect(statusKey(linked, revoked, [ASPIRANT], now)).toBe("candidature.statut.attente-vocal");
  });

  it("laisse recandidater tout de suite quand un admin a levé le délai, comme le portail", () => {
    const refused = application({ status: "refusee", decided_at: "2026-10-20 10:00:00+00" });
    expect(statusKey(linked, refused, [], now)).toBe("candidature.statut.refusee");
    expect(statusKey(linked, { ...refused, reapply_lifted_at: "2026-10-21 08:00:00+00" }, [], now)).toBe("candidature.statut.compte-lie");
  });

  it("garde le délai d'un ancien compte supprimé (reapply_locks)", () => {
    const lock = new Date("2026-12-01T00:00:00Z");
    expect(statusKey(linked, undefined, [], now, lock)).toBe("candidature.statut.delai");
    expect(statusKey(linked, undefined, [], now, new Date("2026-10-01T00:00:00Z"))).toBe("candidature.statut.compte-lie");
    expect(statusVars(undefined, "https://example.test", lock).date).toBe(`<t:${lock.getTime() / 1000}:D>`);
    // Une candidature en cours passe avant le délai conservé.
    expect(statusKey(linked, application({ status: "envoyee" }), [], now, lock)).toBe("candidature.statut.envoyee");
  });

  it("annonce la prochaine session de whitelist choisie par le recruteur", () => {
    const slot = { interview_slot_start: "2026-10-25 19:00:00+00", interview_slot_end: "2026-10-25 21:00:00+00" };
    const vars = statusVars(application({ status: "entretien", ...slot }), "https://example.test", null, now);
    expect(vars.session).toBe(`<t:${Date.parse("2026-10-25T19:00:00Z") / 1000}:F> → <t:${Date.parse("2026-10-25T21:00:00Z") / 1000}:t> (<t:${Date.parse("2026-10-25T19:00:00Z") / 1000}:R>)`);
    expect(statusVars(application({ status: "entretien" }), "https://example.test", null, now).session).toContain("annoncée par l'équipe");
    // Session déjà passée : on n'affiche pas une date périmée.
    expect(statusVars(application({ status: "entretien", ...slot }), "https://example.test", null, new Date("2026-10-26T00:00:00Z")).session).toContain("annoncée par l'équipe");
  });

  it("donne la priorité au rôle de citoyen", () => {
    expect(statusKey(linked, application({ status: "refusee", decided_at: "2026-10-20 10:00:00+00" }), [HELIKEEN], now)).toBe("candidature.statut.whiteliste");
  });

  it("remplit les variables avec les libellés du site", () => {
    const vars = statusVars(
      application({ status: "refusee", decided_at: "2026-10-20 10:00:00+00", refusal_criteria: ["lore", "inconnu"], refusal_comment: "  Relis le lore. " }),
      "https://example.test/connexion",
    );
    expect(vars.criteres).toBe("• Non-respect du lore\n• inconnu");
    expect(vars.commentaire).toBe("Relis le lore.");
    expect(vars.date).toBe(`<t:${Date.parse("2027-01-20T10:00:00Z") / 1000}:D>`);

    const changes = statusVars(application({ status: "a_modifier", changes_steps: ["rp", "background"] }), "lien");
    expect(changes.etapes).toBe("Personnage, Background");
    expect(changes.commentaire).toBe("Aucun commentaire.");
  });

  it("construit le lien du portail sans double barre oblique", () => {
    expect(portalUrl()).toBe("https://example.test/connexion");
  });
});
