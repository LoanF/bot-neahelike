import { describe, expect, it } from "vitest";
import type { GuildSettings } from "@/config/store";
import { channelName, cleanQuestions, DEFAULT_CATEGORIES, newCategoryId, ticketSettings } from "@/modules/tickets/settings";

const withSettings = (settings: unknown) => ({ modules: new Map([["tickets", { enabled: true, levelId: null, settings }]]) }) as unknown as GuildSettings;

describe("réglages des tickets", () => {
  it("propose les six catégories par défaut tant que rien n'est réglé", () => {
    expect(ticketSettings(withSettings(undefined)).categories.map(category => category.label)).toEqual([
      "Support",
      "Question whitelist",
      "Plainte joueur",
      "Plainte staff",
      "Dossier de reprise",
      "Partenariat",
    ]);
  });

  it("garde des catégories réglées, même vides", () => {
    expect(ticketSettings(withSettings({ categories: [] })).categories).toEqual([]);
  });

  it("ignore des réglages invalides", () => {
    expect(ticketSettings(withSettings({ autoCloseDays: "trois" })).categories).toEqual(DEFAULT_CATEGORIES);
  });

  it("donne des identifiants de catégorie courts et valides", () => {
    expect(newCategoryId()).toMatch(/^c[0-9a-f]{8}$/);
  });

  it("nettoie les questions et refuse celles trop longues", () => {
    expect(cleanQuestions(["  Ton pseudo ", "", null, "Ta question"])).toEqual(["Ton pseudo", "Ta question"]);
    expect(() => cleanQuestions(["a".repeat(46)])).toThrow("45 caractères");
  });

  it("forme un nom de salon lisible", () => {
    expect(channelName("Plainte joueur", "Kallias_du_Péloponnèse")).toBe("plainte-joueur-kallias-du-peloponnese");
    expect(channelName("🛠️", "…")).toBe("ticket-membre");
  });
});
