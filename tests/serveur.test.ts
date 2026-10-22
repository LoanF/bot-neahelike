import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Guild } from "discord.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { GuildSettings } from "@/config/store";
import type { Payload } from "@/core/context";
import { Registry, setRegistry } from "@/core/registry";

describe("vie du serveur", async () => {
  Object.assign(process.env, {
    DATABASE_URL: "postgresql://localhost/inutilise",
    DISCORD_BOT_TOKEN: "test",
    DISCORD_GUILD_ID: "100000000000000001",
    SITE_URL: "https://example.test",
    DISCORD_ROLE_HELIKEEN: "700000000000000002",
  });
  const { modules } = await import("@/modules");
  setRegistry(new Registry(modules));
  const { counterName, parseAddress, parseDynamic, stripColors, supports, voiceName } = await import("@/modules/serveur/settings");
  const { counterValues, fetchFivem, statusPayload } = await import("@/modules/serveur/live");
  const { parseJoinLink, renderServerPanel } = await import("@/modules/serveur/panel");

  const settingsWith = (server: unknown) =>
    ({
      guildId: "100000000000000001",
      config: { embed_color: "#d1a64a", embed_color_dark: "#1a150f", embed_color_light: "#f1ece2" },
      levels: [],
      modules: new Map([["serveur", { enabled: true, levelId: null, settings: server }]]),
      commandOverrides: new Map(),
      messages: new Map(),
    }) as unknown as GuildSettings;

  const guild = {
    id: "100000000000000001",
    name: "Néa Hélikè",
    memberCount: 120,
    channels: { cache: new Map() },
    roles: { cache: new Map([["700000000000000002", { members: { size: 37 } }]]) },
  } as unknown as Guild;

  function checkLimits(payload: Payload) {
    const rows = (payload.components ?? []).map(row => row.toJSON().components);
    const ids = rows.flat().map(component => ("custom_id" in component ? component.custom_id : ""));
    expect(new Set(ids.filter(Boolean)).size).toBe(ids.filter(Boolean).length);
    expect(rows.length).toBeLessThanOrEqual(5);
    for (const row of rows) expect(row.length).toBeLessThanOrEqual(5);
  }

  it("lit une adresse FiveM, avec le port 30120 par défaut", () => {
    expect(parseAddress("51.75.12.34")).toEqual({ host: "51.75.12.34", port: 30120 });
    expect(parseAddress(" http://Play.Example.fr:30125/ ")).toEqual({ host: "play.example.fr", port: 30125 });
    expect(() => parseAddress("pas une adresse !")).toThrow("Adresse invalide");
    expect(() => parseAddress("1.2.3.4:99999")).toThrow("Adresse invalide");
  });

  it("lit dynamic.json et compte une réponse inattendue comme hors ligne", () => {
    expect(parseDynamic({ clients: 12, sv_maxclients: 64, hostname: "^1Néa ^7Hélikè" })).toEqual({ online: true, players: 12, max: 64, hostname: "Néa Hélikè" });
    expect(parseDynamic({ error: "nope" })).toEqual({ online: false, players: 0, max: 0 });
    expect(parseDynamic(null)).toEqual({ online: false, players: 0, max: 0 });
    expect(stripColors("^2Vert^0")).toBe("Vert");
  });

  describe("interrogation d'un vrai serveur HTTP", () => {
    let server: Server;
    let port = 0;
    beforeAll(async () => {
      server = createServer((request, response) => {
        if (request.url === "/dynamic.json") {
          response.setHeader("content-type", "application/json");
          response.end(JSON.stringify({ clients: 7, sv_maxclients: 48, hostname: "Néa Hélikè" }));
        } else {
          response.statusCode = 404;
          response.end();
        }
      });
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
      port = (server.address() as AddressInfo).port;
    });
    afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));

    it("renvoie le nombre de joueurs d'un serveur en ligne", async () => {
      expect(await fetchFivem(`127.0.0.1:${port}`)).toEqual({ online: true, players: 7, max: 48, hostname: "Néa Hélikè" });
    });

    it("compte un serveur injoignable comme hors ligne, sans lever d'erreur", async () => {
      server.closeAllConnections();
      expect(await fetchFivem("127.0.0.1:1")).toEqual({ online: false, players: 0, max: 0 });
    });
  });

  it("nomme les compteurs et les vocaux en restant sous 100 caractères", () => {
    expect(counterName("👥 Membres : {n}", 120)).toBe("👥 Membres : 120");
    expect(counterName(`${"x".repeat(98)} {n}`, 1000)).toHaveLength(100);
    expect(voiceName(undefined, { displayName: "Kallias", username: "kallias" })).toBe("🔊 Vocal de Kallias");
    expect(voiceName("Salon de {user.tag}", { displayName: "Kallias", username: "kallias" })).toBe("Salon de kallias");
  });

  it("calcule les compteurs : membres, citoyens portant le rôle, joueurs du dernier statut", () => {
    expect(counterValues(guild)).toMatchObject({ membres: 120, citoyens: 37 });
  });

  it("donne le rôle soutien au tag du serveur ou au texte du statut, selon les réglages", () => {
    const tagged = { guildId: guild.id, primaryGuild: { identityGuildId: guild.id, identityEnabled: true }, customStatus: null };
    const otherTag = { guildId: guild.id, primaryGuild: { identityGuildId: "999", identityEnabled: true }, customStatus: "Joue sur discord.gg/NeaHelike" };
    expect(supports({ soutienTag: true }, tagged)).toBe(true);
    expect(supports({ soutienTag: false }, tagged)).toBe(false);
    expect(supports({ soutienTag: true }, { ...tagged, primaryGuild: { identityGuildId: guild.id, identityEnabled: false } })).toBe(false);
    expect(supports({ soutienTag: true }, otherTag)).toBe(false);
    expect(supports({ soutienTexte: "discord.gg/neahelike" }, otherTag)).toBe(true);
    expect(supports({ soutienTexte: "discord.gg/neahelike" }, { guildId: guild.id })).toBe(false);
  });

  it("n'accepte qu'un lien de connexion https", () => {
    expect(parseJoinLink("cfx.re/join/abc123")).toBe("https://cfx.re/join/abc123");
    expect(parseJoinLink(null)).toBeUndefined();
    expect(() => parseJoinLink("http://cfx.re/join/abc")).toThrow("https://");
  });

  it("présente le statut en ligne, hors ligne ou non configuré", () => {
    const checkedAt = new Date("2026-10-22T10:00:00Z");
    const online = statusPayload(settingsWith({}), { fivemAdresse: "1.2.3.4", fivemLien: "https://cfx.re/join/abc" }, { online: true, players: 7, max: 48, checkedAt }, "Néa Hélikè");
    expect(online.embeds![0]!.toJSON().fields?.[0]).toEqual({ name: "Joueurs", value: "7 / 48", inline: true });
    expect(online.components).toHaveLength(1);
    const offline = statusPayload(settingsWith({}), { fivemAdresse: "1.2.3.4" }, { online: false, players: 0, max: 0, checkedAt }, "Néa Hélikè");
    expect(offline.embeds![0]!.toJSON().description).toContain("Hors ligne");
    expect(offline.components).toHaveLength(0);
    expect(statusPayload(settingsWith({}), {}, null, "Néa Hélikè").embeds![0]!.toJSON().description).toContain("Aucune adresse");
  });

  it.each(["accueil", "fivem", "compteurs", "soutien", "vocaux", "publier"])("la vue %s du panneau respecte les limites de Discord", target => {
    checkLimits(renderServerPanel({ settings: settingsWith({ fivemAdresse: "1.2.3.4", compteurs: { membres: { channelId: "600000000000000001", name: "👥 {n}" } } }), guild, owner: "300000000000000001" }, target));
  });
});
