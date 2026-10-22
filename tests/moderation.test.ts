import { describe, expect, it } from "vitest";
import type { GuildSettings } from "@/config/store";
import { cleanReason, hierarchyProblem, parseTempban, parseTimeout, sanctionState } from "@/modules/moderation/logic";
import type { Sanction } from "@/modules/moderation/store";

describe("modération", async () => {
  Object.assign(process.env, { DATABASE_URL: "postgresql://localhost/inutilise", DISCORD_BOT_TOKEN: "test", DISCORD_GUILD_ID: "100000000000000001", SITE_URL: "https://example.test" });
  const { casierEmbed, sanctionLine } = await import("@/modules/moderation");

  const base = { actorId: "a", actorTop: 10, targetId: "t", targetTop: 5, ownerId: "o", botId: "b", botTop: 20 };

  it("respecte la hiérarchie des rôles", () => {
    expect(hierarchyProblem(base)).toBeNull();
    expect(hierarchyProblem({ ...base, targetId: "a" })).toContain("vous-même");
    expect(hierarchyProblem({ ...base, targetId: "o" })).toContain("propriétaire");
    expect(hierarchyProblem({ ...base, targetId: "b" })).toContain("bot");
    expect(hierarchyProblem({ ...base, targetTop: 10 })).toContain("égal ou supérieur");
    expect(hierarchyProblem({ ...base, actorTop: 30, targetTop: 25 })).toContain("au-dessus de celui du bot");
  });

  it("laisse le propriétaire sanctionner un rang supérieur, et accepte un utilisateur hors du serveur", () => {
    expect(hierarchyProblem({ ...base, actorId: "o", actorTop: 1, targetTop: 15 })).toBeNull();
    expect(hierarchyProblem({ ...base, targetTop: null, actorTop: 0 })).toBeNull();
  });

  it("borne les durées aux limites de Discord", () => {
    expect(parseTimeout("10m")).toBe(600_000);
    expect(() => parseTimeout("29j")).toThrow("Une exclusion temporaire dure au plus 4 semaines");
    expect(parseTempban("30j")).toBe(30 * 86_400_000);
    expect(() => parseTempban("30s")).toThrow("au moins 1 minute");
  });

  it("met une raison par défaut et la borne sous la limite du journal d'audit", () => {
    expect(cleanReason("  ")).toBe("Aucune raison précisée");
    expect(cleanReason(undefined)).toBe("Aucune raison précisée");
    expect(cleanReason("x".repeat(600))).toHaveLength(500);
  });

  const now = new Date("2026-10-22T12:00:00Z");
  const sanction = (patch: Partial<Sanction>): Sanction => ({
    id: "00000000-0000-4000-8000-000000000001",
    number: 12,
    guild_id: "100000000000000001",
    user_id: "300000000000000001",
    moderator_id: "300000000000000002",
    type: "avertissement",
    reason: "Spam dans le général",
    ends_at: null,
    created_at: "2026-10-20 12:00:00+00",
    revoked_at: null,
    revoked_by_id: null,
    revoke_reason: null,
    ...patch,
  });

  it("donne l'état de chaque sanction", () => {
    expect(sanctionState(sanction({}), now)).toBe("definitive");
    expect(sanctionState(sanction({ type: "bannissement" }), now)).toBe("active");
    expect(sanctionState(sanction({ type: "exclusion", ends_at: "2026-10-21 12:00:00+00" }), now)).toBe("expiree");
    expect(sanctionState(sanction({ type: "bannissement", ends_at: "2026-10-30 12:00:00+00" }), now)).toBe("active");
    expect(sanctionState(sanction({ type: "bannissement", revoked_at: "2026-10-21 12:00:00+00" }), now)).toBe("levee");
  });

  it("écrit une ligne de casier avec numéro, durée, auteur, état et raison", () => {
    const line = sanctionLine(sanction({ type: "exclusion", ends_at: "2026-10-22 12:00:00+00" }), now);
    expect(line).toContain("**#12 Exclusion temporaire** (2 jours)");
    expect(line).toContain("par <@300000000000000002>");
    expect(line).toContain("*terminée*");
    expect(line).toContain("> Spam dans le général");
  });

  it("résume le casier et coupe une liste trop longue pour un embed", () => {
    const settings = { config: { embed_color: "#d1a64a", embed_color_dark: "#1a150f", embed_color_light: "#f1ece2" } } as unknown as GuildSettings;
    const many = Array.from({ length: 40 }, (_, index) => sanction({ number: index + 1, reason: "r".repeat(200) }));
    const data = casierEmbed(settings, { id: "300000000000000001", tag: "kallias" }, many, { avertissement: 40, exclusion: 0, expulsion: 0, bannissement: 0 }).toJSON();
    expect(data.title).toBe("⚖️ Casier de kallias");
    expect(data.description!.length).toBeLessThanOrEqual(4096);
    expect(data.description).toContain("plus ancienne(s)");
    expect(data.footer?.text).toBe("Sanctions en vigueur : ⚠️ 40 · ⏳ 0 · 👢 0 · 🔨 0");
    expect(casierEmbed(settings, { id: "1", tag: "vide" }, [], { avertissement: 0, exclusion: 0, expulsion: 0, bannissement: 0 }).toJSON().description).toBe("*Casier vierge.*");
  });
});
