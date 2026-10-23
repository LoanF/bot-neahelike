import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { GuildSettings } from "@/config/store";
import { parseModuleSettings } from "@/config/module-settings";
import { logSettings } from "@/modules/logs/settings";
import { ticketSettings } from "@/modules/tickets/settings";

const schema = z.object({
  salon: z.string().regex(/^\d{17,20}$/).optional(),
  roles: z.array(z.string().regex(/^\d{17,20}$/)).max(3).default([]),
  salons: z.record(z.string(), z.string().regex(/^\d{17,20}$/)).default({}),
  actif: z.boolean().default(true),
});

const ID = "600000000000000001";
const settingsWith = (module: string, raw: unknown) => ({ modules: new Map([[module, { enabled: true, levelId: null, settings: raw }]]) }) as unknown as GuildSettings;

describe("réglages des modules lus en base", () => {
  it("rend les réglages valides tels quels", () => {
    expect(parseModuleSettings("test", schema, { salon: ID, roles: [ID], actif: false })).toEqual({ salon: ID, roles: [ID], salons: {}, actif: false });
  });

  it("n'ignore que le champ invalide, pas tout le réglage", () => {
    expect(parseModuleSettings("test", schema, { salon: "pas un id", roles: [ID], actif: false })).toEqual({ roles: [ID], salons: {}, actif: false });
  });

  it("garde les éléments valides d'une liste ou d'un dictionnaire", () => {
    const parsed = parseModuleSettings("test", schema, { roles: [ID, "abc", ID], salons: { messages: ID, membres: "x" } });
    expect(parsed.roles).toEqual([ID, ID]);
    expect(parsed.salons).toEqual({ messages: ID });
  });

  it("revient aux valeurs par défaut pour une valeur qui n'est pas un objet ou une liste trop longue", () => {
    expect(parseModuleSettings("test", schema, "cassé")).toEqual({ roles: [], salons: {}, actif: true });
    expect(parseModuleSettings("test", schema, { roles: [ID, ID, ID, ID], actif: false })).toEqual({ roles: [], salons: {}, actif: false });
  });

  it("logs : un salon invalide n'efface plus les autres", () => {
    expect(logSettings(settingsWith("logs", { salons: { "message-supprime": ID, "message-modifie": "invalide" } })).salons).toEqual({ "message-supprime": ID });
  });

  it("tickets : une catégorie invalide n'efface plus les catégories personnalisées", () => {
    const good = ticketSettings(settingsWith("tickets", {})).categories[0]!;
    const custom = { ...good, id: "custom01", label: "Ma catégorie" };
    const parsed = ticketSettings(settingsWith("tickets", { categories: [custom, { ...custom, id: "bad", label: "x".repeat(200) }] }));
    expect(parsed.categories.map(category => category.label)).toEqual(["Ma catégorie"]);
  });
});
