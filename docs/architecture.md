# Architecture du bot

## Vue d'ensemble

```
Discord (passerelle + REST) ──► src/index.ts ──► modules (commandes, panneaux, écouteurs)
                                      │
                                      ▼
                          Postgres Supabase (base du site)
```

- Un seul processus Node, une seule instance à la fois (même token que le site, qui n'utilise que l'API REST).
- La base appartient au site : le schéma et les migrations vivent dans `SoliraZ/neahelike`. Le bot lit et écrit les données, mais ne modifie jamais la structure. Au démarrage, `src/db/check.ts` vérifie que les tables attendues existent.
- Les types de la base (`src/db/database.types.ts`) sont générés par `pnpm db:types` (Supabase).

## Dossiers

| Chemin | Rôle |
|---|---|
| `src/index.ts` | Client Discord, intents, partials, enregistrement des commandes slash, arrêt propre |
| `src/env.ts` | Variables d'environnement validées par zod |
| `src/db/` | Connexion Postgres (`postgres`, `prepare: false` pour le pooler), types générés, vérification des tables |
| `src/config/store.ts` | Lecture et écriture de la configuration du serveur, avec un cache vidé à chaque écriture |
| `src/core/` | Socle partagé (voir ci-dessous) |
| `src/modules/<module>/` | Un dossier par module |
| `tests/` | Vitest ; les fichiers `*.integration.test.ts` demandent `TEST_DATABASE_URL` |

## Le socle (`src/core/`)

- **`command.ts`** : une commande est définie une seule fois (`defineCommand`) et servie à la fois en slash et en préfixe. Elle déclare sa `defaultPermission` Discord, qui la cache aussi de la liste `/` aux membres sans cette permission.
- **`dispatch.ts`** : reçoit les interactions et les messages, vérifie que le module est actif et que le membre a accès, lit les arguments, puis appelle la commande. Une `UserError` est affichée telle quelle au membre ; toute autre erreur est journalisée.
- **`context.ts`** : `CommandContext` cache la différence entre slash et préfixe. `reply(…, { private: true })` répond en éphémère (slash) ou en MP (préfixe), avec un repli dans le salon si les MP sont fermés.
- **`permissions.ts`** et **`access.ts`** : les accès sont des niveaux ordonnés (le poids sert seulement à l'ordre). L'exigence d'une commande vient du réglage de la commande, sinon de son module, sinon de sa permission Discord par défaut. Les administrateurs Discord passent toujours.
- **`components.ts`** : routage des boutons, menus et formulaires. Identifiant : `préfixe:propriétaire:action:arguments`. Le propriétaire (ou `*`) est vérifié, et la permission de la commande est revérifiée à chaque clic.
- **`panels.ts`** : le kit d'interface (boutons avec emoji, menu « Fais un choix », formulaires, ligne de confirmation, symboles `ICON`).
- **`messages.ts`** et **`templates.ts`** : textes personnalisables, avec variables.
- **`registry.ts`** : la liste des modules, avec la vérification des noms et des options au démarrage.

## Ajouter un module

1. Créer `src/modules/<id>/index.ts` qui exporte un `BotModule` : `id`, `label`, `icon`, `description`, `commands`, `components`, `messages`, `setup` (écouteurs) et `onReady`.
2. L'ajouter à `src/modules/index.ts`.
3. Si le module a des réglages, les ranger dans `bot_modules.settings` (jsonb) avec un schéma zod, comme `src/modules/logs/settings.ts`.
4. Si le module a besoin d'une nouvelle table : l'ajouter au schéma du site (`docs/schema-site.md`), migrer, puis lancer `pnpm db:types` ici. Déclarer la table dans `tables` du module : tant qu'elle manque en base, le module est mis hors service au démarrage au lieu d'arrêter le bot.
5. Ajouter les tests : rendu des panneaux (limites de Discord) et logique pure.

## Modules actuels

| Module | Contenu |
|---|---|
| `general` | `/aide`, `/ping`, messages système |
| `config` | Panneau `/config` et commandes de réglage |
| `site` | Synchronisation des rangs du site, `/candidature`, `/site` |
| `tickets` | Panneau `/tickets`, panneau public, salons de tickets, transcription HTML, note en MP, fermeture automatique (table `bot_tickets`) |
| `logs` | Panneau `/logs`, écoute des messages, membres, vocal et du journal d'audit |
| `embeds` | Créateur d'embeds `/embed` (brouillons gardés en mémoire) |
