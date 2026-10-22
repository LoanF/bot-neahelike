import { afterAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Giveaways contre une vraie base où les tables du site ont été migrées.
 * Lancés seulement si TEST_DATABASE_URL est défini : jamais la base de production.
 */
const url = process.env.TEST_DATABASE_URL;
const GUILD = "100000000000000777";

describe.skipIf(!url)("giveaways en base", async () => {
  Object.assign(process.env, {
    DATABASE_URL: url,
    DISCORD_BOT_TOKEN: "test",
    DISCORD_GUILD_ID: GUILD,
    SITE_URL: "https://example.test",
  });

  const { sql, closeDatabase } = await import("@/db");
  const store = await import("@/modules/giveaways/store");

  async function clean() {
    await sql()`delete from bot_giveaways where guild_id = ${GUILD}`;
  }

  const create = async (endsInMs = 60_000, published = true) => {
    const giveaway = await store.createGiveaway({
      guildId: GUILD,
      channelId: "600000000000000001",
      prize: "Lot",
      description: null,
      winnerCount: 1,
      requiredRoleId: null,
      hostId: "300000000000000001",
      endsAt: new Date(Date.now() + endsInMs),
    });
    if (published) await store.setGiveawayMessage(giveaway.id, `61${String(Math.floor(Math.random() * 1e15)).padStart(16, "0")}`);
    return (await store.giveawayById(giveaway.id))!;
  };

  beforeEach(clean);
  afterAll(async () => {
    await clean();
    await closeDatabase();
  });

  it("inscrit puis désinscrit un membre au second clic", async () => {
    const giveaway = await create();
    expect(await store.toggleEntry(giveaway.id, "u1")).toEqual({ entered: true, count: 1 });
    expect(await store.toggleEntry(giveaway.id, "u2")).toEqual({ entered: true, count: 2 });
    expect(await store.toggleEntry(giveaway.id, "u1")).toEqual({ entered: false, count: 1 });
    expect(await store.entriesOf(giveaway.id)).toEqual(["u2"]);
  });

  it("refuse les inscriptions après l'échéance ou la clôture", async () => {
    const expired = await create(-1000);
    expect(await store.toggleEntry(expired.id, "u1")).toBeNull();
    const closed = await create();
    await store.finishGiveaway(closed.id, []);
    expect(await store.toggleEntry(closed.id, "u1")).toBeNull();
  });

  it("ne liste à tirer que les giveaways publiés et échus", async () => {
    const due = await create(-1000);
    await create(60_000);
    await create(-1000, false);
    expect((await store.dueGiveaways(GUILD)).map(item => item.id)).toEqual([due.id]);
  });

  it("ne clôt qu'une fois, même avec deux tirages simultanés", async () => {
    const giveaway = await create(-1000);
    const results = await Promise.all([store.finishGiveaway(giveaway.id, ["u1"]), store.finishGiveaway(giveaway.id, ["u2"])]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await store.dueGiveaways(GUILD)).toEqual([]);
  });

  it("relance seulement un giveaway terminé, et annule seulement un giveaway en cours", async () => {
    const running = await create();
    expect(await store.setWinners(running.id, ["u9"])).toBeUndefined();
    expect((await store.cancelGiveaway(running.id))?.status).toBe("annule");
    expect(await store.cancelGiveaway(running.id)).toBeUndefined();

    const finished = await create(-1000);
    await store.finishGiveaway(finished.id, ["u1"]);
    expect((await store.setWinners(finished.id, ["u2"]))?.winner_ids).toEqual(["u2"]);
  });

  it("retrouve un giveaway par son message et ne retire qu'un giveaway jamais publié", async () => {
    const published = await create();
    expect((await store.giveawayByMessage(GUILD, published.message_id!))?.id).toBe(published.id);
    const unpublished = await create(60_000, false);
    await store.dropGiveaway(unpublished.id);
    expect(await store.giveawayById(unpublished.id)).toBeUndefined();
    await store.dropGiveaway(published.id);
    expect(await store.giveawayById(published.id)).toBeDefined();
  });

  it("supprime les participations avec le giveaway", async () => {
    const giveaway = await create();
    await store.toggleEntry(giveaway.id, "u1");
    await clean();
    expect(await sql()`select 1 from bot_giveaway_entries where giveaway_id = ${giveaway.id}`).toHaveLength(0);
  });
});
