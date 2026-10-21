import { describe, expect, it } from "vitest";
import { describeChanges, messageDeleted, messageEdited, purgeTranscript, sanction, truncate, voiceMoved } from "@/modules/logs/format";

const GOLD = 0xd1a64a;

describe("mise en forme des logs", () => {
  it("coupe les textes trop longs pour un champ", () => {
    expect(truncate("a".repeat(2000))).toHaveLength(1024);
    expect(truncate("court")).toBe("court");
  });

  it("signale un message effacé dont le contenu est inconnu", () => {
    const json = messageDeleted(GOLD, { channelId: "1", attachments: [] }).toJSON();
    expect(json.fields?.find(field => field.name === "Contenu")?.value).toContain("Contenu inconnu");
    expect(json.fields?.find(field => field.name === "Auteur")?.value).toBe("Inconnu");
  });

  it("montre le texte avant et après une modification", () => {
    const json = messageEdited(GOLD, { authorId: "2", channelId: "1", before: "avant", after: "après", url: "https://discord.com/x" }).toJSON();
    expect(json.fields?.map(field => field.value)).toEqual(expect.arrayContaining(["avant", "après"]));
  });

  it("indique la fin d'une exclusion temporaire et l'absence de raison", () => {
    const json = sanction(GOLD, "exclusion", "Exclusion temporaire", { targetId: "3", executorId: "4", until: new Date("2026-10-22T10:00:00Z") }).toJSON();
    expect(json.fields?.find(field => field.name === "Jusqu'à")?.value).toContain("<t:1792663200:f>");
    expect(json.fields?.find(field => field.name === "Raison")?.value).toContain("Aucune raison");
  });

  it("distingue entrée, sortie et changement de salon vocal, et ignore le reste", () => {
    expect(voiceMoved(GOLD, { id: "5", to: "10" })?.toJSON().title).toContain("Entrée");
    expect(voiceMoved(GOLD, { id: "5", from: "10" })?.toJSON().title).toContain("Sortie");
    expect(voiceMoved(GOLD, { id: "5", from: "10", to: "11" })?.toJSON().title).toContain("Changement");
    expect(voiceMoved(GOLD, { id: "5", from: "10", to: "10" })).toBeNull();
  });

  it("traduit les changements connus et résume les autres", () => {
    const text = describeChanges([
      { key: "name", old: "general", new: "agora" },
      { key: "nsfw", old: false, new: true },
      { key: "color", old: 0, new: 0xd1a64a },
      { key: "inconnu", old: 1, new: 2 },
    ]);
    expect(text).toContain("**Nom** : general → agora");
    expect(text).toContain("**Contenu sensible** : Non → Oui");
    expect(text).toContain("#d1a64a");
    expect(text).toContain("1 autre(s) réglage(s)");
  });

  it("copie les messages purgés dans l'ordre chronologique", () => {
    const text = purgeTranscript([
      { createdAt: new Date("2026-01-02T00:00:00Z"), authorTag: "b", content: "deux" },
      { createdAt: new Date("2026-01-01T00:00:00Z"), authorTag: "a", content: "un" },
    ]);
    expect(text.split("\n")).toEqual(["[2026-01-01T00:00:00.000Z] a : un", "[2026-01-02T00:00:00.000Z] b : deux"]);
  });
});
