import { ButtonBuilder, ButtonStyle } from "discord.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GuildSettings } from "@/config/store";
import { DEFAULT_PANEL_TTL_MINUTES, dueAt, isPanel, isTracked, panelTtlMs, TOKEN_LIFETIME_MS, touchPanel, trackPanel } from "@/core/expiry";
import { button, row } from "@/core/panels";

const MIN = 60 * 1000;
const settingsWith = (value?: unknown) => ({ modules: new Map(value === undefined ? [] : [["config", { enabled: true, levelId: null, settings: { panneauxMinutes: value } }]]) }) as unknown as GuildSettings;

describe("effacement des panneaux", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("10 minutes par défaut, réglable, et une valeur inconnue revient au défaut", () => {
    expect(DEFAULT_PANEL_TTL_MINUTES).toBe(10);
    expect(panelTtlMs(settingsWith())).toBe(10 * MIN);
    expect(panelTtlMs(settingsWith(5))).toBe(5 * MIN);
    expect(panelTtlMs(settingsWith(0))).toBe(0);
    expect(panelTtlMs(settingsWith(7))).toBe(10 * MIN);
    expect(panelTtlMs(settingsWith("10"))).toBe(10 * MIN);
  });

  it("ne compte comme panneau qu'une réponse avec un bouton ou un menu, pas un simple lien", () => {
    expect(isPanel({ components: [row(button("cfg:1:aide", "Aide"))] })).toBe(true);
    expect(isPanel({ components: [row(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL("https://example.test").setLabel("Site"))] })).toBe(false);
    expect(isPanel({ embeds: [] })).toBe(false);
  });

  it("ne dépasse jamais la fin du jeton de Discord", () => {
    expect(dueAt(0, 10 * MIN, TOKEN_LIFETIME_MS)).toBe(10 * MIN);
    expect(dueAt(0, 15 * MIN, TOKEN_LIFETIME_MS)).toBe(TOKEN_LIFETIME_MS - 30 * 1000);
    expect(dueAt(0, 15 * MIN, Number.POSITIVE_INFINITY)).toBe(15 * MIN);
  });

  it("efface un panneau resté sans clic, une seule fois", async () => {
    const close = vi.fn(async () => {});
    trackPanel("m1", close, Number.POSITIVE_INFINITY, 10 * MIN, Date.now());
    vi.advanceTimersByTime(10 * MIN - 1);
    expect(close).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(isTracked("m1")).toBe(false);
  });

  it("chaque clic remet le compteur à zéro, avec le nouveau jeton s'il dure plus longtemps", () => {
    const first = vi.fn(async () => {});
    const second = vi.fn(async () => {});
    trackPanel("m2", first, Date.now() + TOKEN_LIFETIME_MS, 10 * MIN, Date.now());
    vi.advanceTimersByTime(8 * MIN);
    touchPanel("m2", 10 * MIN, { close: second, closeBy: Date.now() + TOKEN_LIFETIME_MS }, Date.now());
    vi.advanceTimersByTime(8 * MIN);
    expect(first).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2 * MIN);
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it("un clic sans nouveau jeton garde l'ancien, effacé avant sa fin", () => {
    const close = vi.fn(async () => {});
    trackPanel("m3", close, Date.now() + TOKEN_LIFETIME_MS, 10 * MIN, Date.now());
    vi.advanceTimersByTime(9 * MIN);
    touchPanel("m3", 10 * MIN, undefined, Date.now());
    vi.advanceTimersByTime(6 * MIN - 30 * 1000 - 1);
    expect(close).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("« jamais » ne suit rien et arrête un suivi en cours ; une erreur d'effacement est ignorée", async () => {
    const close = vi.fn(async () => {});
    trackPanel("m4", close, Number.POSITIVE_INFINITY, 0, Date.now());
    expect(isTracked("m4")).toBe(false);
    trackPanel("m5", close, Number.POSITIVE_INFINITY, 10 * MIN, Date.now());
    touchPanel("m5", 0);
    vi.advanceTimersByTime(20 * MIN);
    expect(close).not.toHaveBeenCalled();
    const failing = vi.fn(async () => {
      throw new Error("Unknown Message");
    });
    trackPanel("m6", failing, Number.POSITIVE_INFINITY, MIN, Date.now());
    vi.advanceTimersByTime(MIN);
    await Promise.resolve();
    expect(failing).toHaveBeenCalledTimes(1);
  });
});
