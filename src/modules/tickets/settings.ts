import { randomBytes } from "node:crypto";
import { z } from "zod";
import { setModuleSettings, type GuildSettings } from "@/config/store";
import { UserError } from "@/core/errors";

export const MODULE = "tickets";

/** Nombre de catégories : une rangée de boutons par 5, quatre rangées au plus sur le panneau publié. */
export const MAX_CATEGORIES = 20;
/** Un formulaire Discord a 5 champs au plus. */
export const MAX_QUESTIONS = 5;
/** Durées proposées pour la fermeture automatique (en jours). */
export const AUTO_CLOSE_CHOICES = [1, 2, 3, 5, 7, 14] as const;

const snowflake = z.string().regex(/^\d{17,20}$/);

const categorySchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,24}$/),
  label: z.string().min(1).max(40),
  emoji: z.string().min(1).max(64),
  description: z.string().max(100),
  /** Rôles qui voient et gèrent les tickets de la catégorie. */
  roleIds: z.array(snowflake).max(10),
  questions: z.array(z.string().min(1).max(45)).max(MAX_QUESTIONS),
});

export type TicketCategory = z.infer<typeof categorySchema>;

const schema = z.object({
  /** Catégorie Discord où sont créés les salons de tickets. */
  parentId: snowflake.optional(),
  /** Salon qui reçoit les transcriptions à la fermeture. */
  archivesId: snowflake.optional(),
  /** Fermeture après ce nombre de jours sans message ; absent : jamais. */
  autoCloseDays: z.number().int().min(1).max(30).optional(),
  /** Message du panneau publié, mis à jour quand les catégories changent. */
  panel: z.object({ channelId: snowflake, messageId: snowflake }).optional(),
  categories: z.array(categorySchema).max(MAX_CATEGORIES).optional(),
});

export type TicketSettings = Omit<z.infer<typeof schema>, "categories"> & { categories: TicketCategory[] };

/** Catégories proposées tant qu'aucune n'a été réglée. */
export const DEFAULT_CATEGORIES: TicketCategory[] = [
  { id: "support", label: "Support", emoji: "🛠️", description: "Un problème technique ou une question générale", roleIds: [], questions: ["Décris ta demande"] },
  { id: "whitelist", label: "Question whitelist", emoji: "📜", description: "Une question sur la candidature ou l'entretien", roleIds: [], questions: ["Ta question"] },
  {
    id: "plainte-joueur",
    label: "Plainte joueur",
    emoji: "⚖️",
    description: "Signaler le comportement d'un joueur",
    roleIds: [],
    questions: ["Joueur concerné (pseudo ou identifiant)", "Que s'est-il passé ?", "Preuves (liens, captures)"],
  },
  {
    id: "plainte-staff",
    label: "Plainte staff",
    emoji: "🛡️",
    description: "Signaler le comportement d'un membre du staff",
    roleIds: [],
    questions: ["Membre du staff concerné", "Que s'est-il passé ?", "Preuves (liens, captures)"],
  },
  { id: "reprise", label: "Dossier de reprise", emoji: "🗂️", description: "Reprendre un personnage ou un dossier", roleIds: [], questions: ["Personnage concerné", "Ce que tu demandes"] },
  { id: "partenariat", label: "Partenariat", emoji: "🤝", description: "Proposer un partenariat", roleIds: [], questions: ["Nom du projet ou du serveur", "Ta proposition"] },
];

/** Réglages des tickets ; une valeur invalide en base est ignorée plutôt que de bloquer le bot. */
export function ticketSettings(settings: GuildSettings): TicketSettings {
  const parsed = schema.safeParse(settings.modules.get(MODULE)?.settings ?? {});
  const data = parsed.success ? parsed.data : {};
  return { ...data, categories: data.categories ?? DEFAULT_CATEGORIES };
}

export async function saveTicketSettings(settings: GuildSettings, next: TicketSettings) {
  await setModuleSettings(settings.guildId, MODULE, schema.parse(next));
}

export function findCategory(tickets: TicketSettings, id: string): TicketCategory {
  const category = tickets.categories.find(item => item.id === id);
  if (!category) throw new UserError("Cette catégorie de ticket n'existe plus.");
  return category;
}

export function newCategoryId(): string {
  return `c${randomBytes(4).toString("hex")}`;
}

/** Questions d'un formulaire : lignes non vides, 45 caractères au plus (limite d'un libellé Discord), 5 au plus. */
export function cleanQuestions(lines: (string | null)[]): string[] {
  const questions = lines.map(line => line?.trim() ?? "").filter(Boolean);
  const tooLong = questions.find(question => question.length > 45);
  if (tooLong) throw new UserError(`Une question fait plus de 45 caractères : « ${tooLong} ». Raccourcis-la.`);
  return questions.slice(0, MAX_QUESTIONS);
}

/** Nom du salon d'un ticket : catégorie et pseudo, en minuscules, sans accents ni espaces. */
export function channelName(categoryLabel: string, username: string): string {
  const slug = (text: string) =>
    text
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  return `${slug(categoryLabel) || "ticket"}-${slug(username) || "membre"}`.slice(0, 100);
}
