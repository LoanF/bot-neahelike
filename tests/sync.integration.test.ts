import { afterAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Synchronisation des rangs contre une vraie base où le schéma du site a été migré.
 * Lancés seulement si TEST_DATABASE_URL est défini : jamais la base de production.
 */
const url = process.env.TEST_DATABASE_URL;
const STAFF = "800000000000000001";
const RECRUTEUR = "800000000000000002";
const USER = "900000000000000001";
const UNKNOWN = "900000000000000099";

describe.skipIf(!url)("synchronisation des rangs", async () => {
  Object.assign(process.env, {
    DATABASE_URL: url,
    DISCORD_BOT_TOKEN: "test",
    DISCORD_GUILD_ID: "100000000000000001",
    SITE_URL: "https://example.test",
    DISCORD_ROLE_STAFF: `${STAFF},800000000000000003`,
    DISCORD_ROLE_RECRUTEUR: RECRUTEUR,
  });

  const { syncUser } = await import("@/modules/site/sync");
  const { sql, closeDatabase } = await import("@/db");

  const member = (roles: string[]) => ({ id: USER, roles, username: "kallias", globalName: "Kallias", avatar: null });
  const events = () => sql()<{ type: string; data: Record<string, unknown> }[]>`select type, data from events where subject_id = ${USER} order by type`;
  const account = async () => (await sql()<{ rank: string; in_guild: boolean; username: string }[]>`select rank, in_guild, username from users where id = ${USER}`)[0];

  async function clean() {
    await sql()`delete from events where subject_id in (${USER}, ${UNKNOWN})`;
    await sql()`delete from users where id in (${USER}, ${UNKNOWN})`;
  }

  beforeEach(async () => {
    await clean();
    await sql()`insert into users (id, username) values (${USER}, 'ancien-nom')`;
  });

  afterAll(async () => {
    await clean();
    await closeDatabase();
  });

  it("donne le rang staff dès qu'un des rôles de la liste est porté, et journalise", async () => {
    const result = await syncUser(USER, member(["autre", STAFF]));
    expect(result).toMatchObject({ rank: "staff", inGuild: true, previousRank: "joueur", presence: "rejoint" });
    expect(await account()).toEqual({ rank: "staff", in_guild: true, username: "kallias" });
    expect(await events()).toEqual([
      { type: "discord.rejoint", data: {} },
      { type: "rang.change", data: { avant: "joueur", apres: "staff" } },
    ]);
  });

  it("n'écrit aucun événement quand rien ne change", async () => {
    await syncUser(USER, member([RECRUTEUR]));
    const result = await syncUser(USER, member([RECRUTEUR]));
    expect(result).toEqual({ rank: "recruteur", inGuild: true });
    expect(await events()).toHaveLength(2);
  });

  it("repasse joueur et absent quand le membre quitte le serveur", async () => {
    await syncUser(USER, member([STAFF]));
    const result = await syncUser(USER, null);
    expect(result).toMatchObject({ rank: "joueur", inGuild: false, previousRank: "staff", presence: "quitte" });
    expect(await account()).toMatchObject({ rank: "joueur", in_guild: false });
  });

  it("n'écrit l'événement qu'une fois en cas de synchronisations simultanées", async () => {
    await Promise.all([syncUser(USER, member([STAFF])), syncUser(USER, member([STAFF])), syncUser(USER, member([STAFF]))]);
    expect((await events()).filter(event => event.type === "rang.change")).toHaveLength(1);
  });

  it("au démarrage, ne corrige que les comptes en écart et marque tous les comptes comme vérifiés", async () => {
    const { Collection } = await import("discord.js");
    const { resyncGuild } = await import("@/modules/site/sync");
    const OTHER = UNKNOWN;
    // USER est noté staff mais n'a plus le rôle ; OTHER est noté présent mais a quitté le serveur.
    await sql()`update users set rank = 'staff', in_guild = true where id = ${USER}`;
    await sql()`insert into users (id, username, in_guild) values (${OTHER}, 'parti', true)`;

    const discordMember = { id: USER, roles: { cache: new Collection([["autre", {}]]) }, user: { username: "kallias", globalName: "Kallias", avatar: null } };
    const guild = { members: { fetch: async () => new Collection([[USER, discordMember]]) } };

    const report = await resyncGuild(guild as never);
    const corrected = Object.fromEntries(report.updated.filter(item => [USER, OTHER].includes(item.userId)).map(item => [item.userId, item.result]));
    expect(corrected[USER]).toMatchObject({ rank: "joueur", previousRank: "staff" });
    expect(corrected[OTHER]).toMatchObject({ inGuild: false, presence: "quitte" });

    const unchecked = await sql()`select id from users where id in (${USER}, ${OTHER}) and roles_synced_at is null`;
    expect(unchecked).toHaveLength(0);

    // Deuxième passage : plus rien à corriger.
    const again = await resyncGuild(guild as never);
    expect(again.updated.filter(item => [USER, OTHER].includes(item.userId))).toHaveLength(0);
  });

  it("ne crée jamais de compte pour un membre absent du site", async () => {
    expect(await syncUser(UNKNOWN, { ...member([STAFF]), id: UNKNOWN })).toBeNull();
    expect(await sql()`select 1 from users where id = ${UNKNOWN}`).toHaveLength(0);
  });
});
