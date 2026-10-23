import type { Guild } from "discord.js";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Candidatures et journal du site contre une vraie base où le schéma du site a été migré.
 * Lancés seulement si TEST_DATABASE_URL est défini : jamais la base de production.
 */
const url = process.env.TEST_DATABASE_URL;
const GUILD = "100000000000000555";
const USER = "900000000000000011";

describe.skipIf(!url)("candidatures et journal du site", async () => {
  Object.assign(process.env, {
    DATABASE_URL: url,
    DISCORD_BOT_TOKEN: "test",
    DISCORD_GUILD_ID: GUILD,
    SITE_URL: "https://example.test",
  });

  const { sql, closeDatabase } = await import("@/db");
  const { Registry, setRegistry } = await import("@/core/registry");
  const { modules } = await import("@/modules");
  setRegistry(new Registry(modules));
  const store = await import("@/config/store");
  const { latestApplication } = await import("@/modules/site/applications");
  const { eventsAfter, pgTime, relayJournal } = await import("@/modules/site/journal");
  const { siteSettings, updateSiteSettings } = await import("@/modules/site/settings");
  const guild = { id: GUILD } as Guild;

  async function clean() {
    await sql()`delete from events where subject_id = ${USER}`;
    await sql()`delete from applications where user_id = ${USER}`;
    await sql()`delete from users where id = ${USER}`;
    await sql()`delete from bot_modules where guild_id = ${GUILD}`;
    await sql()`delete from bot_guild_config where guild_id = ${GUILD}`;
  }

  beforeEach(async () => {
    await clean();
    await sql()`insert into users (id, username) values (${USER}, 'kallias')`;
    await store.ensureGuild(GUILD);
  });

  afterAll(async () => {
    await clean();
    await closeDatabase();
  });

  it("lit la candidature la plus récente du joueur", async () => {
    await sql()`insert into applications (user_id, status, created_at, decided_at) values (${USER}, 'refusee', now() - interval '6 months', now() - interval '5 months')`;
    await sql()`insert into applications (user_id, status, rp) values (${USER}, 'brouillon', ${sql().json({ firstName: "Theron" })})`;
    const application = await latestApplication(USER);
    expect(application?.status).toBe("brouillon");
    expect(application?.rp).toEqual({ firstName: "Theron" });
    expect(await latestApplication("900000000000000099")).toBeUndefined();
  });

  it("démarre à maintenant puis relaie seulement les nouveaux événements relayables, une seule fois", async () => {
    await sql()`insert into events (type, subject_id, created_at) values ('candidature.envoyee', ${USER}, now() - interval '1 day')`;
    expect(await relayJournal(guild)).toBe(0);
    const start = siteSettings(await store.getSettings(GUILD)).journal!;
    expect(start).toBeDefined();
    expect(await eventsAfter(start)).toEqual([]);

    await sql()`insert into events (type, subject_id) values ('candidature.etape', ${USER})`;
    await sql()`insert into events (type, subject_id, data) values ('candidature.refusee', ${USER}, ${sql().json({ criteres: ["lore"] })})`;
    await sql()`insert into events (type, subject_id) values ('entretien.valide', ${USER})`;
    const pending = await eventsAfter(start);
    expect(pending.map(event => event.type)).toEqual(["candidature.refusee", "entretien.valide"]);
    expect(pending[0]!.data).toEqual({ criteres: ["lore"] });

    // Aucun salon configuré : rien n'est envoyé mais le curseur avance.
    expect(await relayJournal(guild)).toBe(2);
    expect(siteSettings(await store.getSettings(GUILD)).journal).toMatchObject({ at: pending[1]!.created_at, id: pending[1]!.id });
    expect(await relayJournal(guild)).toBe(0);
  });

  /** Serveur factice dont le salon de logs staff reçoit (ou refuse) les messages. */
  function staffGuild() {
    const sent: string[] = [];
    let failing = false;
    const channel = {
      isSendable: () => true,
      send: async (payload: { embeds: { toJSON: () => { title?: string } }[] }) => {
        if (failing) throw new Error("Discord indisponible");
        sent.push(payload.embeds[0]!.toJSON().title ?? "");
      },
    };
    const fake = { id: GUILD, channels: { fetch: async () => channel } } as unknown as Guild;
    return { guild: fake, sent, fail: (value: boolean) => void (failing = value) };
  }

  async function withStaffChannel() {
    await relayJournal(guild);
    await updateSiteSettings(await store.getSettings(GUILD), { salonLogs: "600000000000000001" });
  }

  it("n'avance pas le curseur si le salon de logs staff refuse l'envoi : l'événement est retenté", async () => {
    await withStaffChannel();
    const staff = staffGuild();
    await sql()`insert into events (type, subject_id) values ('candidature.envoyee', ${USER})`;
    await sql()`insert into events (type, subject_id) values ('entretien.valide', ${USER})`;
    staff.fail(true);
    expect(await relayJournal(staff.guild)).toBe(0);
    expect(staff.sent).toEqual([]);
    staff.fail(false);
    expect(await relayJournal(staff.guild)).toBe(2);
    expect(staff.sent).toEqual(["📨 Nouvelle candidature", "🏛️ Entretien validé"]);
    expect(await relayJournal(staff.guild)).toBe(0);
  });

  it("relaie une fois un événement validé en retard, antérieur au curseur, et la blacklist", async () => {
    await withStaffChannel();
    const staff = staffGuild();
    await sql()`insert into events (type, subject_id, data) values ('compte.blacklist', ${USER}, ${sql().json({ raison: "Triche" })})`;
    expect(await relayJournal(staff.guild)).toBe(1);
    // Écrit « avant » le dernier événement relayé, mais visible seulement maintenant.
    await sql()`insert into events (type, subject_id, created_at) values ('candidature.validee', ${USER}, now() - interval '30 seconds')`;
    expect(await relayJournal(staff.guild)).toBe(1);
    expect(await relayJournal(staff.guild)).toBe(0);
    expect(staff.sent).toEqual(["⛔ Joueur blacklisté", "✅ Candidature validée"]);
  });

  it("un ancien curseur sans liste des événements récents ne republie rien", async () => {
    await withStaffChannel();
    const staff = staffGuild();
    await sql()`insert into events (type, subject_id) values ('candidature.envoyee', ${USER})`;
    expect(await relayJournal(staff.guild)).toBe(1);
    const { at, id } = siteSettings(await store.getSettings(GUILD)).journal!;
    await updateSiteSettings(await store.getSettings(GUILD), { journal: { at, id } });
    await relayJournal(staff.guild);
    expect(staff.sent).toEqual(["📨 Nouvelle candidature"]);
  });

  it("lit les dates telles que Postgres les écrit", async () => {
    const [row] = await sql()<{ at: string }[]>`select '2026-10-23 20:11:12.123456+00'::timestamptz::text as at`;
    expect(pgTime(row!.at)).toBe(Date.parse("2026-10-23T20:11:12.123Z"));
    expect(pgTime("2026-10-23 20:11:12+02")).toBe(Date.parse("2026-10-23T18:11:12Z"));
  });
});
