import { afterAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Synchronisation de la présence contre une vraie base où le schéma du site a été migré.
 * Le rang n'est jamais écrit par le bot : le site le calcule seul.
 * Lancés seulement si TEST_DATABASE_URL est défini : jamais la base de production.
 */
const url = process.env.TEST_DATABASE_URL;
const USER = "900000000000000001";
const UNKNOWN = "900000000000000099";

describe.skipIf(!url)("synchronisation de la présence", async () => {
  Object.assign(process.env, {
    DATABASE_URL: url,
    DISCORD_BOT_TOKEN: "test",
    DISCORD_GUILD_ID: "100000000000000001",
    SITE_URL: "https://example.test",
  });

  const { syncUser } = await import("@/modules/site/sync");
  const { sql, closeDatabase } = await import("@/db");

  const member = (roles: string[] = []) => ({ id: USER, roles, username: "kallias", globalName: "Kallias", avatar: null });
  const events = () => sql()<{ type: string; data: Record<string, unknown> }[]>`select type, data from events where subject_id = ${USER} order by created_at, type`;
  const account = async () =>
    (await sql()<{ rank: string; in_guild: boolean; username: string; roles_synced_at: string | null }[]>`
      select rank, in_guild, username, roles_synced_at from users where id = ${USER}
    `)[0];

  async function clean() {
    await sql()`delete from events where subject_id in (${USER}, ${UNKNOWN})`;
    await sql()`delete from users where id in (${USER}, ${UNKNOWN})`;
  }

  beforeEach(async () => {
    await clean();
    // Compte owner fraîchement synchronisé par le site.
    await sql()`insert into users (id, username, rank, roles_synced_at) values (${USER}, 'ancien-nom', 'owner', now())`;
  });

  afterAll(async () => {
    await clean();
    await closeDatabase();
  });

  it("note l'arrivée et le profil sans jamais toucher au rang", async () => {
    const result = await syncUser(USER, member(["autre"]));
    expect(result).toEqual({ inGuild: true, presence: "rejoint" });
    expect(await account()).toMatchObject({ rank: "owner", in_guild: true, username: "kallias", roles_synced_at: null });
    expect(await events()).toEqual([{ type: "discord.rejoint", data: {} }]);
  });

  it("demande au site de relire le rang quand les rôles changent", async () => {
    await sql()`update users set in_guild = true where id = ${USER}`;
    expect(await syncUser(USER, member(["nouveau-role"]), { rolesChanged: true })).toEqual({ inGuild: true });
    expect(await account()).toMatchObject({ rank: "owner", roles_synced_at: null });
    expect(await events()).toEqual([]);
  });

  it("ne réinitialise rien quand ni les rôles ni la présence ne changent", async () => {
    await sql()`update users set in_guild = true where id = ${USER}`;
    await syncUser(USER, member());
    expect((await account())?.roles_synced_at).not.toBeNull();
    expect(await events()).toEqual([]);
  });

  it("note le départ et laisse le site repasser le rang", async () => {
    await syncUser(USER, member());
    const result = await syncUser(USER, null);
    expect(result).toEqual({ inGuild: false, presence: "quitte" });
    expect(await account()).toMatchObject({ rank: "owner", in_guild: false, roles_synced_at: null });
  });

  it("n'écrit l'événement qu'une fois en cas de synchronisations simultanées", async () => {
    await Promise.all([syncUser(USER, member()), syncUser(USER, member()), syncUser(USER, member())]);
    expect(await events()).toHaveLength(1);
  });

  it("au démarrage, ne corrige que la présence des comptes en écart", async () => {
    const { Collection } = await import("discord.js");
    const { resyncGuild } = await import("@/modules/site/sync");
    // USER est noté absent mais il est là ; UNKNOWN est noté présent mais a quitté le serveur.
    await sql()`insert into users (id, username, in_guild) values (${UNKNOWN}, 'parti', true)`;

    const discordMember = { id: USER, roles: { cache: new Collection([["autre", {}]]) }, user: { username: "kallias", globalName: "Kallias", avatar: null } };
    const guild = { members: { fetch: async () => new Collection([[USER, discordMember]]) } };

    const report = await resyncGuild(guild as never);
    const corrected = Object.fromEntries(report.updated.filter(item => [USER, UNKNOWN].includes(item.userId)).map(item => [item.userId, item.result]));
    expect(corrected).toEqual({ [USER]: { inGuild: true, presence: "rejoint" }, [UNKNOWN]: { inGuild: false, presence: "quitte" } });
    expect((await account())?.rank).toBe("owner");

    const again = await resyncGuild(guild as never);
    expect(again.updated.filter(item => [USER, UNKNOWN].includes(item.userId))).toHaveLength(0);
  });

  it("ne crée jamais de compte pour un membre absent du site", async () => {
    expect(await syncUser(UNKNOWN, { ...member(), id: UNKNOWN })).toBeNull();
    expect(await sql()`select 1 from users where id = ${UNKNOWN}`).toHaveLength(0);
  });
});
