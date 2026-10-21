import { describe, expect, it } from "vitest";
import type { GuildSettings } from "@/config/store";
import { byChannel, logSettings } from "@/modules/logs/settings";

const withSettings = (settings: unknown) =>
  ({ modules: new Map([["logs", { enabled: true, levelId: null, settings }]]) }) as unknown as GuildSettings;

describe("réglages des logs", () => {
  it("garde les types connus et ignore le reste", () => {
    const result = logSettings(withSettings({ salons: { "message-supprime": "100000000000000001", inconnu: "100000000000000002" } }));
    expect(result.salons).toEqual({ "message-supprime": "100000000000000001" });
  });

  it("tolère des réglages absents ou invalides", () => {
    expect(logSettings(withSettings(undefined)).salons).toEqual({});
    expect(logSettings(withSettings({ salons: { "message-supprime": "pas-un-id" } })).salons).toEqual({});
  });

  it("regroupe les types par salon dans l'ordre de la liste", () => {
    const groups = byChannel({ vocal: "1", "message-modifie": "1", "message-supprime": "1", arrivee: "2" });
    expect([...groups.entries()]).toEqual([
      ["1", ["message-supprime", "message-modifie", "vocal"]],
      ["2", ["arrivee"]],
    ]);
  });
});
