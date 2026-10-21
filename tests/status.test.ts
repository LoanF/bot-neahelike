import { describe, expect, it } from "vitest";

const ASPIRANT = "700000000000000001";
const HELIKEEN = "700000000000000002";

describe("statut de candidature", async () => {
  Object.assign(process.env, {
    DATABASE_URL: "postgresql://localhost/inutilise",
    DISCORD_BOT_TOKEN: "test",
    DISCORD_GUILD_ID: "100000000000000001",
    SITE_URL: "https://example.test/",
    DISCORD_ROLE_STAFF: "800000000000000001",
    DISCORD_ROLE_RECRUTEUR: "800000000000000002",
    DISCORD_ROLE_ASPIRANT: ASPIRANT,
    DISCORD_ROLE_HELIKEEN: HELIKEEN,
  });
  const { portalUrl, statusKey } = await import("@/modules/site/commands");
  const linked = { cgu_accepted_at: "2026-10-01T00:00:00.000Z", rank: "joueur" as const };

  it("suit le compte puis les rôles du parcours", () => {
    expect(statusKey(undefined, [])).toBe("candidature.statut.sans-compte");
    expect(statusKey({ ...linked, cgu_accepted_at: null }, [])).toBe("candidature.statut.cgu");
    expect(statusKey(linked, [])).toBe("candidature.statut.compte-lie");
    expect(statusKey(linked, [ASPIRANT])).toBe("candidature.statut.attente-vocal");
    expect(statusKey(linked, [ASPIRANT, HELIKEEN])).toBe("candidature.statut.whiteliste");
  });

  it("construit le lien du portail sans double barre oblique", () => {
    expect(portalUrl()).toBe("https://example.test/connexion");
  });
});
