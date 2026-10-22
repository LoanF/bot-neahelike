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

## Utilisation depuis Discord

Le guide complet du staff est dans [`docs/guide-staff.md`](docs/guide-staff.md). Toutes les commandes existent en `/` et avec le préfixe (`+` par défaut).

| Commande | Rôle | Visible par défaut pour |
|---|---|---|
| `/config` | Panneau : général, modules, accès, commandes, profil du bot, messages | Gérer le serveur |
| `/logs` | Panneau : quel salon reçoit quel type de log | Gérer le serveur |
| `/accueil` | Panneau : bienvenue et départ, rôles à l'arrivée, règlement à accepter, panneaux de rôles en libre-service | Gérer le serveur |
| `/serveur` | Panneau : statut FiveM, salons compteurs, rôle soutien, vocaux temporaires | Gérer le serveur |
| `/statut` | État du serveur FiveM (en ligne, joueurs) | Tout le monde |
| `/tickets` | Panneau : catégories, rôles, questions, archives, publication du panneau public | Gérer le serveur |
| `/ticket fermer/ajouter/retirer` | Gestion du ticket depuis son salon (équipe ou auteur) | Tout le monde |
| `/embed` | Créateur d'embeds avec aperçu en direct, Défaire et Refaire | Gérer les messages |
| `/fiche @joueur` | Compte, candidature et décision d'un joueur, lien vers sa fiche staff (réponse privée) | Gérer les messages |
| `/site` | Salon de logs staff, rôles des rangs du site, resynchronisation de la présence | Gérer le serveur |
| `/prefixe`, `/couleur`, `/module`, `/acces`, `/permission`, `/profil`, `/message` | Les mêmes réglages qu'en panneau, en une commande | Gérer le serveur |
| `/aide` | Les commandes accessibles, module par module, avec des exemples | Tout le monde |
| `/candidature lien/statut` | Lien vers le portail et état de la candidature (réponse privée) | Tout le monde |

### Permissions

- Une commande `/` n'apparaît que pour les membres qui ont sa **permission Discord par défaut** ; le bot revérifie l'accès à chaque utilisation, y compris en préfixe.
- Des **accès** (par défaut Admin ▸ Staff ▸ Joueur), chacun lié à un ou plusieurs rôles, affinent les règles : un accès placé plus haut a tous les droits de ceux du dessous. Réglage de la commande, sinon du module, sinon permission Discord par défaut.
- Les **administrateurs Discord** passent toujours ; les commandes de configuration ne peuvent jamais être ouvertes à tout le monde.

## Lien avec le site

- **Rangs du site** (joueur, recruteur, admin, owner) : calculés par le site seul (owners, rôles réglés sur le site dans `role_ranks`). Le bot ne les écrit jamais : quand les rôles d'un membre changent, il remet `users.roles_synced_at` à vide pour que le site relise le rang aussitôt.
- **Présence** : le bot tient `users.in_guild` (et pseudo, avatar) à jour en temps réel et journalise `discord.rejoint` / `discord.quitte`, comme le site.
- **Rôles Discord** : le site donne et retire lui-même les rôles du parcours (« attente de wl », « Magistrat (wl) », « Novice (Non WL) ») avec le token de l'application, même bot éteint. Le rôle du bot doit être placé au-dessus de ces rôles dans la liste du serveur.
- **Resynchronisation complète** au démarrage et après une coupure de la passerelle : seuls les écarts sont écrits. Le bot ne crée jamais de compte : seuls les comptes déjà liés au site sont mis à jour.
- **Rôles du parcours** : le bot les lit seulement, pour `/candidature statut` quand le joueur n'a pas de candidature sur le portail.
- **Candidatures** : `/candidature statut` et `/fiche` lisent `applications` (dernière candidature du joueur) ; le bot n'y écrit jamais.
- **Salon de logs staff** : `/site salon-logs #salon`. Changements de rang, et décisions du site relayées depuis le journal `events` (sondé toutes les 20 s, curseur gardé dans les réglages du module : au premier démarrage, l'historique n'est pas republié).

## Réponses privées

En slash, les réponses privées sont éphémères (visibles du seul auteur). En préfixe, le message du membre est retiré et la réponse part en MP ; si ses MP sont fermés, elle s'affiche dans le salon et s'efface au bout de 10 secondes. Un panneau ouvert en préfixe reste dans le salon, mais seul son auteur peut s'en servir.

## Organisation

| Dossier | Rôle |
|---|---|
| `src/index.ts` | Démarrage, intents, reconnexion, arrêt propre |
| `src/env.ts` | Variables d'environnement validées au démarrage |
| `src/db/` | Connexion, types générés, vérification des tables |
| `src/config/store.ts` | Lecture et écriture de la configuration, avec cache |
| `src/core/` | Socle : commandes (slash + préfixe), permissions, panneaux, messages, embeds |
| `src/modules/` | Un dossier par module (`general`, `config`, `site`, `tickets`, `logs`, `embeds`) |
| `docs/schema-site.md` | Tables à ajouter au schéma du site |
| `docs/guide-staff.md` | Guide d'utilisation pour le staff |
| `docs/architecture.md` | Organisation du code, ajouter un module |

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
