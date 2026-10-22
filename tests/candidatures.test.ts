import { describe, expect, it } from "vitest";
import type { GuildSettings } from "@/config/store";
import type { Json } from "@/db";
import type { Application } from "@/modules/site/applications";

describe("candidatures : fiche et journal", async () => {
  Object.assign(process.env, {
    DATABASE_URL: "postgresql://localhost/inutilise",
    DISCORD_BOT_TOKEN: "test",
    DISCORD_GUILD_ID: "100000000000000001",
    SITE_URL: "https://example.test",
  });
  const { ficheEmbed, profileUrl } = await import("@/modules/site/fiche");
  const { describeEvent, RELAYED_EVENTS } = await import("@/modules/site/journal");

  const settings = {
    guildId: "100000000000000001",
    config: { embed_color: "#d1a64a", embed_color_dark: "#1a150f", embed_color_light: "#f1ece2" },
    modules: new Map(),
    messages: new Map(),
  } as unknown as GuildSettings;
  const profile = {
    id: "900000000000000001",
    username: "kallias",
    global_name: "Kallias",
    rank: "joueur" as const,
    cgu_accepted_at: "2026-10-01 10:00:00+00",
    in_guild: true,
    created_at: "2026-10-01 09:00:00+00",
  };
  const application = {
    id: "00000000-0000-4000-8000-000000000001",
    user_id: profile.id,
    status: "refusee",
    hrp: { age: "24", rpHours: "1200", experience: "Plusieurs serveurs.", goodMic: true, wantsDossier: true },
    rp: { firstName: "Theron", lastName: "Akritas", age: "31", origin: "Né sur les côtes.", affinity: "abyssiens", creature: "" },
    background: { url: "https://docs.example/bg(1)", shared: true },
    dossier: { kind: "creature", target: "sirenes", url: "https://docs.example/dossier", shared: true },
    submitted_at: "2026-10-02 10:00:00+00",
    viewed_at: "2026-10-03 10:00:00+00",
    reviewer_id: "900000000000000002",
    changes_steps: null,
    changes_comment: null,
    refusal_criteria: ["lore"],
    refusal_comment: "Relis le lore.",
    decided_at: "2026-10-04 10:00:00+00",
    created_at: "2026-10-01 10:00:00+00",
    updated_at: "2026-10-04 10:00:00+00",
  } satisfies Application;

  it("résume le joueur sans exposer les notes de l'équipe", () => {
    const fields = Object.fromEntries((ficheEmbed(settings, profile, application).toJSON().fields ?? []).map(field => [field.name, field.value]));
    expect(Object.keys(fields)).toEqual(["Compte", "Candidature", "Personnage", "HRP", "Documents", "Refus"]);
    expect(fields.Candidature).toContain("**Refusée**");
    expect(fields.Candidature).toContain("par <@900000000000000002>");
    expect(fields.Personnage).toContain("**Theron Akritas**, 31 ans");
    expect(fields.Personnage).toContain("Affinité : Abyssiens");
    expect(fields.Personnage).not.toContain("Créature");
    expect(fields.Documents).toContain("[Background](https://docs.example/bg%281%29)");
    expect(fields.Documents).toContain("Le lead d'une créature (Sirènes)");
    expect(fields.Refus).toBe("• Non-respect du lore\nRelis le lore.");
  });

  it("signale un joueur sans candidature ou parti du Discord", () => {
    const result = ficheEmbed(settings, { ...profile, in_guild: false, cgu_accepted_at: null }, undefined).toJSON();
    expect(result.fields?.[0]?.value).toContain("**non acceptées**");
    expect(result.fields?.[0]?.value).toContain("N'est plus sur le Discord");
    expect(result.fields?.[1]).toEqual({ name: "Candidature", value: "Aucune candidature déposée." });
  });

  it("pointe vers la fiche de l'espace staff", () => {
    expect(profileUrl("900000000000000001")).toBe("https://example.test/equipe/joueurs/900000000000000001");
  });

  const event = (type: string, data: { [key: string]: Json } = {}, actor = "900000000000000002") => ({
    id: "00000000-0000-4000-8000-000000000010",
    type,
    subject_id: "900000000000000001",
    actor_id: actor,
    data,
    created_at: "2026-10-04 10:00:00+00",
  });

  it("décrit chaque événement relayé et ignore les autres", () => {
    for (const type of RELAYED_EVENTS) expect(describeEvent(event(type))).not.toBeNull();
    expect(describeEvent(event("note.ajoutee"))).toBeNull();
    expect(describeEvent(event("candidature.etape"))).toBeNull();
  });

  it("distingue l'envoi du renvoi et attribue l'action au bon membre", () => {
    expect(describeEvent(event("candidature.envoyee", {}, "900000000000000001"))?.text).toBe("<@900000000000000001> a envoyé sa candidature.");
    expect(describeEvent(event("candidature.envoyee", { renvoi: true }, "900000000000000001"))?.title).toContain("renvoyée");
    expect(describeEvent(event("candidature.validee"))?.text).toContain("<@900000000000000002> a validé");
  });

  it("relaie les changements de rang calculés par le site, avec les nouveaux rangs", () => {
    const change = describeEvent(event("rang.change", { avant: "recruteur", apres: "owner" }, "900000000000000001"));
    expect(change?.text).toBe("<@900000000000000001> : Recruteur → **Owner**");
    expect(describeEvent(event("rang.change", { avant: "joueur", apres: "admin" }))?.text).toContain("→ **Admin**");
  });

  it("reprend les étapes, critères et commentaires avec les libellés du site", () => {
    const changes = describeEvent(event("candidature.modification", { etapes: ["rp", "dossier"], commentaire: " Précise l'origine. " }));
    expect(changes?.text).toContain(": Personnage, Dossier.");
    expect(changes?.detail).toBe("Précise l'origine.");
    const refusal = describeEvent(event("candidature.refusee", { criteres: ["lore", "autre"], commentaire: "" }));
    expect(refusal?.detail).toBe("• Non-respect du lore\n• Autre (voir le commentaire)");
  });
});
