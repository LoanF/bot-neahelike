import { describe, expect, it } from "vitest";
import { customId, parseCustomId } from "@/core/components";

describe("identifiants de composants", () => {
  it("se découpent en préfixe, propriétaire, action et arguments", () => {
    expect(parseCustomId(customId("cfg", "300000000000000001", "go", "niveau", "a:b"))).toEqual({ prefix: "cfg", ownerId: "300000000000000001", action: "go", args: ["niveau", "a", "b"] });
  });

  it("refusent un « : » dans le préfixe, le propriétaire ou l'action, qui décalerait le contrôle du propriétaire", () => {
    expect(() => customId("cfg", "*:300000000000000001", "go")).toThrow("invalide");
    expect(() => customId("c:fg", "300000000000000001", "go")).toThrow("invalide");
    expect(() => customId("cfg", "300000000000000001", "go:x")).toThrow("invalide");
  });

  it("refusent un identifiant de plus de 100 caractères", () => {
    expect(() => customId("cfg", "300000000000000001", "go", "x".repeat(90))).toThrow("trop long");
  });
});
