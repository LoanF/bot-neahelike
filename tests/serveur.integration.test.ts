import { afterAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Réglages de la vie du serveur contre une vraie base où le schéma du site a été migré.
 * Lancés seulement si TEST_DATABASE_URL est défini : jamais la base de production.
 */
const url = process.env.TEST_DATABASE_URL;
const GUILD = "100000000000000888";
const VOICE_A = "700000000000000011";
const VOICE_B = "700000000000000012";

describe.skipIf(!url)("réglages de la vie du serveur", async () => {
  Object.assign(process.env, {
    DATABASE_URL: url,
    DISCORD_BOT_TOKEN: "test",
    DISCORD_GUILD_ID: GUILD,
    SITE_URL: "https://example.test",
  });

  const { sql, closeDatabase } = await import("@/db");
  const store = await import("@/config/store");
  const { saveServerSettings, serverSettings } = await import("@/modules/serveur/settings");

  async function clean() {
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

  it("un réglage du panneau n'efface pas un vocal temporaire créé entre-temps", async () => {
    // Le panneau a été ouvert avant la création du salon : ses réglages ne le connaissent pas.
    const stale = await store.getSettings(GUILD);
    const current = await store.getSettings(GUILD);
    await saveServerSettings(current, { ...serverSettings(current), vocalTemporaires: [VOICE_A] }, { temporaries: true });

    await saveServerSettings(stale, { ...serverSettings(stale), vocalNom: "Salon de {user.name}" });
    const saved = serverSettings(await store.getSettings(GUILD));
    expect(saved).toMatchObject({ vocalNom: "Salon de {user.name}", vocalTemporaires: [VOICE_A] });
  });

  it("la liste des vocaux s'écrit telle quelle quand c'est elle qui change", async () => {
    const settings = await store.getSettings(GUILD);
    await saveServerSettings(settings, { vocalTemporaires: [VOICE_A, VOICE_B] }, { temporaries: true });
    await saveServerSettings(await store.getSettings(GUILD), { vocalTemporaires: [VOICE_B] }, { temporaries: true });
    expect(serverSettings(await store.getSettings(GUILD)).vocalTemporaires).toEqual([VOICE_B]);
  });
});
