import type { Guild } from "discord.js";
import { describe, expect, it } from "vitest";
import type { GuildSettings } from "@/config/store";
import type { Payload } from "@/core/context";
import { draftMissing, DURATION_CHOICES, newDraft, parseWinners } from "@/modules/giveaways/logic";
import { cancelView, clearDraft, draftView, formatDurationInput, getDraft, giveawayView, homeView, saveDraft } from "@/modules/giveaways/panel";
import type { Giveaway } from "@/modules/giveaways/store";

const settings = {
  guildId: "100000000000000001",
  config: { embed_color: "#d1a64a", embed_color_dark: "#1a150f", embed_color_light: "#f1ece2" },
  modules: new Map(),
  messages: new Map(),
} as unknown as GuildSettings;
const guild = { id: "100000000000000001", name: "Néa Hélikè", channels: { cache: new Map() }, roles: { cache: new Map() } } as unknown as Guild;
const view = { settings, guild, owner: "300000000000000001" };

const giveaway = (patch: Partial<Giveaway> = {}): Giveaway => ({
  id: "00000000-0000-4000-8000-000000000001",
  guild_id: guild.id,
  channel_id: "600000000000000001",
  message_id: "610000000000000001",
  prize: "Une voiture de luxe",
  description: null,
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

function components(payload: Payload) {
  return (payload.components ?? []).map(item => item.toJSON().components);
}

function checkLimits(payload: Payload) {
  const rows = components(payload);
  const ids = rows.flat().flatMap(component => ("custom_id" in component ? [component.custom_id] : []));
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of ids) expect(id.length).toBeLessThanOrEqual(100);
  expect(rows.length).toBeLessThanOrEqual(5);
  for (const items of rows) expect(items.length).toBeLessThanOrEqual(5);
}

const buttonByLabel = (payload: Payload, label: string) => components(payload).flat().find(component => "label" in component && component.label === label) as { disabled?: boolean; custom_id?: string } | undefined;

describe("panneau des giveaways", () => {
  it("accueil : liste et menu pour gérer chaque giveaway, sans menu vide", () => {
    const list = [giveaway(), giveaway({ id: "00000000-0000-4000-8000-000000000002", status: "termine", ended_at: "2026-10-22 21:00:00+00" })];
    const payload = homeView(view, list);
    checkLimits(payload);
    expect(payload.embeds![0]!.toJSON().description).toContain("🟢 En cours · **Une voiture de luxe**");
    expect(components(payload)[0]![0]).toMatchObject({ custom_id: "gva:300000000000000001:go:voir" });
    const empty = homeView(view, []);
    expect(empty.embeds![0]!.toJSON().description).toContain("Aucun giveaway");
    expect(components(empty)).toHaveLength(1);
  });

  it("création : « Publier » reste grisé tant qu'il manque le lot ou le salon", () => {
    const incomplete = draftView(view, newDraft());
    checkLimits(incomplete);
    expect(buttonByLabel(incomplete, "Publier")?.disabled).toBe(true);
    expect(incomplete.embeds![0]!.toJSON().footer?.text).toBe("Il manque le lot et le salon de publication pour publier.");

    const ready = draftView(view, { ...newDraft("600000000000000001"), prize: "Une voiture" });
    expect(buttonByLabel(ready, "Publier")?.disabled).toBe(false);
    expect(ready.embeds![1]!.toJSON().title).toBe("🎉 Une voiture");
  });

  it("création : le menu des durées coche la durée choisie", () => {
    const payload = draftView(view, { ...newDraft(), durationMs: DURATION_CHOICES[1]!.ms });
    const menu = components(payload)[2]![0] as { options: { value: string; default?: boolean }[] };
    expect(menu.options.find(option => option.default)?.value).toBe(String(DURATION_CHOICES[1]!.ms));
  });

  it("giveaway : actions selon l'état, et confirmation avant d'annuler", () => {
    const running = giveawayView(view, giveaway(), 12);
    checkLimits(running);
    expect(buttonByLabel(running, "Tirer maintenant")).toBeDefined();
    expect(buttonByLabel(running, "Annuler le giveaway")?.custom_id).toContain(":go:annuler:");

    const ended = giveawayView(view, giveaway({ status: "termine", winner_ids: ["400000000000000001"] }), 3);
    expect(buttonByLabel(ended, "Nouveau tirage")).toBeDefined();
    expect(buttonByLabel(ended, "Tirer maintenant")).toBeUndefined();
    expect(ended.embeds![0]!.toJSON().fields?.find(item => item.name === "Gagnants")?.value).toBe("<@400000000000000001>");

    const cancelled = giveawayView(view, giveaway({ status: "annule" }), 0);
    expect(buttonByLabel(cancelled, "Nouveau tirage")).toBeUndefined();

    const confirm = cancelView(view, giveaway());
    checkLimits(confirm);
    expect(buttonByLabel(confirm, "Annuler le giveaway")?.custom_id).toBe("gva:300000000000000001:annuler:00000000-0000-4000-8000-000000000001");
  });
});

describe("brouillon d'un giveaway", () => {
  it("est propre à chaque membre et expire au bout d'une heure", () => {
    const now = 1_000_000;
    saveDraft("g", "a", { ...newDraft(), prize: "Lot A" }, now);
    expect(getDraft("g", "a", now + 1000).prize).toBe("Lot A");
    expect(getDraft("g", "b", now).prize).toBeNull();
    expect(getDraft("g", "a", now + 60 * 60 * 1000 + 1).prize).toBeNull();
    clearDraft("g", "a");
    expect(getDraft("g", "a", now).prize).toBeNull();
  });

  it("signale ce qui manque et lit le nombre de gagnants", () => {
    expect(draftMissing(newDraft())).toEqual(["le lot", "le salon de publication"]);
    expect(draftMissing({ ...newDraft("1"), prize: "x" })).toEqual([]);
    expect(parseWinners("3", 1)).toBe(3);
    expect(parseWinners(null, 2)).toBe(2);
    expect(() => parseWinners("0", 1)).toThrow("de 1 à 20");
    expect(() => parseWinners("deux", 1)).toThrow("de 1 à 20");
  });

  it("préremplit la durée dans un format que le formulaire relit", () => {
    expect(formatDurationInput(24 * 60 * 60 * 1000)).toBe("1j");
    expect(formatDurationInput(2 * 60 * 60 * 1000)).toBe("2h");
    expect(formatDurationInput(90 * 60 * 1000)).toBe("1h30");
    expect(formatDurationInput(10 * 60 * 1000)).toBe("10m");
  });
});
