import { DiscordAPIError, RESTJSONErrorCodes, type Guild, type GuildMember, type User } from "discord.js";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Casier de modération contre une vraie base où la table du site a été migrée.
 * Discord est simulé ; lancés seulement si TEST_DATABASE_URL est défini, jamais sur la production.
 */
const url = process.env.TEST_DATABASE_URL;
const GUILD = "100000000000000999";
const MOD = "300000000000000010";
const TARGET = "300000000000000020";

const unknownBan = () => new DiscordAPIError({ code: RESTJSONErrorCodes.UnknownBan, message: "Unknown Ban" }, RESTJSONErrorCodes.UnknownBan, 404, "GET", "/bans", {});

describe.skipIf(!url)("casier de modération", async () => {
  Object.assign(process.env, { DATABASE_URL: url, DISCORD_BOT_TOKEN: "test", DISCORD_GUILD_ID: GUILD, SITE_URL: "https://example.test" });

  const { sql, closeDatabase } = await import("@/db");
  const { Registry, setRegistry } = await import("@/core/registry");
  const { modules } = await import("@/modules");
  setRegistry(new Registry(modules));
  const store = await import("@/config/store");
  const actions = await import("@/modules/moderation/actions");
  const sanctions = await import("@/modules/moderation/store");

  /** Faux serveur Discord : garde la trace des appels, peut refuser une expulsion. */
  function fakeGuild(options: { failKick?: boolean; targetTop?: number } = {}) {
    const calls: string[] = [];
    const banned = new Set<string>();
    const target = {
      id: TARGET,
      roles: { highest: { position: options.targetTop ?? 1 } },
      kickable: true,
      moderatable: true,
      bannable: true,
      kick: async () => {
        if (options.failKick) throw new Error("Missing Permissions");
        calls.push("kick");
      },
      timeout: async (ms: number | null) => calls.push(`timeout:${ms}`),
      isCommunicationDisabled: () => true,
    };
    const guild = {
      id: GUILD,
      name: "Test",
      ownerId: "300000000000000001",
      client: { user: { id: "300000000000000099" } },
      members: { me: { roles: { highest: { position: 50 } } }, cache: new Map([[TARGET, target]]), fetch: async () => null },
      bans: {
        fetch: async ({ user }: { user: string }) => {
          if (!banned.has(user)) throw unknownBan();
          return {};
        },
        create: async (user: string) => {
          calls.push(`ban:${user}`);
          banned.add(user);
        },
        remove: async (user: string) => {
          if (!banned.delete(user)) throw unknownBan();
          calls.push(`unban:${user}`);
        },
      },
      channels: { cache: new Map() },
    } as unknown as Guild;
    const actor = { id: MOD, guild, user: { tag: "moderateur" }, roles: { highest: { position: 10 } } } as unknown as GuildMember;
    const user = { id: TARGET, tag: "cible", send: async () => calls.push("mp") } as unknown as User;
    return { guild, actor, user, calls, banned };
  }

  async function clean() {
    await sql()`delete from bot_sanctions where guild_id = ${GUILD}`;
    await sql()`delete from bot_modules where guild_id = ${GUILD}`;
    await sql()`delete from bot_guild_config where guild_id = ${GUILD}`;
  }

  beforeEach(async () => {
    await clean();
    await store.ensureGuild(GUILD);
  });
  afterAll(async () => {
    await clean();
    await closeDatabase();
  });

  it("avertit : message privé, inscription numérotée au casier", async () => {
    const { actor, user, calls } = fakeGuild();
    const first = await actions.sanction("avertissement", { actor, target: user, reason: "Spam" });
    const second = await actions.sanction("avertissement", { actor, target: user, reason: "Insultes" });
    expect(calls).toEqual(["mp", "mp"]);
    expect(second.number).toBe(first.number + 1);
    expect((await sanctions.sanctionsOf(GUILD, TARGET)).map(item => item.reason)).toEqual(["Insultes", "Spam"]);
    expect((await sanctions.countSanctions(GUILD, TARGET)).avertissement).toBe(2);
  });

  it("prévient avant d'expulser, et n'inscrit rien si Discord refuse", async () => {
    const ok = fakeGuild();
    await actions.sanction("expulsion", { actor: ok.actor, target: ok.user, reason: "Comportement" });
    expect(ok.calls).toEqual(["mp", "kick"]);

    await clean();
    await store.ensureGuild(GUILD);
    const refused = fakeGuild({ failKick: true });
    await expect(actions.sanction("expulsion", { actor: refused.actor, target: refused.user, reason: "x" })).rejects.toThrow("Missing Permissions");
    expect(await sanctions.sanctionsOf(GUILD, TARGET)).toEqual([]);
  });

  it("refuse de sanctionner un membre de rang égal ou supérieur, sans rien inscrire", async () => {
    const { actor, user, calls } = fakeGuild({ targetTop: 20 });
    await expect(actions.sanction("avertissement", { actor, target: user, reason: "x" })).rejects.toThrow("égal ou supérieur");
    expect(calls).toEqual([]);
    expect(await sanctions.sanctionsOf(GUILD, TARGET)).toEqual([]);
  });

  it("exclut temporairement avec la durée demandée", async () => {
    const { actor, user, calls } = fakeGuild();
    const timeout = await actions.sanction("exclusion", { actor, target: user, reason: "Flood", durationMs: 600_000 });
    expect(calls).toEqual(["timeout:600000", "mp"]);
    expect(timeout.ends_at).not.toBeNull();
  });

  it("bannit temporairement puis lève le bannissement à échéance, une seule fois", async () => {
    const { guild, actor, user, calls, banned } = fakeGuild();
    const ban = await actions.sanction("bannissement", { actor, target: user, reason: "Triche", durationMs: 60_000 });
    expect(banned.has(TARGET)).toBe(true);
    await expect(actions.sanction("bannissement", { actor, target: user, reason: "encore" })).rejects.toThrow("déjà banni");

    await sql()`update bot_sanctions set ends_at = now() - interval '1 second' where id = ${ban.id}`;
    await actions.liftExpiredBans(guild);
    expect(banned.has(TARGET)).toBe(false);
    expect(calls).toContain(`unban:${TARGET}`);
    expect((await sanctions.sanctionByNumber(GUILD, ban.number))?.revoked_at).not.toBeNull();
    expect(await sanctions.dueTempBans(GUILD)).toEqual([]);
  });

  it("débannit à la main et lève le bannissement définitif du casier", async () => {
    const { guild, actor, user } = fakeGuild();
    const ban = await actions.sanction("bannissement", { actor, target: user, reason: "Triche" });
    expect(await actions.unban(guild, TARGET, MOD, "Appel accepté")).toEqual({ wasBanned: true, revoked: 1 });
    expect((await sanctions.sanctionByNumber(GUILD, ban.number))?.revoke_reason).toBe("Appel accepté");
    expect(await actions.unban(guild, TARGET, MOD, "encore")).toEqual({ wasBanned: false, revoked: 0 });
  });

  it("retire un avertissement par son numéro, une seule fois", async () => {
    const { actor, user } = fakeGuild();
    const warning = await actions.sanction("avertissement", { actor, target: user, reason: "Spam" });
    const removed = await actions.removeSanction(actor, warning, "Erreur de modérateur");
    expect(removed.revoked_by_id).toBe(MOD);
    expect((await sanctions.countSanctions(GUILD, TARGET)).avertissement).toBe(0);
    await expect(actions.removeSanction(actor, warning, "encore")).rejects.toThrow("déjà levée");
  });
});
