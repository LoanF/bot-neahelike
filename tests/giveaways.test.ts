import type { Guild } from "discord.js";
import { describe, expect, it } from "vitest";
import type { GuildSettings } from "@/config/store";
import { parseDuration, pickWinners } from "@/modules/giveaways/logic";
import type { Giveaway } from "@/modules/giveaways/store";
import { eligible, giveawayPayload } from "@/modules/giveaways/ui";

const settings = {
  guildId: "100000000000000001",
  config: { embed_color: "#d1a64a", embed_color_dark: "#1a150f", embed_color_light: "#f1ece2" },
  modules: new Map(),
  messages: new Map(),
} as unknown as GuildSettings;

const giveaway = (patch: Partial<Giveaway> = {}): Giveaway => ({
  id: "00000000-0000-4000-8000-000000000001",
  guild_id: "100000000000000001",
  channel_id: "600000000000000001",
  message_id: "610000000000000001",
  prize: "Une voiture de luxe",
  description: "Pour fêter l'ouverture.",
  winner_count: 2,
  required_role_id: null,
  host_id: "300000000000000001",
  status: "en_cours",
  winner_ids: [],
  ends_at: "2026-10-25 20:00:00+00",
  created_at: "2026-10-22 20:00:00+00",
  ended_at: null,
  ...patch,
});

describe("durée d'un giveaway", () => {
  it("lit les durées courantes", () => {
    expect(parseDuration("30m")).toBe(30 * 60_000);
    expect(parseDuration("2h")).toBe(2 * 3_600_000);
    expect(parseDuration("1h30")).toBe(90 * 60_000);
    expect(parseDuration("3j")).toBe(3 * 86_400_000);
    expect(parseDuration("1sem 2j")).toBe(9 * 86_400_000);
    expect(parseDuration(" 1D ")).toBe(86_400_000);
  });

  it("refuse les durées illisibles, trop courtes ou trop longues", () => {
    expect(() => parseDuration("demain")).toThrow("Durée invalide");
    expect(() => parseDuration("2h ou 3h")).toThrow("Durée invalide");
    expect(() => parseDuration("0m")).toThrow("au moins une minute");
    expect(() => parseDuration("31j")).toThrow("au plus 30 jours");
  });
});

describe("tirage au sort", () => {
  const first = () => 0;

  it("tire des gagnants distincts, sans doublon même si la liste en contient", () => {
    expect(pickWinners(["a", "b", "a", "c"], 3, [], first)).toEqual(["a", "b", "c"]);
  });

  it("s'arrête quand il n'y a plus assez de participants", () => {
    expect(pickWinners(["a"], 3, [], first)).toEqual(["a"]);
    expect(pickWinners([], 1)).toEqual([]);
  });

  it("écarte les anciens gagnants lors d'un nouveau tirage", () => {
    expect(pickWinners(["a", "b", "c"], 2, ["a"], first)).toEqual(["b", "c"]);
  });

  it("produit des gagnants pris parmi les participants avec l'aléatoire réel", () => {
    const entries = Array.from({ length: 50 }, (_, index) => `u${index}`);
    const winners = pickWinners(entries, 5);
    expect(new Set(winners).size).toBe(5);
    for (const winner of winners) expect(entries).toContain(winner);
  });
});

describe("participants éligibles", () => {
  const guild = {
    members: {
      cache: new Map([
        ["a", { roles: { cache: new Map([["vip", {}]]) } }],
        ["b", { roles: { cache: new Map() } }],
      ]),
    },
  } as unknown as Guild;

  it("écarte les membres partis et, si besoin, ceux sans le rôle exigé", () => {
    expect(eligible(guild, { required_role_id: null }, ["a", "b", "parti"])).toEqual(["a", "b"]);
    expect(eligible(guild, { required_role_id: "vip" }, ["a", "b"])).toEqual(["a"]);
  });
});

describe("message du giveaway", () => {
  it("en cours : bouton Participer avec le nombre de participants", () => {
    const payload = giveawayPayload(settings, giveaway(), 12);
    const data = payload.embeds![0]!.toJSON();
    expect(data.title).toBe("🎉 Une voiture de luxe");
    expect(data.description).toContain("2 gagnant(s) · 12 participant(s)");
    expect(payload.components![0]!.toJSON().components[0]).toMatchObject({ custom_id: "gvw:*:participer:00000000-0000-4000-8000-000000000001", label: "Participer (12)" });
  });

  it("terminé : gagnants mentionnés et plus de bouton", () => {
    const payload = giveawayPayload(settings, giveaway({ status: "termine", winner_ids: ["400000000000000001"], ended_at: "2026-10-25 20:00:05+00" }), 3);
    expect(payload.embeds![0]!.toJSON().description).toContain("🏆 **Gagnant(s) :** <@400000000000000001>");
    expect(payload.components).toHaveLength(0);
  });

  it("terminé sans participant, puis annulé", () => {
    expect(giveawayPayload(settings, giveaway({ status: "termine" }), 0).embeds![0]!.toJSON().description).toContain("pas de gagnant");
    expect(giveawayPayload(settings, giveaway({ status: "annule", required_role_id: "500000000000000001" }), 0).embeds![0]!.toJSON().description).toContain("Giveaway annulé");
  });
});
