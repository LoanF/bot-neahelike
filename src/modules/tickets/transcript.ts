export interface TranscriptMessage {
  authorTag: string;
  bot: boolean;
  createdAt: Date;
  content: string;
  attachments: { name: string; url: string }[];
  embeds: { title?: string | null; description?: string | null }[];
}

export interface TranscriptInfo {
  guildName: string;
  number: number;
  categoryLabel: string;
  openerTag: string;
  openedAt: Date;
  closedAt: Date;
  closedByTag: string;
  reason?: string | null;
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, char => ESCAPES[char]!);
}

/** Texte protégé, liens cliquables et retours à la ligne conservés. */
function richText(text: string): string {
  return escapeHtml(text)
    .replace(/https?:\/\/[^\s<]+/g, url => `<a href="${url}" rel="noopener noreferrer">${url}</a>`)
    .replace(/\n/g, "<br>");
}

const date = (value: Date) =>
  value.toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" });

function renderMessage(message: TranscriptMessage): string {
  const parts = [];
  if (message.content) parts.push(`<div class="text">${richText(message.content)}</div>`);
  for (const embed of message.embeds) {
    if (!embed.title && !embed.description) continue;
    parts.push(
      `<div class="embed">${embed.title ? `<strong>${richText(embed.title)}</strong>` : ""}${embed.description ? `<div>${richText(embed.description)}</div>` : ""}</div>`,
    );
  }
  for (const file of message.attachments) parts.push(`<div class="file">📎 <a href="${escapeHtml(file.url)}" rel="noopener noreferrer">${escapeHtml(file.name)}</a></div>`);
  return (
    `<article class="message${message.bot ? " bot" : ""}">` +
    `<header><span class="author">${escapeHtml(message.authorTag)}</span>${message.bot ? '<span class="tag">BOT</span>' : ""}<time>${date(message.createdAt)}</time></header>` +
    `${parts.join("") || '<div class="text empty">(message vide)</div>'}</article>`
  );
}

/** Page HTML autonome de la conversation, du plus ancien au plus récent message. */
export function renderTranscript(info: TranscriptInfo, messages: TranscriptMessage[]): string {
  const ordered = [...messages].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const number = String(info.number).padStart(4, "0");
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ticket #${number} · ${escapeHtml(info.categoryLabel)}</title>
<style>
body{margin:0;background:#1a150f;color:#f1ece2;font:15px/1.5 system-ui,sans-serif}
main{max-width:860px;margin:0 auto;padding:24px 16px}
h1{color:#d1a64a;font-size:22px;margin:0 0 8px}
dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 16px;margin:0 0 24px;color:#cfc6b4}
dt{color:#d1a64a}
.message{border-left:3px solid #3a3025;padding:8px 12px;margin:8px 0;background:#231c14}
.message.bot{border-left-color:#d1a64a}
header{display:flex;gap:8px;align-items:baseline;margin-bottom:4px}
.author{font-weight:600}
.tag{font-size:11px;background:#d1a64a;color:#1a150f;padding:0 4px;border-radius:2px}
time{color:#9b907d;font-size:12px}
.embed{border-left:3px solid #d1a64a;padding:4px 8px;margin-top:4px;background:#2b2219}
.empty{color:#9b907d;font-style:italic}
a{color:#d1a64a}
</style>
</head>
<body>
<main>
<h1>Ticket #${number} · ${escapeHtml(info.categoryLabel)}</h1>
<dl>
<dt>Serveur</dt><dd>${escapeHtml(info.guildName)}</dd>
<dt>Ouvert par</dt><dd>${escapeHtml(info.openerTag)}, le ${date(info.openedAt)}</dd>
<dt>Fermé par</dt><dd>${escapeHtml(info.closedByTag)}, le ${date(info.closedAt)}</dd>
${info.reason ? `<dt>Raison</dt><dd>${richText(info.reason)}</dd>` : ""}
<dt>Messages</dt><dd>${ordered.length}</dd>
</dl>
${ordered.map(renderMessage).join("\n")}
</main>
</body>
</html>
`;
}
