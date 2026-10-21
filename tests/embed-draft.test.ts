import { describe, expect, it } from "vitest";
import { createState, edit, embedLength, isEmpty, parseColor, parseUrl, redo, setOrClear, undo } from "@/modules/embeds/draft";

const GOLD = 0xd1a64a;
const withTitle = (title: string) => (draft: { embed: object; mention: string | null }) => ({ ...draft, embed: { ...draft.embed, title } });

describe("brouillon d'embed", () => {
  it("commence vide, à la couleur principale", () => {
    const state = createState(GOLD);
    expect(state.current.embed).toEqual({ color: GOLD });
    expect(isEmpty(state.current.embed)).toBe(true);
  });

  it("défait et refait les modifications dans l'ordre", () => {
    let state = createState(GOLD);
    state = edit(state, withTitle("Un"));
    state = edit(state, withTitle("Deux"));
    state = undo(state);
    expect(state.current.embed.title).toBe("Un");
    state = redo(state);
    expect(state.current.embed.title).toBe("Deux");
    expect(redo(state)).toBe(state);
    expect(undo(undo(undo(state))).current.embed.title).toBeUndefined();
  });

  it("une nouvelle modification efface ce qui pouvait être refait", () => {
    let state = edit(edit(createState(GOLD), withTitle("Un")), withTitle("Deux"));
    state = edit(undo(state), withTitle("Trois"));
    expect(state.future).toHaveLength(0);
  });

  it("refuse un embed de plus de 6 000 caractères sans perdre le brouillon", () => {
    const state = createState(GOLD);
    expect(() => edit(state, draft => ({ ...draft, embed: { ...draft.embed, description: "a".repeat(4096), fields: [{ name: "b".repeat(256), value: "c".repeat(1024) }, { name: "d", value: "e".repeat(1000) }] } }))).toThrow("6000");
    expect(state.current.embed).toEqual({ color: GOLD });
  });

  it("compte les caractères comme Discord", () => {
    expect(embedLength({ title: "ab", description: "cde", fields: [{ name: "f", value: "gh" }], footer: { text: "i" }, author: { name: "j" } })).toBe(10);
  });

  it("retire une valeur vide au lieu de l'enregistrer", () => {
    expect(setOrClear({ title: "x", color: 1 }, "title", null)).toEqual({ color: 1 });
  });

  it("comprend les couleurs nommées et les codes", () => {
    expect(parseColor("Or")).toBe(GOLD);
    expect(parseColor("#ff0000")).toBe(0xff0000);
    expect(parseColor("ff0000")).toBe(0xff0000);
    expect(parseColor("arc-en-ciel")).toBeNull();
  });

  it("n'accepte que des images en https", () => {
    expect(parseUrl("https://exemple.fr/a.png", "Image")).toBe("https://exemple.fr/a.png");
    expect(parseUrl(null, "Image")).toBeNull();
    expect(() => parseUrl("http://exemple.fr/a.png", "Image")).toThrow("https://");
  });
});
