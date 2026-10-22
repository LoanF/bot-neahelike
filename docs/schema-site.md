# Tables du bot dans le schéma du site

Le schéma et les migrations vivent **uniquement** dans le dépôt du site (`SoliraZ/neahelike`). Le bot ne crée ni ne modifie jamais la structure de la base : il vérifie seulement au démarrage que les tables dont il a besoin existent.

Chaque étape du bot qui demande de nouvelles tables ajoute une section ci-dessous, à reporter dans le site.

## Marche à suivre (dans le dépôt du site)

1. Ajouter le code de la section à la fin de `src/db/schema.ts` (et compléter l'import `drizzle-orm/pg-core`).
2. `pnpm db:generate` : crée la migration des tables.
3. `pnpm drizzle-kit generate --custom --name <nom>` puis coller le SQL « RLS » de la section dans le fichier créé (même principe que `0001_activer_rls.sql`).
4. `pnpm db:migrate`.
5. Dans le dépôt du bot : `pnpm db:types` pour régénérer `src/db/database.types.ts`.

---

## Étape 1 — Configuration et permissions

Import à compléter :

```ts
import { boolean, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
```

Code à ajouter à la fin de `src/db/schema.ts` :

```ts
// ─── Bot Discord (dépôt bot-neahelike) ──────────────────────────────────────
// Tables écrites uniquement par le bot. Le site ne fait que les lire, s'il en a besoin.

/** Configuration du bot, une ligne par serveur Discord. */
export const botGuildConfig = pgTable("bot_guild_config", {
  guildId: text().primaryKey(),
  prefix: text().notNull().default("+"),
  embedColor: text().notNull().default("#d1a64a"),
  embedColorDark: text().notNull().default("#1a150f"),
  embedColorLight: text().notNull().default("#f1ece2"),
  nickname: text(),
  bio: text(),
  avatarUrl: text(),
  bannerUrl: text(),
  presenceStatus: text().notNull().default("online"),
  activityType: text().notNull().default("personnalise"),
  activityText: text(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/** Niveaux de permission : un niveau de poids supérieur hérite des droits des niveaux inférieurs. */
export const botPermissionLevels = pgTable(
  "bot_permission_levels",
  {
    id: uuid().primaryKey().defaultRandom(),
    guildId: text().notNull(),
    name: text().notNull(),
    weight: integer().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  table => [unique().on(table.guildId, table.name), unique().on(table.guildId, table.weight)],
);

/** Rôles Discord liés à un niveau (plusieurs rôles par niveau). */
export const botPermissionLevelRoles = pgTable(
  "bot_permission_level_roles",
  {
    levelId: uuid()
      .notNull()
      .references(() => botPermissionLevels.id, { onDelete: "cascade" }),
    roleId: text().notNull(),
  },
  table => [primaryKey({ columns: [table.levelId, table.roleId] })],
);

/** État et réglages de chaque module. `levelId` : rang requis pour tout le module (null = valeur de chaque commande). */
export const botModules = pgTable(
  "bot_modules",
  {
    guildId: text().notNull(),
    module: text().notNull(),
    enabled: boolean().notNull().default(true),
    levelId: uuid().references(() => botPermissionLevels.id, { onDelete: "set null" }),
    settings: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  table => [primaryKey({ columns: [table.guildId, table.module] })],
);

/** Rang requis par commande. `levelId` null = ouverte à tout le monde ; supprimer le niveau supprime le réglage. */
export const botCommandPermissions = pgTable(
  "bot_command_permissions",
  {
    guildId: text().notNull(),
    command: text().notNull(),
    levelId: uuid().references(() => botPermissionLevels.id, { onDelete: "cascade" }),
  },
  table => [primaryKey({ columns: [table.guildId, table.command] })],
);

/** Textes personnalisés ; sans ligne, le bot utilise son texte par défaut. */
export const botMessages = pgTable(
  "bot_messages",
  {
    guildId: text().notNull(),
    key: text().notNull(),
    content: text().notNull(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  table => [primaryKey({ columns: [table.guildId, table.key] })],
);
```

Migration RLS (`pnpm drizzle-kit generate --custom --name activer_rls_bot`) :

```sql
-- Tables du bot : lues et écrites par connexion Postgres directe (site et bot), jamais par l'API publique.
ALTER TABLE "bot_guild_config" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bot_permission_levels" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bot_permission_level_roles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bot_modules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bot_command_permissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bot_messages" ENABLE ROW LEVEL SECURITY;
```

---

## Étape 3 — Tickets

Les catégories de tickets et les réglages (salons, rôles, questions) sont rangés dans `bot_modules.settings` : seule la table des tickets est nouvelle.

Imports à compléter :

```ts
import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
```

Code à ajouter à la fin de `src/db/schema.ts` :

```ts
export const ticketStatus = pgEnum("ticket_status", ["ouvert", "ferme"]);

/** Tickets du bot Discord : un salon privé par demande, avec sa transcription à la fermeture. */
export const botTickets = pgTable(
  "bot_tickets",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Numéro lisible du ticket (#0042), attribué par la base. */
    number: integer().generatedAlwaysAsIdentity(),
    guildId: text().notNull(),
    channelId: text().notNull().unique(),
    /** Identifiant de la catégorie dans les réglages du module, et son nom au moment de l'ouverture. */
    categoryId: text().notNull(),
    categoryLabel: text().notNull(),
    openerId: text().notNull(),
    claimedById: text(),
    status: ticketStatus().notNull().default("ouvert"),
    /** Réponses au formulaire d'ouverture. */
    answers: jsonb().$type<{ question: string; answer: string }[]>().notNull().default([]),
    closeReason: text(),
    closedById: text(),
    /** Transcription HTML enregistrée à la fermeture. */
    transcript: text(),
    /** Note de satisfaction de 1 à 5, donnée en MP après la fermeture. */
    rating: integer(),
    lastActivityAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp({ withTimezone: true }),
  },
  table => [
    // Un seul ticket ouvert par membre et par catégorie.
    uniqueIndex("bot_tickets_un_ouvert_par_categorie").on(table.guildId, table.openerId, table.categoryId).where(sql`${table.status} = 'ouvert'`),
    index("bot_tickets_inactifs_idx").on(table.status, table.lastActivityAt),
    check("bot_tickets_note", sql`${table.rating} between 1 and 5`),
  ],
);
```

Migration RLS (`pnpm drizzle-kit generate --custom --name activer_rls_tickets`) :

```sql
ALTER TABLE "bot_tickets" ENABLE ROW LEVEL SECURITY;
```

---

## Étape 4 — Giveaways (appliquée : migration 0016 du site)

Deux tables : le giveaway lui-même et ses participants (une ligne par participant, pour qu'un clic ne réécrive jamais toute la liste).

Imports à compléter si besoin : `check`, `index`, `integer`, `pgEnum`, `primaryKey`, `uuid` (déjà présents pour les tickets).

Code à ajouter à la fin de `src/db/schema.ts` :

```ts
export const giveawayStatus = pgEnum("giveaway_status", ["en_cours", "termine", "annule"]);

/** Giveaways du bot : publiés dans un salon, tirés au sort à leur fin. */
export const botGiveaways = pgTable(
  "bot_giveaways",
  {
    id: uuid().primaryKey().defaultRandom(),
    guildId: text().notNull(),
    channelId: text().notNull(),
    /** Message publié ; null le temps de l'envoyer. */
    messageId: text().unique(),
    prize: text().notNull(),
    description: text(),
    winnerCount: integer().notNull().default(1),
    /** Rôle exigé pour participer ; null : tout le monde. */
    requiredRoleId: text(),
    hostId: text().notNull(),
    status: giveawayStatus().notNull().default("en_cours"),
    /** Gagnants tirés à la fin (ou au nouveau tirage). */
    winnerIds: text().array().notNull().default(sql`'{}'::text[]`),
    endsAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp({ withTimezone: true }),
  },
  table => [
    index("bot_giveaways_a_terminer_idx").on(table.status, table.endsAt),
    check("bot_giveaways_gagnants", sql`${table.winnerCount} between 1 and 20`),
  ],
);

/** Participants d'un giveaway. */
export const botGiveawayEntries = pgTable(
  "bot_giveaway_entries",
  {
    giveawayId: uuid()
      .notNull()
      .references(() => botGiveaways.id, { onDelete: "cascade" }),
    userId: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  table => [primaryKey({ columns: [table.giveawayId, table.userId] })],
);
```

Migration RLS (`pnpm drizzle-kit generate --custom --name activer_rls_giveaways`) :

```sql
ALTER TABLE "bot_giveaways" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bot_giveaway_entries" ENABLE ROW LEVEL SECURITY;
```

---

## Étape 5 — Casier de modération (appliquée : migration 0016 du site)

Une ligne par sanction, jamais supprimée : une sanction levée (débannissement, avertissement retiré) est marquée révoquée. Pas de clé étrangère vers `users` : on sanctionne aussi des membres sans compte sur le site.

```ts
export const sanctionType = pgEnum("sanction_type", ["avertissement", "exclusion", "expulsion", "bannissement"]);

/** Casier de modération du bot. */
export const botSanctions = pgTable(
  "bot_sanctions",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Numéro lisible de la sanction (#12), attribué par la base. */
    number: integer().generatedAlwaysAsIdentity(),
    guildId: text().notNull(),
    userId: text().notNull(),
    moderatorId: text().notNull(),
    type: sanctionType().notNull(),
    reason: text().notNull(),
    /** Fin d'une exclusion temporaire ou d'un bannissement temporaire ; null : définitif ou sans durée. */
    endsAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp({ withTimezone: true }),
    revokedById: text(),
    revokeReason: text(),
  },
  table => [
    index("bot_sanctions_casier_idx").on(table.guildId, table.userId, table.createdAt),
    // Bannissements temporaires encore actifs, levés automatiquement à échéance.
    index("bot_sanctions_bans_a_lever_idx").on(table.endsAt).where(sql`${table.type} = 'bannissement' and ${table.revokedAt} is null and ${table.endsAt} is not null`),
  ],
);
```

Migration RLS (`pnpm drizzle-kit generate --custom --name activer_rls_sanctions`) :

```sql
ALTER TABLE "bot_sanctions" ENABLE ROW LEVEL SECURITY;
```
