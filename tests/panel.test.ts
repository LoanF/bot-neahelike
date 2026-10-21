import type { Guild } from "discord.js";
import { describe, expect, it } from "vitest";
import type { GuildSettings } from "@/config/store";
import { Registry, setRegistry } from "@/core/registry";
import { modules } from "@/modules";
import { renderPanel } from "@/modules/config/panel";

setRegistry(new Registry(modules));

const settings: GuildSettings = {
  guildId: "100000000000000001",
  config: {
    guild_id: "100000000000000001",
    prefix: "+",
    embed_color: "#d1a64a",
    embed_color_dark: "#1a150f",
    embed_color_light: "#f1ece2",
    nickname: null,
    bio: null,
    avatar_url: null,
    banner_url: null,
    presence_status: "online",
    activity_type: "personnalise",
    activity_text: null,
    updated_at: "2026-10-20T00:00:00.000Z",
  },
  levels: [
    { id: "0f8fad5b-d9cb-469f-a165-70867728950e", name: "Joueur", weight: 10, roleIds: [] },
    { id: "7c9e6679-7425-40de-944b-e07fc1f90ae7", name: "Admin", weight: 100, roleIds: ["200000000000000001"] },
  ],
  modules: new Map(),
  commandOverrides: new Map(),
  messages: new Map(),
};

const guild = { name: "Néa Hélikè", memberCount: 42, roles: { cache: new Map() }, members: { cache: new Map() } } as unknown as Guild;
const view = { settings, guild, owner: "300000000000000001" };

const VIEWS = [
  "accueil",
  "general",
  "modules",
  "module:general",
  "module:site",
  "acces",
  `niveau:${settings.levels[0]!.id}`,
  `niveau:${settings.levels[1]!.id}`,
  `niveau-suppr:${settings.levels[0]!.id}`,
  "commandes",
  "commande:acces",
  "commande:ping",
  "profil",
  "messages",
  "message:permission.refusee",
];

function rows(payload: ReturnType<typeof renderPanel>) {
  return (payload.components ?? []).map(row => row.toJSON().components);
}

describe("panneau de configuration", () => {
  it.each(VIEWS)("la vue %s respecte les limites de Discord", target => {
    const payload = renderPanel(view, target);
    const components = rows(payload);
    const ids = components.flat().map(component => ("custom_id" in component ? component.custom_id : ""));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.length).toBeLessThanOrEqual(100);
    expect(components.length).toBeLessThanOrEqual(5);
    for (const row of components) expect(row.length).toBeLessThanOrEqual(5);
    for (const component of components.flat()) {
      if ("options" in component) expect(component.options.length).toBeLessThanOrEqual(25);
    }
    const embeds = payload.embeds?.map(embed => embed.toJSON()) ?? [];
    expect(embeds.length).toBeGreaterThan(0);
    for (const embed of embeds) expect(embed.description?.length ?? 0).toBeLessThanOrEqual(4096);
  });

  it("ne retombe sur l'accueil que pour l'accueil", () => {
    const homeTitle = renderPanel(view, "accueil").embeds![0]!.toJSON().title;
    for (const target of VIEWS.slice(1)) expect(renderPanel(view, target).embeds![0]!.toJSON().title).not.toBe(homeTitle);
  });

  it("affiche la ligne de confirmation après une action, et la vide ensuite", () => {
    expect(renderPanel({ ...view, notice: "Préfixe changé." }, "general").content).toBe("✅ Préfixe changé.");
    expect(renderPanel(view, "general").content).toBe("");
  });

  it("n'affiche jamais le poids des accès", () => {
    for (const target of VIEWS) {
      const text = JSON.stringify(renderPanel(view, target).embeds?.map(embed => embed.toJSON()));
      expect(text).not.toMatch(/poids/i);
    }
  });
});
