# Bot Néa Hélikè

Bot Discord du serveur roleplay FiveM **Néa Hélikè** (mythologie grecque), relié au portail whitelist du site [neahelike](https://github.com/SoliraZ/neahelike).

Entièrement configurable depuis Discord : préfixe, modules, niveaux de permission, profil du bot et messages. Toute la configuration est stockée en base, jamais dans le code.

## Stack

- **TypeScript** + **discord.js v14**, Node 22, pnpm
- **Postgres (Supabase)** : la même base que le site, via `postgres` (pilote SQL)
- Types de la base générés par `supabase gen types typescript`
- **pino** (logs), **zod** (variables d'environnement), **Vitest** (tests), **tsup** (build)

## Démarrer en local

```bash
pnpm install
cp .env.example .env   # puis remplir les valeurs
pnpm dev               # relance à chaque modification
```

Production : `pnpm build` puis `pnpm start`.

### Application Discord

Le bot utilise la **même application** que la connexion du site (onglet *Bot* du [portail développeur](https://discord.com/developers/applications)).

1. Activer les trois intents privilégiés : **Server Members**, **Message Content**, **Presence**.
2. Inviter le bot avec les scopes `bot` et `applications.commands`. Pour un bot dédié au serveur, le plus simple est la permission **Administrateur** ; les modules à venir (tickets, modération, sauvegardes) en ont besoin d'une grande partie.
3. Placer le rôle du bot **au-dessus** des rôles qu'il doit gérer.

### Base de données

Le bot ne crée ni ne modifie **jamais** la structure de la base : le schéma et les migrations vivent uniquement dans le dépôt du site. Les tables dont le bot a besoin sont décrites, étape par étape, dans [`docs/schema-site.md`](docs/schema-site.md), à reporter dans `src/db/schema.ts` du site puis à migrer.

Au démarrage, le bot vérifie que ces tables existent et s'arrête avec un message clair sinon.

Après chaque migration du site, régénérer les types :

```bash
pnpm exec supabase login   # une seule fois
pnpm db:types              # utilise SUPABASE_PROJECT_ID
```

## Configuration depuis Discord

Toutes les commandes existent en préfixe (`+` par défaut) et en slash (`/`).

| Commande | Rôle |
|---|---|
| `config` | Panneau à boutons et menus : général, modules, niveaux, commandes, profil, messages |
| `prefixe`, `couleur` | Préfixe et couleurs des embeds (or `#d1a64a`, bronze `#1a150f`, parchemin `#f1ece2`) |
| `module liste/activer/desactiver/niveau` | Modules et rang requis par module |
| `niveau liste/creer/modifier/supprimer/ajouter-role/retirer-role` | Niveaux de permission |
| `permission voir/definir` | Rang requis par commande |
| `profil voir/pseudo/bio/avatar/banniere/statut/activite` | Personnalisation du bot |
| `message liste/voir/definir/reinitialiser` | Textes personnalisables, avec variables (`{user}`, `{server}`, `{count}`…) |
| `aide`, `ping` | Aide (filtrée selon le rang du membre) et latence |

### Permissions

- Des **niveaux** pondérés (par défaut Joueur 10, Staff 50, Admin 100), chacun lié à **plusieurs rôles** Discord.
- Un niveau de poids supérieur **hérite** des droits des niveaux inférieurs : Admin ⊃ Staff ⊃ Joueur.
- Rang requis d'une commande : réglage de la commande, sinon réglage de son module, sinon valeur par défaut du code.
- La permission Discord **Administrateur** passe toujours, pour ne jamais perdre l'accès à la configuration. Les commandes de configuration ne peuvent jamais être ouvertes à tout le monde.

### Réponses privées

En slash, les réponses privées sont éphémères (visibles du seul auteur). En préfixe, le message du membre est retiré et la réponse part en MP ; si ses MP sont fermés, elle s'affiche dans le salon et s'efface au bout de 10 secondes. Un panneau ouvert en préfixe reste dans le salon, mais seul son auteur peut s'en servir.

## Organisation

| Dossier | Rôle |
|---|---|
| `src/index.ts` | Démarrage, intents, reconnexion, arrêt propre |
| `src/env.ts` | Variables d'environnement validées au démarrage |
| `src/db/` | Connexion, types générés, vérification des tables |
| `src/config/store.ts` | Lecture et écriture de la configuration, avec cache |
| `src/core/` | Socle : commandes (slash + préfixe), permissions, panneaux, messages, embeds |
| `src/modules/` | Un dossier par module (`general`, `config`, puis tickets, modération…) |
| `docs/schema-site.md` | Tables à ajouter au schéma du site |

## Vérifications

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Les tests du stockage s'exécutent contre une base où le schéma du site a été migré, seulement si `TEST_DATABASE_URL` est défini (base locale ou de test, **jamais** la production) :

```bash
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/postgres pnpm test
```
