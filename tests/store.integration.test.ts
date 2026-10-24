import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ladder } from "@/core/permissions";

/**
 * Tests du stockage contre une vraie base, où le schéma du site a été migré.
 * Lancés seulement si TEST_DATABASE_URL est défini : jamais la base de production.
 */
const url = process.env.TEST_DATABASE_URL;
const GUILD = "100000000000000001";

describe.skipIf(!url)("stockage de la configuration", async () => {
  Object.assign(process.env, {
    DATABASE_URL: url,
    DISCORD_BOT_TOKEN: "test",
    DISCORD_GUILD_ID: GUILD,
    SITE_URL: "https://example.test",
  });

  const store = await import("@/config/store");
  const { sql, closeDatabase } = await import("@/db");
  const { checkDatabase } = await import("@/db/check");

  /** Efface le serveur de test (les rôles et réglages de commandes suivent leur niveau en cascade). */
  async function clean() {
    const db = sql();
    await db`delete from bot_permission_levels where guild_id = ${GUILD}`;
    await db`delete from bot_command_permissions where guild_id = ${GUILD}`;
    await db`delete from bot_modules where guild_id = ${GUILD}`;
    await db`delete from bot_messages where guild_id = ${GUILD}`;
    await db`delete from bot_guild_config where guild_id = ${GUILD}`;
  }

  beforeAll(async () => {
    await clean();
    await store.ensureGuild(GUILD);
  });

  afterAll(async () => {
    await clean();
    await closeDatabase();
  });

  it("trouve toutes les tables attendues", async () => {
    await expect(checkDatabase()).resolves.toBeUndefined();
  });

  it("crée la configuration et les trois niveaux par défaut, une seule fois", async () => {
    await store.ensureGuild(GUILD);
    const settings = await store.getSettings(GUILD);
    expect(settings.config.prefix).toBe("+");
    expect(settings.config.embed_color).toBe("#d1a64a");
    expect(typeof settings.config.updated_at).toBe("string");
    expect(settings.levels.map(level => [level.name, level.weight])).toEqual([
      ["Joueur", 10],
      ["Staff", 50],
      ["Admin", 100],
    ]);
  });

  it("met à jour la configuration et vide le cache", async () => {
    await store.updateConfig(GUILD, { prefix: "!", activity_text: "Veille sur Hélikè" });
    const settings = await store.getSettings(GUILD);
    expect(settings.config.prefix).toBe("!");
    expect(settings.config.activity_text).toBe("Veille sur Hélikè");
  });

  it("ne garde pas en cache une lecture commencée avant une modification", async () => {
    await store.updateConfig(GUILD, { prefix: "+" });
    for (let round = 0; round < 5; round++) {
      const reading = store.getSettings(GUILD);
      await store.updateConfig(GUILD, { prefix: round % 2 ? "!" : "?" });
      await reading;
      expect((await store.getSettings(GUILD)).config.prefix).toBe(round % 2 ? "!" : "?");
    }
  });

  it("lie plusieurs rôles à un niveau et remplace la liste", async () => {
    const staffId = (await store.getSettings(GUILD)).levels.find(level => level.name === "Staff")!.id;
    const roles = async () => (await store.getSettings(GUILD)).levels.find(level => level.id === staffId)!.roleIds.sort();

    await store.setLevelRoles(GUILD, staffId, ["r1", "r2", "r2"]);
    expect(await roles()).toEqual(["r1", "r2"]);
    await store.addLevelRole(GUILD, staffId, "r3");
    await store.removeLevelRole(GUILD, staffId, "r1");
    expect(await roles()).toEqual(["r2", "r3"]);
  });

  it("refuse un nom déjà pris ou vide avec un message lisible", async () => {
    await expect(store.createLevel(GUILD, "Staff")).rejects.toThrow("Un autre accès porte déjà ce nom.");
    await expect(store.createLevel(GUILD, "")).rejects.toThrow("entre 1 et 32 caractères");
  });

  it("crée un accès en bas de l'échelle, puis le monte et le descend", async () => {
    const order = async () => ladder((await store.getSettings(GUILD)).levels).map(level => level.name);
    const levelId = await store.createLevel(GUILD, "Citoyen");
    expect(await order()).toEqual(["Admin", "Staff", "Joueur", "Citoyen"]);

    await store.moveLevel(GUILD, levelId, "monter");
    await store.moveLevel(GUILD, levelId, "monter");
    expect(await order()).toEqual(["Admin", "Citoyen", "Staff", "Joueur"]);
    await store.moveLevel(GUILD, levelId, "descendre");
    expect(await order()).toEqual(["Admin", "Staff", "Citoyen", "Joueur"]);

    await store.renameLevel(GUILD, levelId, "Magistrat");
    expect(await order()).toEqual(["Admin", "Staff", "Magistrat", "Joueur"]);
    await store.deleteLevel(GUILD, levelId);
  });

  it("supprimer un accès retire ses rôles et ses réglages, et rend le module à sa valeur par défaut", async () => {
    const levelId = await store.createLevel(GUILD, "Modérateur");
    await store.addLevelRole(GUILD, levelId, "r-modo");
    await store.setCommandLevel(GUILD, "ping", levelId);
    await store.setModuleLevel(GUILD, "general", levelId);

    await store.deleteLevel(GUILD, levelId);
    const settings = await store.getSettings(GUILD);
    expect(settings.levels.some(level => level.id === levelId)).toBe(false);
    expect(settings.commandOverrides.has("ping")).toBe(false);
    expect(settings.modules.get("general")?.levelId).toBeNull();
  });

  it("distingue « tout le monde » de l'absence de réglage", async () => {
    await store.setCommandLevel(GUILD, "aide", null);
    expect((await store.getSettings(GUILD)).commandOverrides.get("aide")).toEqual({ levelId: null });
    await store.resetCommandLevel(GUILD, "aide");
    expect((await store.getSettings(GUILD)).commandOverrides.has("aide")).toBe(false);
  });

  it("active et désactive un module", async () => {
    await store.setModuleEnabled(GUILD, "tickets", false);
    expect((await store.getSettings(GUILD)).modules.get("tickets")?.enabled).toBe(false);
    await store.setModuleEnabled(GUILD, "tickets", true);
    expect((await store.getSettings(GUILD)).modules.get("tickets")?.enabled).toBe(true);
  });

  it("enregistre et rétablit un message personnalisé", async () => {
    await store.setMessage(GUILD, "permission.refusee", "Réservé au rang {niveau}.");
    expect((await store.getSettings(GUILD)).messages.get("permission.refusee")).toBe("Réservé au rang {niveau}.");
    await store.resetMessage(GUILD, "permission.refusee");
    expect((await store.getSettings(GUILD)).messages.has("permission.refusee")).toBe(false);
  });
});
