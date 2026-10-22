import { describe, expect, it } from "vitest";
import { deletable, parseSlowmode, SnipeStore } from "@/modules/salons/logic";

const DAY = 86_400_000;

describe("outils de salon", () => {
  it("lit le mode lent, 0 ou off pour le retirer, 6 heures au plus", () => {
    expect(parseSlowmode("5s")).toBe(5);
    expect(parseSlowmode("2m")).toBe(120);
    expect(parseSlowmode("off")).toBe(0);
    expect(parseSlowmode("0")).toBe(0);
    expect(() => parseSlowmode("7h")).toThrow("au plus 6 heures");
  });

  it("ne supprime en masse que des messages récents, non épinglés, du membre demandé", () => {
    const now = 100 * DAY;
    const message = (id: string, author: string, ageDays: number, pinned = false) => ({ id, author: { id: author }, createdTimestamp: now - ageDays * DAY, pinned });
    const list = [message("1", "a", 0), message("2", "b", 1), message("3", "a", 2, true), message("4", "a", 20), message("5", "a", 3)];
    expect(deletable(list, 10, undefined, now).map(item => item.id)).toEqual(["1", "2", "5"]);
    expect(deletable(list, 10, "a", now).map(item => item.id)).toEqual(["1", "5"]);
    expect(deletable(list, 1, undefined, now).map(item => item.id)).toEqual(["1"]);
    expect(() => deletable(list, 0, undefined, now)).toThrow("entre 1 et 100");
  });

  it("garde le dernier message supprimé de chaque salon 10 minutes, pas plus", () => {
    const store = new SnipeStore(10 * 60_000);
    const item = (deletedAt: number, content = "bonjour") => ({ authorId: "a", authorTag: "a", avatarUrl: "", content, attachments: [], createdAt: 0, deletedAt });
    store.remember("salon", item(0, "premier"));
    store.remember("salon", item(1000, "second"));
    expect(store.get("salon", 2000)?.content).toBe("second");
    expect(store.get("salon", 1000 + 10 * 60_000 + 1)).toBeUndefined();
    store.remember("vide", item(0, ""));
    expect(store.get("vide", 0)).toBeUndefined();
    store.remember("autre", item(0));
    store.prune(10 * 60_000 + 1);
    expect(store.size).toBe(0);
  });
});
