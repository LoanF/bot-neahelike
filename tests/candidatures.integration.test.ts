import type { Guild } from "discord.js";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Candidatures et journal du site contre une vraie base où le schéma du site a été migré.
 * Lancés seulement si TEST_DATABASE_URL est défini : jamais la base de production.
 */
const url = process.env.TEST_DATABASE_URL;
const GUILD = "100000000000000001";
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
  const { eventsAfter, relayJournal } = await import("@/modules/site/journal");
  const { siteSettings } = await import("@/modules/site/settings");
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
    expect(siteSettings(await store.getSettings(GUILD)).journal).toEqual({ at: pending[1]!.created_at, id: pending[1]!.id });
    expect(await relayJournal(guild)).toBe(0);
  });
});
