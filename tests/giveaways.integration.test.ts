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

  it("ne retire qu'un giveaway jamais publié", async () => {
    const published = await create();
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

  it("reporte le tirage si la liste des membres n'a pas pu être chargée : le giveaway reste en cours", async () => {
    const { drawGiveaway } = await import("@/modules/giveaways/ui");
    const { resetMembersLoading } = await import("@/core/members");
    resetMembersLoading();
    const giveaway = await create(-1000);
    await store.toggleEntry(giveaway.id, "u1").catch(() => null);
    const guild = {
      id: GUILD,
      members: {
        cache: new Map(),
        fetch: async () => {
          throw new Error("Délai dépassé");
        },
      },
      channels: { cache: new Map() },
    } as never;
    await expect(drawGiveaway(guild, giveaway)).rejects.toThrow("tirage est reporté");
    expect((await store.giveawayById(giveaway.id))?.status).toBe("en_cours");
    expect((await store.dueGiveaways(GUILD)).map(item => item.id)).toEqual([giveaway.id]);
    resetMembersLoading();
  });

  describe("publication depuis le panneau", async () => {
    const { publishGiveaway } = await import("@/modules/giveaways/actions");
    const { newDraft } = await import("@/modules/giveaways/logic");
    const settings = { config: { embed_color: "#d1a64a", embed_color_dark: "#1a150f", embed_color_light: "#f1ece2" } } as never;

    function fakeGuild(fail = false) {
      const sent: unknown[] = [];
      const channel = {
        id: "600000000000000001",
        isSendable: () => true,
        permissionsFor: () => ({ has: () => true }),
        send: async (payload: unknown) => {
          if (fail) throw new Error("Missing Access");
          sent.push(payload);
          return { id: `61${String(Date.now()).padStart(16, "0")}`, delete: async () => {} };
        },
        toString: () => "<#600000000000000001>",
      };
      return { guild: { id: GUILD, channels: { cache: new Map([[channel.id, channel]]) }, members: { me: {} } } as never, sent };
    }

    it("publie le brouillon : ligne en base et message avec le bouton Participer", async () => {
      const { guild, sent } = fakeGuild();
      const published = await publishGiveaway(guild, settings, { ...newDraft("600000000000000001"), prize: "Lot du panneau", winners: 3 }, "300000000000000001");
      expect(sent).toHaveLength(1);
      const saved = await store.giveawayById(published.id);
      expect(saved).toMatchObject({ prize: "Lot du panneau", winner_count: 3, status: "en_cours", message_id: published.message_id });
    });

    it("refuse un brouillon incomplet et ne laisse rien si l'envoi échoue", async () => {
      await expect(publishGiveaway(fakeGuild().guild, settings, newDraft("600000000000000001"), "1")).rejects.toThrow("Il manque le lot");
      await expect(publishGiveaway(fakeGuild(true).guild, settings, { ...newDraft("600000000000000001"), prize: "Lot" }, "1")).rejects.toThrow("Publication impossible");
      expect(await sql()`select 1 from bot_giveaways where guild_id = ${GUILD}`).toHaveLength(0);
    });

    it("liste d'abord les giveaways en cours, puis les clos de moins de 7 jours", async () => {
      const running = await create();
      const recent = await create(-1000);
      await store.finishGiveaway(recent.id, []);
      const old = await create(-1000);
      await store.cancelGiveaway(old.id);
      await sql()`update bot_giveaways set ended_at = now() - interval '8 days' where id = ${old.id}`;
      expect((await store.recentGiveaways(GUILD)).map(item => item.id)).toEqual([running.id, recent.id]);
    });
  });
});
