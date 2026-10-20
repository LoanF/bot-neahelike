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
  "home",
  "general",
  "modules",
  "module:general",
  "module:config",
  "levels",
  `level:${settings.levels[0]!.id}`,
  `level-delete:${settings.levels[0]!.id}`,
  "commands",
  "commands:config",
  "command:niveau",
  "command:ping",
  "profile",
  "messages",
  "messages:general",
  "message:permission.refusee",
];

function customIds(payload: ReturnType<typeof renderPanel>): string[] {
  return (payload.components ?? []).flatMap(row => row.toJSON().components.map(component => ("custom_id" in component ? component.custom_id : "")));
}

describe("panneau de configuration", () => {
  it.each(VIEWS)("la vue %s respecte les limites de Discord", target => {
    const payload = renderPanel(view, target);
    const ids = customIds(payload);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.length).toBeLessThanOrEqual(100);
    expect(payload.components?.length ?? 0).toBeLessThanOrEqual(5);
    expect(() => payload.embeds?.map(embed => embed.toJSON())).not.toThrow();
  });
});
