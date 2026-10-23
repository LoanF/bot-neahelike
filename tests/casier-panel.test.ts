import { describe, expect, it } from "vitest";
import type { GuildSettings } from "@/config/store";
import type { Payload } from "@/core/context";
import { casierView } from "@/modules/moderation/casier";
import type { Sanction } from "@/modules/moderation/store";

const settings = {
  guildId: "100000000000000001",
  config: { embed_color: "#d1a64a", embed_color_dark: "#1a150f", embed_color_light: "#f1ece2" },
  modules: new Map(),
  messages: new Map(),
} as unknown as GuildSettings;
const view = { settings, owner: "300000000000000001" };

const sanction = (patch: Partial<Sanction>): Sanction =>
  ({
    id: "00000000-0000-4000-8000-000000000001",
    guild_id: settings.guildId,
    number: 1,
    user_id: "900000000000000001",
    moderator_id: "300000000000000002",
    type: "avertissement",
    reason: "Spam",
    ends_at: null,
    revoked_at: null,
    revoked_by_id: null,
    revoke_reason: null,
    created_at: "2026-10-20 10:00:00+00",
    ...patch,
  }) as Sanction;

const components = (payload: Payload) => (payload.components ?? []).map(item => item.toJSON().components).flat() as { custom_id?: string; label?: string; options?: { value: string; label: string }[]; default_values?: { id: string }[] }[];

describe("panneau du casier", () => {
  it("sans membre : invite à choisir, pas de menu de retrait", () => {
    const payload = casierView(view, null);
    expect(payload.embeds![0]!.toJSON().description).toContain("Choisissez un membre");
    const items = components(payload);
    expect(items[0]).toMatchObject({ custom_id: "cas:300000000000000001:membre" });
    expect(items[0]!.default_values).toBeUndefined();
    expect(items.map(item => item.label).filter(Boolean)).toEqual(["Saisir un ID", "Aide", "Fermer"]);
  });

  it("avec un membre : casier, membre présélectionné, retrait limité aux sanctions non levées", () => {
    const target = {
      user: { id: "900000000000000001", tag: "theron" },
      sanctions: [sanction({ number: 3, type: "bannissement", reason: "Triche" }), sanction({ number: 2, revoked_at: "2026-10-21 10:00:00+00" }), sanction({ number: 1 })],
      counts: { avertissement: 1, exclusion: 0, expulsion: 0, bannissement: 1 },
    };
    const payload = casierView({ ...view, notice: "Sanction **#2** retirée." }, target);
    expect(payload.content).toContain("Sanction **#2** retirée.");
    expect(payload.embeds![0]!.toJSON().title).toBe("⚖️ Casier de theron");
    const items = components(payload);
    expect(items[0]!.default_values).toEqual([{ id: "900000000000000001", type: "user" }]);
    expect(items[1]).toMatchObject({ custom_id: "cas:300000000000000001:retirer:900000000000000001" });
    expect(items[1]!.options!.map(option => [option.value, option.label])).toEqual([
      ["3", "#3 Bannissement"],
      ["1", "#1 Avertissement"],
    ]);
  });

  it("casier sans sanction à retirer : pas de menu vide", () => {
    const target = { user: { id: "900000000000000001", tag: "theron" }, sanctions: [], counts: { avertissement: 0, exclusion: 0, expulsion: 0, bannissement: 0 } };
    expect(components(casierView(view, target)).some(item => item.custom_id?.includes(":retirer:"))).toBe(false);
  });
});
