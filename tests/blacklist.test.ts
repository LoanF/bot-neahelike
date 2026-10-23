import type { Guild } from "discord.js";
import { describe, expect, it } from "vitest";
import type { GuildSettings } from "@/config/store";
import type { Payload } from "@/core/context";
import { clampPage, cleanBlacklistReason, PAGE_SIZE, pageCount, parseDiscordId } from "@/modules/blacklist/logic";
import { entryLine, homeView, liftView } from "@/modules/blacklist/panel";
import type { BlacklistListEntry } from "@/modules/blacklist/store";

const settings = {
  guildId: "100000000000000001",
  config: { embed_color: "#d1a64a", embed_color_dark: "#1a150f", embed_color_light: "#f1ece2" },
  modules: new Map(),
  messages: new Map(),
} as unknown as GuildSettings;
const guild = { id: "100000000000000001", name: "Néa Hélikè" } as unknown as Guild;
const view = { settings, guild, owner: "300000000000000001" };

const entry = (patch: Partial<BlacklistListEntry> = {}): BlacklistListEntry => ({
  discord_id: "900000000000000001",
  reason: "Triche répétée",
  created_by_id: "300000000000000002",
  source: "bot",
  created_at: "2026-10-20 10:00:00+00",
  name: "Theron",
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

const byLabel = (payload: Payload, label: string) =>
  components(payload)
    .flat()
    .find(component => "label" in component && component.label === label) as { disabled?: boolean; custom_id?: string } | undefined;

describe("blacklist : saisie", () => {
  it("accepte un ID ou une mention, refuse le reste", () => {
    expect(parseDiscordId(" 123456789012345678 ")).toBe("123456789012345678");
    expect(parseDiscordId("<@!123456789012345678>")).toBe("123456789012345678");
    expect(parseDiscordId("<@123456789012345678>")).toBe("123456789012345678");
    expect(parseDiscordId("1234")).toBeNull();
    expect(parseDiscordId("abc123456789012345678")).toBeNull();
    expect(parseDiscordId(null)).toBeNull();
  });

  it("garde la raison facultative : vide devient null, longue est coupée", () => {
    expect(cleanBlacklistReason("  ")).toBeNull();
    expect(cleanBlacklistReason(null)).toBeNull();
    expect(cleanBlacklistReason(" Triche ")).toBe("Triche");
    expect(cleanBlacklistReason("x".repeat(600))).toHaveLength(500);
  });

  it("compte les pages et ramène une page hors bornes", () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(PAGE_SIZE)).toBe(1);
    expect(pageCount(PAGE_SIZE + 1)).toBe(2);
    expect(clampPage(5, PAGE_SIZE + 1)).toBe(1);
    expect(clampPage(-1, 3)).toBe(0);
    expect(clampPage(Number.NaN, 3)).toBe(0);
  });
});

describe("panneau de la blacklist", () => {
  it("liste nom, ID, raison, date, auteur et origine", () => {
    const line = entryLine(entry());
    expect(line).toContain("**Theron** · `900000000000000001`");
    expect(line).toContain("> Triche répétée");
    expect(line).toContain("par <@300000000000000002> · Discord");
    const unknown = entryLine(entry({ name: null, reason: null, source: "site" }));
    expect(unknown).toContain("<@900000000000000001> · `900000000000000001`");
    expect(unknown).toContain("*Aucune raison indiquée*");
    expect(unknown).toContain("· Site");
  });

  it("accueil : menu de membres, menu de levée limité à la page, pagination", () => {
    const list = [entry(), entry({ discord_id: "900000000000000002", name: null })];
    const payload = homeView(view, list, PAGE_SIZE + 2, 0);
    checkLimits(payload);
    const rows = components(payload);
    expect(rows[0]![0]).toMatchObject({ custom_id: "bla:300000000000000001:membre:0", type: 5 });
    expect(rows[1]![0]).toMatchObject({ custom_id: "bla:300000000000000001:lever:0" });
    expect((rows[1]![0] as { options: { value: string; label: string }[] }).options.map(option => [option.value, option.label])).toEqual([
      ["900000000000000001", "Theron"],
      ["900000000000000002", "900000000000000002"],
    ]);
    expect(byLabel(payload, "Précédente")?.disabled).toBe(true);
    expect(byLabel(payload, "Suivante")).toMatchObject({ disabled: false, custom_id: "bla:300000000000000001:page:1" });
    expect(payload.embeds![0]!.toJSON().footer?.text).toContain("page 1/2");
  });

  it("accueil vide : pas de menu de levée, pas de page suivante", () => {
    const payload = homeView({ ...view, notice: "Blacklist levée." }, [], 0, 0);
    checkLimits(payload);
    expect(payload.content).toContain("Blacklist levée.");
    expect(payload.embeds![0]!.toJSON().description).toContain("Personne n'est blacklisté");
    expect(components(payload)).toHaveLength(2);
    expect(byLabel(payload, "Suivante")?.disabled).toBe(true);
  });

  it("confirmation de levée : détails et retour à la même page", () => {
    const payload = liftView(view, entry(), 3);
    checkLimits(payload);
    const fields = Object.fromEntries((payload.embeds![0]!.toJSON().fields ?? []).map(field => [field.name, field.value]));
    expect(fields).toMatchObject({ Raison: "Triche répétée", Par: "<@300000000000000002>", Origine: "Discord" });
    expect(byLabel(payload, "Lever la blacklist")?.custom_id).toBe("bla:300000000000000001:lever-ok:900000000000000001:3");
    expect(byLabel(payload, "Retour")?.custom_id).toBe("bla:300000000000000001:page:3");
  });
});
