import type { Guild } from "discord.js";
import { describe, expect, it } from "vitest";
import type { GuildSettings } from "@/config/store";
import { draftOf, hasDraft, renderEmbedPanel } from "@/modules/embeds/panel";

const settings = { config: { embed_color: "#d1a64a", embed_color_dark: "#1a150f", embed_color_light: "#f1ece2" } } as unknown as GuildSettings;
const guild = { name: "Néa Hélikè", roles: { cache: new Map() } } as unknown as Guild;
const OWNER = "300000000000000001";
const view = { settings, guild, owner: OWNER };

describe("panneau du créateur d'embeds", () => {
  it("refuse d'afficher un brouillon qui n'existe pas", () => {
    expect(hasDraft("300000000000000099")).toBe(false);
    expect(() => renderEmbedPanel({ ...view, owner: "300000000000000099" })).toThrow("expiré");
  });

  it.each(["editeur", "publier", "mention", "champs"])("la vue %s respecte les limites de Discord", target => {
    draftOf(OWNER, settings, true);
    const payload = renderEmbedPanel(view, target);
    const rows = (payload.components ?? []).map(row => row.toJSON().components);
    const ids = rows.flat().map(component => ("custom_id" in component ? component.custom_id : ""));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.length).toBeLessThanOrEqual(100);
    for (const row of rows) expect(row.length).toBeLessThanOrEqual(5);
    for (const component of rows.flat()) {
      if ("options" in component) {
        expect(component.options.length).toBeGreaterThan(0);
        expect(component.options.length).toBeLessThanOrEqual(25);
      }
    }
    expect(payload.embeds).toHaveLength(1);
  });

  it("grise Défaire, Refaire et Valider sur un embed vide tout neuf", () => {
    draftOf(OWNER, settings, true);
    const buttons = renderEmbedPanel(view).components![1]!.toJSON().components as { label?: string; disabled?: boolean }[];
    const state = Object.fromEntries(buttons.map(item => [item.label, item.disabled ?? false]));
    expect(state).toMatchObject({ Défaire: true, Refaire: true, Valider: true, Supprimer: false });
  });
});
