import { describe, expect, it } from "vitest";
import { baseVars, renderTemplate } from "@/core/templates";

describe("renderTemplate", () => {
  it("remplace les variables connues", () => {
    expect(renderTemplate("Bienvenue {user} sur {server} !", { user: "<@1>", server: "Néa Hélikè" })).toBe("Bienvenue <@1> sur Néa Hélikè !");
  });

  it("laisse les variables inconnues telles quelles", () => {
    expect(renderTemplate("{inconnue} et {user}", { user: "A" })).toBe("{inconnue} et A");
  });

  it("ignore la casse du nom de variable", () => {
    expect(renderTemplate("{SERVER}", { server: "Néa" })).toBe("Néa");
  });

  it("garde les accolades qui ne sont pas des variables", () => {
    expect(renderTemplate("{ } {1abc}", {})).toBe("{ } {1abc}");
  });
});

describe("baseVars", () => {
  it("construit les variables du membre, du serveur et du salon", () => {
    const vars = baseVars({
      user: { id: "42", username: "kallias", displayName: "Kallias" },
      guild: { name: "Néa Hélikè", memberCount: 128 },
      channelId: "7",
    });
    expect(renderTemplate("{user} {user.name} {user.tag} {user.id} {server} {count} {channel}", vars)).toBe(
      "<@42> Kallias kallias 42 Néa Hélikè 128 <#7>",
    );
  });
});
