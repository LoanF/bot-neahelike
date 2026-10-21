import type { Guild } from "discord.js";
import { describe, expect, it } from "vitest";
import type { GuildSettings } from "@/config/store";
import { Registry, setRegistry } from "@/core/registry";
import { modules } from "@/modules";
import { renderLogsPanel } from "@/modules/logs/panel";

setRegistry(new Registry(modules.map(module => ({ ...module, messages: [] }))));

const settings = {
  guildId: "100000000000000001",
  config: { embed_color: "#d1a64a", embed_color_dark: "#1a150f", embed_color_light: "#f1ece2" },
  levels: [],
  modules: new Map([["logs", { enabled: true, levelId: null, settings: { salons: { "message-supprime": "200000000000000001", vocal: "200000000000000001" } } }]]),
  commandOverrides: new Map(),
  messages: new Map(),
} as unknown as GuildSettings;

const guild = { name: "Néa Hélikè", channels: { cache: new Map([["200000000000000001", { name: "logs-messages" }]]) } } as unknown as Guild;
const view = { settings, guild, owner: "300000000000000001" };

const VIEWS = ["accueil", "type:message-supprime", "type:arrivee", "groupe:tout", "groupe:messages", "groupe:moderation", "tout-desactiver"];

describe("panneau des logs", () => {
  it.each(VIEWS)("la vue %s respecte les limites de Discord", target => {
    const payload = renderLogsPanel(view, target);
    const rows = (payload.components ?? []).map(row => row.toJSON().components);
    const ids = rows.flat().map(component => ("custom_id" in component ? component.custom_id : ""));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.length).toBeLessThanOrEqual(100);
    expect(rows.length).toBeLessThanOrEqual(5);
    for (const row of rows) expect(row.length).toBeLessThanOrEqual(5);
    for (const component of rows.flat()) if ("options" in component) expect(component.options.length).toBeLessThanOrEqual(25);
    expect(payload.embeds?.length).toBeGreaterThan(0);
  });

  it("récapitule les salons configurés et les types désactivés", () => {
    const description = renderLogsPanel(view, "accueil").embeds![0]!.toJSON().description ?? "";
    expect(description).toContain("<#200000000000000001>");
    expect(description).toContain("Messages supprimés");
    expect(description).toContain("**Désactivés**");
  });
});
