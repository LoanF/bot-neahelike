import { describe, expect, it } from "vitest";
import { escapeHtml, renderTranscript, type TranscriptMessage } from "@/modules/tickets/transcript";

const info = {
  guildName: "Néa Hélikè",
  number: 42,
  categoryLabel: "Support",
  openerTag: "kallias",
  openedAt: new Date("2026-10-20T10:00:00Z"),
  closedAt: new Date("2026-10-21T10:00:00Z"),
  closedByTag: "conseiller",
  reason: "Résolu",
};

const message = (content: string, at: string, extra: Partial<TranscriptMessage> = {}): TranscriptMessage => ({
  authorTag: "kallias",
  bot: false,
  createdAt: new Date(at),
  content,
  attachments: [],
  embeds: [],
  ...extra,
});

describe("transcription des tickets", () => {
  it("protège le contenu des messages", () => {
    expect(escapeHtml(`<script>alert("x")</script>`)).toBe("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    const html = renderTranscript(info, [message("<img src=x onerror=alert(1)>", "2026-10-20T10:01:00Z")]);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("classe les messages du plus ancien au plus récent", () => {
    const html = renderTranscript(info, [message("deuxième", "2026-10-20T11:00:00Z"), message("premier", "2026-10-20T10:30:00Z")]);
    expect(html.indexOf("premier")).toBeLessThan(html.indexOf("deuxième"));
  });

  it("reprend l'en-tête du ticket, les pièces jointes et les embeds", () => {
    const html = renderTranscript(info, [
      message("", "2026-10-20T10:01:00Z", {
        bot: true,
        attachments: [{ name: "preuve.png", url: "https://cdn.discordapp.com/preuve.png" }],
        embeds: [{ title: "Bienvenue", description: "Décris ta demande" }],
      }),
    ]);
    expect(html).toContain("Ticket #0042 · Support");
    expect(html).toContain("Résolu");
    expect(html).toContain('href="https://cdn.discordapp.com/preuve.png"');
    expect(html).toContain("<strong>Bienvenue</strong>");
    expect(html).toContain('<span class="tag">BOT</span>');
  });

  it("rend les liens cliquables sans casser la protection", () => {
    const html = renderTranscript(info, [message("voir https://exemple.fr/a?b=1&c=2 merci", "2026-10-20T10:01:00Z")]);
    expect(html).toContain('<a href="https://exemple.fr/a?b=1&amp;c=2" rel="noopener noreferrer">');
  });
});
