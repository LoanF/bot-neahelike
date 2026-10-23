import { PermissionFlagsBits, PermissionsBitField } from "discord.js";
import { describe, expect, it } from "vitest";
import type { GuildSettings } from "@/config/store";
import type { Payload } from "@/core/context";
import { channelState, snipes } from "@/modules/salons/actions";
import { salonView, SLOWMODE_CHOICES } from "@/modules/salons/panel";

const settings = {
  guildId: "100000000000000001",
  config: { embed_color: "#d1a64a", embed_color_dark: "#1a150f", embed_color_light: "#f1ece2" },
  modules: new Map(),
  messages: new Map(),
} as unknown as GuildSettings;

const EVERYONE = "100000000000000001";

function fakeChannel({ deny = [] as bigint[], slowmode = 0, id = "600000000000000001", rules = false } = {}) {
  const overwrites = new Map(deny.length ? [[EVERYONE, { deny: new PermissionsBitField(deny) }]] : []);
  return {
    id,
    name: "general",
    rateLimitPerUser: slowmode,
    permissionOverwrites: { cache: overwrites },
    guild: { id: EVERYONE, roles: { everyone: { id: EVERYONE } }, rulesChannelId: rules ? id : null, publicUpdatesChannelId: null, safetyAlertsChannelId: null, systemChannelId: null, widgetChannelId: null },
    toString: () => `<#${id}>`,
  } as never;
}

const components = (payload: Payload) =>
  (payload.components ?? []).map(item => item.toJSON().components).flat() as { custom_id?: string; label?: string; disabled?: boolean; options?: { value: string; default?: boolean }[] }[];
const byLabel = (payload: Payload, label: string) => components(payload).find(item => item.label === label);
const all = () => true;

describe("panneau /salon", () => {
  it("lit l'état du salon pour @everyone", () => {
    expect(channelState(fakeChannel())).toEqual({ locked: false, hidden: false, slowmode: 0 });
    expect(channelState(fakeChannel({ deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ViewChannel], slowmode: 30 }))).toEqual({ locked: true, hidden: true, slowmode: 30 });
  });

  it("salon ouvert : Verrouiller et Cacher, mode lent présélectionné, dernier supprimé grisé sans message", () => {
    const payload = salonView({ settings, owner: "300000000000000001", allowed: all }, fakeChannel({ slowmode: 30 }));
    const fields = Object.fromEntries((payload.embeds![0]!.toJSON().fields ?? []).map(item => [item.name, item.value]));
    expect(fields).toMatchObject({ Écriture: "🔓 Ouvert", Visibilité: "👁️ Visible", "Mode lent": "30 secondes" });
    expect(byLabel(payload, "Verrouiller")?.custom_id).toBe("sal:300000000000000001:ecriture:600000000000000001");
    expect(byLabel(payload, "Cacher")).toBeDefined();
    expect(byLabel(payload, "Dernier supprimé")?.disabled).toBe(true);
    const slow = components(payload).find(item => item.custom_id?.includes(":lent:"));
    expect(slow?.options?.map(option => Number(option.value))).toEqual(SLOWMODE_CHOICES);
    expect(slow?.options?.find(option => option.default)?.value).toBe("30");
    expect((payload.components ?? []).length).toBeLessThanOrEqual(5);
  });

  it("salon verrouillé et caché : Déverrouiller et Montrer", () => {
    const payload = salonView({ settings, owner: "300000000000000001", allowed: all }, fakeChannel({ deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ViewChannel] }));
    expect(byLabel(payload, "Déverrouiller")).toBeDefined();
    expect(byLabel(payload, "Montrer")).toBeDefined();
  });

  it("grise ce que le membre n'a pas le droit de faire, et Recréer pour un salon réservé", () => {
    const payload = salonView({ settings, owner: "300000000000000001", allowed: name => name === "lock" }, fakeChannel());
    expect(byLabel(payload, "Verrouiller")?.disabled).toBe(false);
    expect(byLabel(payload, "Cacher")?.disabled).toBe(true);
    expect(byLabel(payload, "Supprimer des messages")?.disabled).toBe(true);
    expect(byLabel(payload, "Recréer")?.disabled).toBe(true);
    const rules = salonView({ settings, owner: "300000000000000001", allowed: all }, fakeChannel({ rules: true }));
    expect(byLabel(rules, "Recréer")?.disabled).toBe(true);
    expect(byLabel(salonView({ settings, owner: "300000000000000001", allowed: all }, fakeChannel()), "Recréer")?.disabled).toBe(false);
  });

  it("propose le dernier message supprimé quand il y en a un", () => {
    snipes.remember("600000000000000009", { authorId: "900000000000000001", authorTag: "theron", avatarUrl: "", content: "oups", attachments: [], createdAt: Date.now(), deletedAt: Date.now() });
    const payload = salonView({ settings, owner: "300000000000000001", allowed: all }, fakeChannel({ id: "600000000000000009" }));
    expect(byLabel(payload, "Dernier supprimé")?.disabled).toBe(false);
    expect(payload.embeds![0]!.toJSON().fields?.at(-1)?.value).toContain("<@900000000000000001>");
  });
});
