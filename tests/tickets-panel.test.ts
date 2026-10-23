import type { Guild } from "discord.js";
import { describe, expect, it } from "vitest";
import type { GuildSettings } from "@/config/store";
import type { Payload } from "@/core/context";
import { Registry, setRegistry } from "@/core/registry";
import { modules } from "@/modules";
import { renderTicketsPanel } from "@/modules/tickets/panel";
import { DEFAULT_CATEGORIES, MAX_CATEGORIES } from "@/modules/tickets/settings";
import { publicPanel } from "@/modules/tickets/ui";

setRegistry(new Registry(modules));

function settingsWith(ticketSettings: unknown) {
  return {
    guildId: "100000000000000001",
    config: { embed_color: "#d1a64a", embed_color_dark: "#1a150f", embed_color_light: "#f1ece2" },
    levels: [],
    modules: new Map([["tickets", { enabled: true, levelId: null, settings: ticketSettings }]]),
    commandOverrides: new Map(),
    messages: new Map(),
  } as unknown as GuildSettings;
}

const guild = { id: "100000000000000001", name: "Néa Hélikè", channels: { cache: new Map() }, roles: { cache: new Map() } } as unknown as Guild;

function checkLimits(payload: Payload) {
  const rows = (payload.components ?? []).map(row => row.toJSON().components);
  const ids = rows.flat().map(component => ("custom_id" in component ? component.custom_id : ""));
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of ids) expect(id.length).toBeLessThanOrEqual(100);
  expect(rows.length).toBeLessThanOrEqual(5);
  for (const row of rows) expect(row.length).toBeLessThanOrEqual(5);
  for (const component of rows.flat()) {
    if ("options" in component) {
      expect(component.options.length).toBeGreaterThan(0);
      expect(component.options.length).toBeLessThanOrEqual(25);
    }
  }
}

describe("panneau de configuration des tickets", () => {
  const view = { settings: settingsWith(undefined), guild, owner: "300000000000000001" };

  it.each(["accueil", "categorie:support", "categorie:partenariat", "suppr:support", "publier"])("la vue %s respecte les limites de Discord", target => {
    checkLimits(renderTicketsPanel(view, target));
  });

  it("présente les six catégories par défaut", () => {
    const fields = renderTicketsPanel(view).embeds![0]!.toJSON().fields ?? [];
    expect(fields.find(field => field.name.startsWith("Catégories"))?.value).toContain("Plainte staff");
  });

  it("signale une catégorie sans rôle", () => {
    const fields = renderTicketsPanel(view, "categorie:support").embeds![0]!.toJSON().fields ?? [];
    expect(fields.find(field => field.name === "Rôles de l'équipe")?.value).toContain("aucun rôle");
  });
});

describe("panneau public des tickets", () => {
  it("met un bouton par catégorie, cinq par rangée", () => {
    const payload = publicPanel(settingsWith(undefined), guild);
    checkLimits(payload);
    expect(payload.components!.flatMap(row => row.toJSON().components)).toHaveLength(DEFAULT_CATEGORIES.length);
  });

  it("tient avec le nombre maximal de catégories", () => {
    const categories = Array.from({ length: MAX_CATEGORIES }, (_, index) => ({ ...DEFAULT_CATEGORIES[0]!, id: `c${index}`, label: `Catégorie ${index}` }));
    const payload = publicPanel(settingsWith({ categories }), guild);
    checkLimits(payload);
    expect(payload.components).toHaveLength(4);
  });

  it("annonce l'absence de catégorie sans planter", () => {
    const payload = publicPanel(settingsWith({ categories: [] }), guild);
    expect(payload.embeds![0]!.toJSON().description).toContain("Aucune catégorie");
    expect(payload.components).toHaveLength(0);
  });
});

describe("/ticket", () => {
  const base = {
    answers: [],
    category_id: "support",
    category_label: "Support",
    channel_id: "600000000000000001",
    claimed_by_id: null,
    close_reason: null,
    closed_at: null,
    closed_by_id: null,
    created_at: "2026-10-20 10:00:00+00",
    guild_id: "100000000000000001",
    id: "00000000-0000-4000-8000-000000000001",
    last_activity_at: "2026-10-20 10:00:00+00",
    number: 7,
    opener_id: "900000000000000001",
    rating: null,
    status: "ouvert" as const,
    transcript: null,
  };

  it("ticket ouvert : prendre en charge, fermer, ajouter et retirer un membre", async () => {
    const { ticketButtons, ticketSummary } = await import("@/modules/tickets/actions");
    const buttons = ticketButtons(base)[0]!.toJSON().components.map(item => ("custom_id" in item ? item.custom_id : ""));
    expect(buttons).toEqual(["prendre", "fermer", "ajouter", "retirer"].map(action => `tkt:*:${action}:${base.id}`));
    const fields = Object.fromEntries((ticketSummary(settingsWith({}), { ...base, claimed_by_id: "300000000000000001" }).toJSON().fields ?? []).map(item => [item.name, item.value]));
    expect(fields).toEqual({ État: "🟢 Ouvert", "Ouvert par": "<@900000000000000001>", "Pris en charge": "<@300000000000000001>" });
  });

  it("ticket fermé : rouvrir ou supprimer le salon", async () => {
    const { ticketButtons, ticketSummary } = await import("@/modules/tickets/actions");
    const labels = ticketButtons({ ...base, status: "ferme" })[0]!.toJSON().components.map(item => ("label" in item ? item.label : ""));
    expect(labels).toEqual(["Rouvrir", "Supprimer le salon"]);
    expect(ticketSummary(settingsWith({}), { ...base, status: "ferme" }).toJSON().title).toBe("🎫 Ticket #0007 · Support");
  });
});
