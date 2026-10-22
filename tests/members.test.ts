import { GatewayRateLimitError, type Guild } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadAllMembers, resetMembersLoading } from "@/core/members";

function fakeGuild(id: string, fetchImpl?: () => Promise<unknown>) {
  const cache = new Map([["1", { id: "1" }]]);
  const fetch = vi.fn(fetchImpl ?? (async () => cache));
  return { guild: { id, members: { cache, fetch } } as unknown as Guild, fetch, cache };
}

describe("chargement partagé des membres", () => {
  beforeEach(() => {
    resetMembersLoading();
    vi.useRealTimers();
  });

  it("ne demande la liste qu'une fois, même à plusieurs modules en même temps", async () => {
    const { guild, fetch, cache } = fakeGuild("10");
    const [a, b] = await Promise.all([loadAllMembers(guild), loadAllMembers(guild)]);
    expect(await loadAllMembers(guild)).toBe(cache);
    expect(a).toBe(cache);
    expect(b).toBe(cache);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("recharge sur demande, mais pas plus d'une fois toutes les 30 secondes", async () => {
    vi.useFakeTimers({ now: 0 });
    const { guild, fetch } = fakeGuild("11");
    await loadAllMembers(guild);
    await loadAllMembers(guild, { refresh: true });
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.setSystemTime(31_000);
    await loadAllMembers(guild, { refresh: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("attend le délai indiqué par Discord puis réessaie une fois", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const limited = new GatewayRateLimitError({ retry_after: 2, opcode: 8, meta: {} } as never, { guild_id: "12" } as never);
    const { guild, fetch, cache } = fakeGuild("12", async () => {
      calls += 1;
      if (calls === 1) throw limited;
      return cache;
    });
    const result = loadAllMembers(guild);
    await vi.advanceTimersByTimeAsync(2500);
    expect(await result).toBe(cache);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("laisse remonter une autre erreur et permet un nouvel essai", async () => {
    const { guild, fetch } = fakeGuild("13", async () => {
      throw new Error("passerelle fermée");
    });
    await expect(loadAllMembers(guild)).rejects.toThrow("passerelle fermée");
    await expect(loadAllMembers(guild)).rejects.toThrow("passerelle fermée");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
