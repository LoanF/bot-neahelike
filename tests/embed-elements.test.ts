import type { ModalSubmitInteraction } from "discord.js";
import { describe, expect, it } from "vitest";
import { applyElement } from "@/modules/embeds/panel";

/** Faux formulaire : comme discord.js, lire un champ absent lève une erreur. */
function form(values: Record<string, string>): ModalSubmitInteraction {
  return {
    fields: {
      getTextInputValue: (id: string) => {
        if (!(id in values)) throw new Error(`Champ « ${id} » introuvable dans le formulaire.`);
        return values[id]!;
      },
    },
  } as unknown as ModalSubmitInteraction;
}

const IMAGE = "https://cdn.discordapp.com/attachments/1/2/image.png";

describe("éléments du créateur d'embeds", () => {
  it("ajoute une miniature à partir de son seul champ d'adresse", () => {
    expect(applyElement("miniature", form({ url: IMAGE }), { color: 1 })).toEqual({ color: 1, thumbnail: { url: IMAGE } });
  });

  it("ajoute une image à partir de son seul champ d'adresse", () => {
    expect(applyElement("image", form({ url: IMAGE }), {})).toEqual({ image: { url: IMAGE } });
  });

  it("retire l'image quand l'adresse est vide", () => {
    expect(applyElement("image", form({ url: "" }), { image: { url: IMAGE } })).toEqual({});
  });

  it("ajoute l'icône de l'auteur et du pied de page", () => {
    expect(applyElement("auteur", form({ texte: "Conseil", url: IMAGE }), {})).toEqual({ author: { name: "Conseil", icon_url: IMAGE } });
    expect(applyElement("pied", form({ texte: "Néa Hélikè", url: IMAGE }), {})).toEqual({ footer: { text: "Néa Hélikè", icon_url: IMAGE } });
  });

  it("refuse une adresse qui n'est pas en https avec un message clair", () => {
    expect(() => applyElement("miniature", form({ url: "http://exemple.fr/a.png" }), {})).toThrow("https://");
  });

  it("enregistre la description sans champ d'adresse", () => {
    expect(applyElement("description", form({ texte: "Bonjour" }), {})).toEqual({ description: "Bonjour" });
  });
});

describe("lecture des champs de formulaire", () => {
  it("traite un champ absent comme vide au lieu de planter", async () => {
    const { field } = await import("@/core/panels");
    expect(field(form({ url: IMAGE }), "texte")).toBeNull();
    expect(field(form({ url: `  ${IMAGE}  ` }), "url")).toBe(IMAGE);
    expect(field(form({ url: "   " }), "url")).toBeNull();
  });
});
