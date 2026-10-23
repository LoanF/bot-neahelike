import { PermissionFlagsBits, type GuildMember } from "discord.js";
import { describe, expect, it } from "vitest";
import type { GuildSettings } from "@/config/store";
import { Registry, setRegistry } from "@/core/registry";
import { modules } from "@/modules";
import { renderHelp } from "@/modules/general/aide";

setRegistry(new Registry(modules.map(module => ({ ...module, messages: [] }))));

const settings = {
  config: { prefix: "+", embed_color: "#d1a64a", embed_color_dark: "#1a150f", embed_color_light: "#f1ece2" },
  levels: [],
  modules: new Map(),
  commandOverrides: new Map(),
  messages: new Map(),
} as unknown as GuildSettings;

function member(permissions: bigint[]): GuildMember {
  return {
    id: "300000000000000001",
    guild: { name: "Néa Hélikè" },
    roles: { cache: new Map() },
    permissions: { has: (permission: bigint) => permissions.includes(PermissionFlagsBits.Administrator) || permissions.includes(permission) },
  } as unknown as GuildMember;
}

const text = (payload: ReturnType<typeof renderHelp>) => JSON.stringify(payload.embeds?.map(embed => embed.toJSON()));

describe("aide", () => {
  it("ne montre à un joueur que les commandes qu'il peut utiliser", () => {
    const content = text(renderHelp({ settings, member: member([]) }));
    expect(content).toContain("/candidature");
    expect(content).toContain("/aide");
    expect(content).not.toContain("/config");
    expect(content).not.toContain("/logs");
    expect(content).not.toContain("/embed");
  });

  it("montre tout à un administrateur", () => {
    const content = text(renderHelp({ settings, member: member([PermissionFlagsBits.Administrator]) }));
    for (const name of ["/config", "/logs", "/embed", "/candidature"]) expect(content).toContain(name);
  });

  it("détaille un module avec des exemples en slash et en préfixe", () => {
    const content = text(renderHelp({ settings, member: member([]) }, { module: "site" }));
    expect(content).toContain("/candidature");
    expect(content).not.toContain("/candidature statut");
    expect(content).toContain("+candidature");
  });

  it("refuse un module sans commande accessible", () => {
    expect(() => renderHelp({ settings, member: member([]) }, { module: "logs" })).toThrow("aucune commande");
  });
});
