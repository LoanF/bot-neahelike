import { DiscordAPIError, RESTJSONErrorCodes } from "discord.js";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Blacklist contre une vraie base où les tables du site ont été migrées (0017 comprise).
 * Lancés seulement si TEST_DATABASE_URL est défini : jamais la base de production.
 */
const url = process.env.TEST_DATABASE_URL;
const GUILD = "100000000000000003";
const ADMIN = "910000000000000001";
const PLAYER = "910000000000000002";
const OWNER = "910000000000000003";
const ABSENT = "910000000000000004";
const RECRUITER = "910000000000000005";
const IDS = [ADMIN, PLAYER, OWNER, ABSENT, RECRUITER];

const unknown = (code: number) => new DiscordAPIError({ code, message: "Unknown" }, code, 404, "GET", "/", {});

describe.skipIf(!url)("blacklist en base", async () => {
  Object.assign(process.env, {
    DATABASE_URL: url,
    DISCORD_BOT_TOKEN: "test",
    DISCORD_GUILD_ID: GUILD,
    SITE_URL: "https://example.test",
  });

  const { sql, closeDatabase } = await import("@/db");
  const config = await import("@/config/store");
  const store = await import("@/modules/blacklist/store");
  const { blacklistUser, enforceBlacklist, liftBlacklist, requireAdmin } = await import("@/modules/blacklist/actions");
  const { renderBlacklistPanel } = await import("@/modules/blacklist/panel");
  const { PAGE_SIZE } = await import("@/modules/blacklist/logic");

  /** Serveur factice : garde la trace des bannissements et des MP. */
  function fakeGuild({ banFails = false } = {}) {
    const bans = new Set<string>();
    const sent: string[] = [];
    const member = (id: string, position: number) => ({
      id,
      bannable: true,
      roles: { highest: { position } },
      user: { id, tag: `membre-${id}` },
      send: async () => void sent.push(id),
    });
    const members = new Map([
      [ADMIN, member(ADMIN, 10)],
      [PLAYER, member(PLAYER, 1)],
      [RECRUITER, member(RECRUITER, 20)],
    ]);
    const guild = {
      id: GUILD,
      name: "Néa Hélikè",
      ownerId: OWNER,
      client: { user: { id: "999999999999999999" } },
      members: {
        cache: members,
        me: { roles: { highest: { position: 50 } } },
        fetch: async () => {
          throw unknown(RESTJSONErrorCodes.UnknownMember);
        },
      },
      bans: {
        create: async (id: string) => {
          if (banFails) throw new Error("Missing Permissions");
          bans.add(id);
        },
        remove: async (id: string) => {
          if (!bans.delete(id)) throw unknown(RESTJSONErrorCodes.UnknownBan);
        },
      },
    };
    for (const item of members.values()) Object.assign(item, { guild });
    const actor = members.get(ADMIN) as never;
    return { guild: guild as never, actor, bans, sent };
  }

  /** Retire les lignes de ce fichier (IDs 9100…), et seulement elles. */
  async function reset() {
    await sql()`delete from blacklist where discord_id in ${sql()(IDS)}`;
    await sql()`delete from events where subject_id in ${sql()(IDS)}`;
    await sql()`delete from users where id in ${sql()(IDS)}`;
    await sql()`delete from bot_modules where guild_id = ${GUILD}`;
    await sql()`delete from bot_guild_config where guild_id = ${GUILD}`;
  }

  beforeEach(async () => {
    await reset();
    await config.ensureGuild(GUILD);
    await sql()`
      insert into users (id, username, rank) values
        (${ADMIN}, 'admin', 'admin'), (${PLAYER}, 'joueur', 'joueur'), (${OWNER}, 'owner', 'owner'), (${RECRUITER}, 'recruteur', 'recruteur')
    `;
  });
  afterAll(async () => {
    await reset();
    await closeDatabase();
  });

  it("réserve la blacklist aux rangs admin et owner du site", async () => {
    await expect(requireAdmin(ADMIN)).resolves.toBeUndefined();
    await expect(requireAdmin(OWNER)).resolves.toBeUndefined();
    await expect(requireAdmin(RECRUITER)).rejects.toThrow("réservée aux admins");
    await expect(requireAdmin(ABSENT)).rejects.toThrow("réservée aux admins");
  });

  it("blackliste un membre : ligne source bot, événement, MP puis bannissement", async () => {
    const { actor, bans, sent } = fakeGuild();
    const { entry, warnings } = await blacklistUser(actor, PLAYER, "Triche");
    expect(entry).toMatchObject({ discord_id: PLAYER, reason: "Triche", created_by_id: ADMIN, source: "bot" });
    expect(warnings).toEqual([]);
    expect(bans.has(PLAYER)).toBe(true);
    expect(sent).toEqual([PLAYER]);
    const [event] = await sql()`select type, actor_id, data from events where subject_id = ${PLAYER}`;
    expect(event).toMatchObject({ type: "compte.blacklist", actor_id: ADMIN, data: { raison: "Triche" } });
  });

  it("blackliste un ID absent du serveur, sans raison", async () => {
    const { actor, bans, sent } = fakeGuild();
    await blacklistUser(actor, ABSENT, null);
    expect(bans.has(ABSENT)).toBe(true);
    expect(sent).toEqual([]);
    // Pas de compte sur le site : pas d'événement (la clé étrangère de `events` l'interdit).
    expect(await sql()`select 1 from events where subject_id = ${ABSENT}`).toHaveLength(0);
    expect(await store.blacklistEntry(ABSENT)).toMatchObject({ reason: null, source: "bot" });
  });

  it("refuse un doublon, soi-même, un owner et un membre au rôle plus haut", async () => {
    const { actor } = fakeGuild();
    await blacklistUser(actor, PLAYER, null);
    await expect(blacklistUser(actor, PLAYER, "encore")).rejects.toThrow("déjà blacklisté");
    await expect(blacklistUser(actor, ADMIN, null)).rejects.toThrow("vous blacklister vous-même");
    await expect(blacklistUser(actor, OWNER, null)).rejects.toThrow("Un owner ne peut pas être blacklisté");
    await expect(blacklistUser(actor, RECRUITER, null)).rejects.toThrow();
    expect(await store.blacklistEntry(RECRUITER)).toBeUndefined();
  });

  it("garde la ligne et prévient si le bannissement échoue", async () => {
    const { actor } = fakeGuild({ banFails: true });
    const { warnings } = await blacklistUser(actor, PLAYER, null);
    expect(warnings[0]).toContain("bannissement du serveur a échoué");
    expect(await store.blacklistEntry(PLAYER)).toBeDefined();
  });

  it("lève la blacklist : ligne retirée, événement, débannissement ; un ID absent de la table est refusé", async () => {
    const { actor, bans } = fakeGuild();
    await blacklistUser(actor, PLAYER, null);
    const { warnings } = await liftBlacklist(actor, PLAYER);
    expect(warnings).toEqual([]);
    expect(bans.has(PLAYER)).toBe(false);
    expect(await store.blacklistEntry(PLAYER)).toBeUndefined();
    const types = await sql()`select type from events where subject_id = ${PLAYER} order by created_at`;
    expect(types.map(row => row.type)).toEqual(["compte.blacklist", "compte.blacklist_levee"]);
    await expect(liftBlacklist(actor, PLAYER)).rejects.toThrow("n'est pas (ou plus) blacklisté");
  });

  it("lève sans erreur la blacklist d'un ID déjà débanni à la main", async () => {
    const { actor, bans } = fakeGuild();
    await blacklistUser(actor, PLAYER, null);
    bans.clear();
    expect((await liftBlacklist(actor, PLAYER)).warnings).toEqual([]);
  });

  it("bannit de nouveau un blacklisté qui revient ; ignore les autres", async () => {
    const { guild, bans } = fakeGuild();
    await store.addToBlacklist({ discordId: ABSENT, reason: "Site", createdById: ADMIN });
    expect(await enforceBlacklist(guild, ABSENT)).toBe(true);
    expect(bans.has(ABSENT)).toBe(true);
    expect(await enforceBlacklist(guild, PLAYER)).toBe(false);
  });

  it("pagine la liste, la plus récente d'abord, avec le nom du compte du site", async () => {
    await store.addToBlacklist({ discordId: ABSENT, reason: null, createdById: ADMIN });
    await sql()`update blacklist set created_at = now() - interval '1 day' where discord_id = ${ABSENT}`;
    await store.addToBlacklist({ discordId: PLAYER, reason: "Triche", createdById: ADMIN });
    const { entries, total } = await store.blacklistPage(0);
    const mine = entries.filter(item => IDS.includes(item.discord_id));
    expect(mine.map(item => [item.discord_id, item.name])).toEqual([
      [PLAYER, "joueur"],
      [ABSENT, null],
    ]);
    expect(total).toBeGreaterThanOrEqual(2);
    expect(entries.length).toBeLessThanOrEqual(PAGE_SIZE);
  });

  it("ouvre le panneau sur la dernière page si la page demandée n'existe plus", async () => {
    await store.addToBlacklist({ discordId: PLAYER, reason: null, createdById: ADMIN });
    const settings = { config: { embed_color: "#d1a64a", embed_color_dark: "#1a150f", embed_color_light: "#f1ece2" } } as never;
    const payload = await renderBlacklistPanel({ settings, guild: fakeGuild().guild, owner: ADMIN }, 99);
    expect(payload.embeds![0]!.toJSON().footer?.text).toMatch(/page (\d+)\/\1 /);
  });
});
