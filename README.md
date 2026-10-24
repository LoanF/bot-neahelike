# Néa Hélikè : bot Discord

Bot Discord du serveur roleplay FiveM **Néa Hélikè** (univers de la mythologie grecque). Il est relié au site et au portail whitelist ([`neahelike`](https://github.com/SoliraZ/neahelike)), avec qui il partage la base de données et l'application Discord.

Tout se règle **depuis Discord**, par des panneaux (boutons, menus « Fais un choix », formulaires) ou par des commandes. Aucune configuration n'est écrite dans le code : elle est enregistrée en base.

- **Configuration** : préfixe, couleurs, modules activables, accès liés aux rôles, profil du bot, textes des messages.
- **Accueil** : bienvenue et départ, rôles à l'arrivée, règlement à accepter, panneaux de rôles en libre-service.
- **Vie du serveur** : statut du serveur FiveM, salons compteurs, rôle soutien, vocaux temporaires.
- **Lien avec le site** : statut de candidature pour les joueurs, fiche joueur pour le staff, décisions du site dans un salon de logs staff.
- **Tickets** : un salon privé par demande, avec catégories, formulaire, prise en charge, transcription et note de satisfaction.
- **Modération** : avertissements, exclusions, expulsions, bannissements (définitifs ou temporaires), casier, outils de salon.
- **Logs** : messages, membres, modération, vocal, serveur et tickets, chacun dans le salon de votre choix.
- **Giveaways**, **créateur d'embeds**, **informations** sur les membres et le serveur.

---

## Sommaire

1. [Stack](#stack)
2. [Installation en local](#installation-en-local)
3. [Variables d'environnement](#variables-denvironnement)
4. [Configurer l'application Discord](#configurer-lapplication-discord)
5. [Mettre en production](#mettre-en-production)
6. [Premiers réglages sur Discord](#premiers-réglages-sur-discord)
7. [Commandes](#commandes)
8. [Permissions et accès](#permissions-et-accès)
9. [Fonctionnement de chaque module](#fonctionnement-de-chaque-module)
10. [Architecture du code](#architecture-du-code)
11. [Base de données](#base-de-données)
12. [Le bot et le site](#le-bot-et-le-site)
13. [Modifier les textes](#modifier-les-textes)
14. [Tests](#tests)
15. [Sécurité](#sécurité)
16. [À faire avant le déploiement](#à-faire-avant-le-déploiement)

Le guide d'utilisation pour le staff, sans aucun détail technique, est dans [`docs/guide-staff.md`](docs/guide-staff.md).

---

## Stack

| Rôle | Outil |
|---|---|
| Langage | **TypeScript** (ESM), Node.js **22** ou plus |
| Discord | **discord.js v14** (passerelle + API REST) |
| Base de données | **PostgreSQL** (la base du site), pilote **`postgres`** (postgres-js), requêtes SQL écrites à la main |
| Types de la base | Générés par la CLI Supabase (`pnpm db:types`) dans `src/db/database.types.ts` |
| Validation | **Zod** (variables d'environnement, réglages des modules) |
| Logs | **pino** (JSON en production, lisible dans un terminal grâce à `pino-pretty`) |
| Tests | **Vitest** |
| Build | **tsup** (un seul fichier `dist/index.js`) |
| Gestionnaire de paquets | **pnpm** |

Le bot n'a besoin que de **Node.js**, d'un accès à la **base PostgreSQL du site** et d'un **token Discord**. Il ne dépend d'aucun hébergeur particulier.

---

## Installation en local

Prérequis : Node.js 22+, pnpm (`corepack enable`), la base PostgreSQL du site (ou une base de test où les migrations du site ont été appliquées), une application Discord avec un serveur de test.

```bash
pnpm install
cp .env.example .env      # puis remplir les valeurs (voir plus bas)
pnpm dev                  # lance le bot et le relance à chaque modification
```

Commandes utiles :

| Commande | Effet |
|---|---|
| `pnpm dev` | Lance le bot en développement (relance automatique, lit `.env`) |
| `pnpm build` puis `pnpm start` | Build puis lancement de production (`dist/index.js`, lit `.env` s'il existe) |
| `pnpm typecheck` | Vérification des types TypeScript |
| `pnpm lint` | ESLint |
| `pnpm test` | Tests (voir [Tests](#tests)) |
| `pnpm db:types` | Régénère les types de la base depuis Supabase (après une migration du site) |

> **Windows** : au lancement dans un terminal, le bot passe la console en UTF-8 (`chcp 65001`) pour que les accents des logs s'affichent bien. Si un terminal les affiche encore mal (`Pr├®sence`), lancez `chcp 65001` avant `pnpm dev`.

> **Un seul bot à la fois.** Le site et le bot utilisent le même token. Ne lancez jamais le bot à deux endroits en même temps (par exemple en local **et** sur l'hébergement) : les deux instances répondraient aux mêmes commandes et se disputeraient les tâches planifiées. Pour développer sans toucher au vrai serveur, utilisez une application Discord de test et une base de test.

---

## Variables d'environnement

Toutes sont décrites dans [`.env.example`](.env.example). Elles sont validées au démarrage par `src/env.ts` : une variable obligatoire manquante ou mal formée arrête le bot avec un message qui la nomme.

| Variable | Obligatoire | Rôle |
|---|---|---|
| `DISCORD_BOT_TOKEN` | oui | Token du bot (application commune au site et au bot, onglet *Bot*) |
| `DISCORD_GUILD_ID` | oui | ID du serveur Discord Néa Hélikè. Le bot ne sert que ce serveur |
| `DATABASE_URL` | oui | Connexion PostgreSQL, **la même base que le site**. Avec Supabase : *Connection string › Transaction pooler* |
| `SITE_URL` | oui | Adresse publique du site, sans `/` final (liens vers le portail et vers les fiches de l'espace équipe) |
| `DISCORD_ROLE_ATTENTE_WL` | non | Rôle « attente de wl ». Sert à `/candidature` quand le joueur n'a pas de candidature sur le portail |
| `DISCORD_ROLE_WL` | non | Rôle whitelist « Magistrat (wl) ». Même usage, et compteur des citoyens |
| `SUPABASE_PROJECT_ID` | non | Identifiant du projet Supabase, seulement pour `pnpm db:types` |
| `LOG_LEVEL` | non | `trace`, `debug`, `info` (par défaut), `warn` ou `error` |

Les ID de rôles ne sont pas des secrets : ce sont les mêmes valeurs que dans le site. Les rangs du site (recruteur, admin, owner) se règlent sur le site, le bot n'en a pas besoin.

Pour copier un ID dans Discord : *Paramètres › Avancés › Mode développeur*, puis clic droit sur le serveur ou le rôle › *Copier l'identifiant*.

---

## Configurer l'application Discord

Le site et le bot utilisent **la même application Discord** ([portail développeur](https://discord.com/developers/applications)).

1. **Onglet Bot** : générer le token (`DISCORD_BOT_TOKEN`) et activer les trois **intents privilégiés** :
   - **Server Members** : arrivées, départs, rôles des membres ;
   - **Message Content** : commandes avec préfixe, logs des messages, `/snipe` ;
   - **Presence** : statut personnalisé pour le rôle soutien.

   Sans eux, le bot s'arrête au démarrage avec un message qui les nomme.
2. **Inviter le bot** (onglet *OAuth2 › URL Generator*) avec les scopes `bot` et `applications.commands`. Le plus simple est la permission **Administrateur**. Sinon, il lui faut au minimum :
   - Voir les salons, Envoyer des messages, Intégrer des liens, Joindre des fichiers, Lire l'historique, Ajouter des réactions ;
   - Gérer les rôles, Gérer les salons, Gérer les messages, Changer le pseudo (son propre pseudo sur le serveur) ;
   - Exclure temporairement, Expulser et Bannir des membres ;
   - Voir les logs du serveur (auteur et raison dans les logs de modération) ;
   - Déplacer des membres (vocaux temporaires).
3. **Placer le rôle du bot au-dessus** de tous les rôles qu'il doit donner ou retirer : rôles à l'arrivée, rôle du règlement, panneaux de rôles, rôle soutien. Il doit aussi être au-dessus des rôles du parcours whitelist (« attente de wl », « Magistrat (wl) », « Novice (Non WL) »), car le site les donne avec le token de cette application. Le bot refuse de distribuer un rôle placé au-dessus du sien et explique pourquoi.

Au démarrage, le bot enregistre ses commandes `/` **sur le serveur** (`DISCORD_GUILD_ID`) : elles apparaissent tout de suite, sans le délai des commandes globales.

---

## Mettre en production

Le bot est **un processus Node.js qui tourne en continu** : il reste connecté à la passerelle Discord et lance des tâches régulières (statut FiveM, giveaways, fin des bannissements temporaires…). Il lui faut donc un hébergement qui garde un processus allumé : un serveur (VPS), un conteneur, ou une plateforme qui accepte les « workers » (Railway, Fly.io, Render…). Une plateforme « serverless » (Vercel, Netlify) **ne convient pas**.

Besoins réseau : accès sortant à Discord, à la base PostgreSQL et, pour le statut FiveM, au port HTTP du serveur FiveM (`30120` par défaut). Aucun port entrant.

### Sur un serveur (VPS)

```bash
git clone https://github.com/SoliraZ/bot-neahelike.git && cd bot-neahelike
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env        # remplir les valeurs
pnpm build
pnpm start
```

Pour qu'il redémarre tout seul (plantage, redémarrage du serveur), avec **PM2** :

```bash
npm install -g pm2
pm2 start dist/index.js --name bot-neahelike --node-args="--env-file=.env"
pm2 save && pm2 startup     # relance au démarrage de la machine
pm2 logs bot-neahelike      # suivre les logs
```

Ou avec **systemd** (`/etc/systemd/system/bot-neahelike.service`) :

```ini
[Unit]
Description=Bot Discord Néa Hélikè
After=network-online.target

[Service]
WorkingDirectory=/opt/bot-neahelike
ExecStart=/usr/bin/node --env-file=.env dist/index.js
Restart=always
RestartSec=5
User=bot

[Install]
WantedBy=multi-user.target
```

### Avec Docker

```dockerfile
FROM node:22-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && pnpm prune --prod
CMD ["node", "dist/index.js"]
```

Le fichier `.dockerignore` du dépôt garde `.env`, `node_modules` et `.git` hors de l'image : le token n'y est jamais copié.

```bash
docker build -t bot-neahelike .
docker run -d --restart unless-stopped --env-file .env --name bot-neahelike bot-neahelike
```

### Mettre à jour

```bash
git pull
pnpm install --frozen-lockfile
pnpm build
pm2 restart bot-neahelike    # ou systemctl restart bot-neahelike
```

Le bot s'arrête proprement (`SIGINT` / `SIGTERM`) : il se déconnecte de Discord et ferme la base avant de quitter.

### Ce que fait le bot au démarrage

1. Valide les variables d'environnement.
2. Vérifie que les tables indispensables existent en base. S'il en manque, il s'arrête avec la liste.
3. Vérifie les tables propres à chaque module (tickets, giveaways, casier, blacklist). Un module dont une table manque est **mis hors service**, avec un avertissement dans les logs. Les autres modules démarrent normalement.
4. Se connecte à Discord, vérifie qu'il est bien sur le serveur `DISCORD_GUILD_ID`, enregistre ses commandes `/` et applique son profil (statut, activité).
5. Lance chaque module : resynchronisation de la présence des comptes du site, relais du journal du site, nettoyage des vocaux temporaires, tâches régulières.

Une reconnexion à Discord après une coupure relance la resynchronisation de la présence, pour rattraper les événements manqués.

---

## Premiers réglages sur Discord

À faire une fois le bot en ligne, par un administrateur du serveur. Chaque panneau a un bouton **❓ Aide**.

1. `/config` › **Accès** : lier les rôles du staff aux accès (par défaut Admin ▸ Staff ▸ Joueur).
2. `/config` › **Modules** : désactiver ce qui ne sert pas.
3. `/logs` : choisir le salon de chaque type de log (ou d'une catégorie entière), puis « Envoyer un essai ».
4. `/site` : salon où le staff suit les candidatures et les changements de rang du site (sélecteur du panneau).
5. `/accueil` : salon de bienvenue, rôle « Novice (Non WL) » à l'arrivée, texte et rôle du règlement, puis publication du règlement.
6. `/tickets` : catégorie Discord des tickets, salon des transcriptions, rôles de chaque catégorie, puis publication du panneau.
7. `/serveur` : adresse du serveur FiveM et lien de connexion, publication du statut, salons compteurs, vocaux temporaires.
8. `/soutien` : rôle soutien, tag du serveur et textes autorisés dans le statut.
9. `/config` › **Profil du bot** et **Messages** : pseudo, avatar, activité, textes envoyés par le bot.

---

## Commandes

Toutes les commandes existent en `/` **et** avec le préfixe (`+` par défaut, réglable) : `/config` et `+config` font la même chose. Les alias ne marchent qu'avec le préfixe.

Exceptions : `/casier`, `/blacklist` et `/fiche` n'existent **qu'en `/`**. Au préfixe, leur réponse s'afficherait dans le salon, visible de tous ; le bot retire alors le message tapé et renvoie vers la commande `/`, dont la réponse est privée.

« Visible pour » est la **permission Discord par défaut** : une commande `/` n'apparaît que pour les membres qui l'ont (voir [Permissions et accès](#permissions-et-accès)). Les commandes marquées 🔒 sont des commandes de configuration : elles ne peuvent jamais être ouvertes à tout le monde.

### Général et configuration

| Commande | Rôle | Visible pour |
|---|---|---|
| `/aide [commande]` (alias `help`) | Les commandes accessibles, module par module, avec des exemples | Tout le monde |
| `/ping` | Latence du bot | Tout le monde |
| `/config` 🔒 | Panneau : général, modules, accès, commandes, profil du bot, messages | Gérer le serveur |
| `/prefixe`, `/couleur` 🔒 | Raccourci vers `/config` › Général : préfixe des commandes, couleurs des embeds | Gérer le serveur |
| `/module` 🔒 | Raccourci vers `/config` › Modules : activer, désactiver ou réserver un module | Gérer le serveur |
| `/acces` 🔒 | Raccourci vers `/config` › Accès : créer, ordonner, renommer et lier aux rôles les accès du bot | Gérer le serveur |
| `/permission` 🔒 | Raccourci vers `/config` › Commandes : qui peut utiliser chaque commande | Gérer le serveur |
| `/profil` 🔒 | Raccourci vers `/config` › Profil du bot : pseudo, bio, avatar, bannière, statut, activité | Gérer le serveur |
| `/message` 🔒 | Raccourci vers `/config` › Messages : voir, modifier, essayer, rétablir les textes du bot | Gérer le serveur |

Aucune de ces commandes n'a de sous-commande : chacune ouvre le panneau de configuration sur sa page, et tout se fait avec les boutons et les menus. Les clics du panneau suivent l'accès de `/config`.

### Lien avec le site

| Commande | Rôle | Visible pour |
|---|---|---|
| `/candidature` | Où en est sa candidature (réponse privée), avec les boutons Ouvrir le portail, Actualiser et Comment ça marche | Tout le monde |
| `/fiche <joueur>` (seulement en `/`) | Compte du site, candidature, personnage, documents et décision d'un joueur, avec un lien vers sa fiche sur l'espace équipe (réponse privée) | Gérer les messages |
| `/site` 🔒 | Panneau : salon de logs staff (sélecteur), rôles des rangs et du parcours, resynchronisation de la présence | Gérer le serveur |
| `/blacklist` (seulement en `/`) 🔒 | Panneau de la blacklist partagée avec le site : blacklister (membre ou ID, raison facultative), liste paginée, levée. Réservé aux rangs **admin** et **owner** du site | Bannir des membres |

### Accueil et vie du serveur

| Commande | Rôle | Visible pour |
|---|---|---|
| `/accueil` 🔒 | Panneau : bienvenue et départ, rôles à l'arrivée, règlement, panneaux de rôles | Gérer le serveur |
| `/serveur` 🔒 | Panneau : statut FiveM, compteurs, rôle soutien, vocaux temporaires | Gérer le serveur |
| `/soutien` 🔒 | Panneau du rôle soutien seul | Gérer le serveur |
| `/statut` | État du serveur FiveM (en ligne, joueurs) | Tout le monde |

### Tickets, giveaways, embeds

| Commande | Rôle | Visible pour |
|---|---|---|
| `/tickets` 🔒 | Panneau : catégories, rôles, questions, transcriptions, fermeture automatique, publication | Gérer le serveur |
| `/ticket` | Dans le salon d'un ticket : état du ticket et ses boutons (prendre en charge, fermer, ajouter ou retirer un membre) ; équipe de la catégorie, ou auteur pour fermer | Tout le monde |
| `/giveaway` (alias `gw`) | Panneau des giveaways : création (salon, rôle, durée, lot, gagnants, aperçu), suivi, tirage immédiat, nouveau tirage, annulation | Gérer le serveur |
| `/embed` (alias `annonce`) | Créateur d'embeds avec aperçu en direct, Défaire et Refaire | Gérer les messages |

### Modération

| Commande | Rôle | Visible pour |
|---|---|---|
| `/warn <membre> [raison]` (alias `avertir`) | Avertissement : message privé et casier | Exclure temporairement |
| `/timeout <membre> <durée> [raison]` (alias `mute`, `exclure`) | Exclusion temporaire, 28 jours au plus | Exclure temporairement |
| `/untimeout <membre> [raison]` (alias `unmute`) | Lève une exclusion | Exclure temporairement |
| `/kick <membre> [raison]` (alias `expulser`) | Expulsion | Expulser des membres |
| `/ban <membre ou ID> [raison]` (alias `bannir`) | Bannissement définitif, même pour quelqu'un qui a quitté le serveur | Bannir des membres |
| `/tempban <membre ou ID> <durée> [raison]` | Bannissement temporaire (un an au plus), levé automatiquement | Bannir des membres |
| `/unban <ID> [raison]` (alias `debannir`) | Lève un bannissement | Bannir des membres |
| `/casier [membre]` (seulement en `/`) | Panneau du casier : choix du membre (ou ID saisi), sanctions, retrait d'une sanction depuis un menu | Exclure temporairement |
| `/salon [salon]` (alias `salons`) | Panneau d'un salon : état pour @everyone, verrouiller, cacher, mode lent (menu), supprimer des messages, dernier message supprimé, recréer. Chaque bouton suit l'accès de sa commande | Gérer les salons |
| `/clear <nombre> [membre]` (alias `purge`) | Supprime les derniers messages (100 au plus, de moins de 14 jours) | Gérer les messages |
| `/snipe` | Dernier message supprimé du salon (10 minutes) | Gérer les messages |
| `/lock`, `/unlock` `[salon] [raison]` | Verrouiller ou rouvrir l'écriture pour @everyone | Gérer les salons |
| `/hide`, `/unhide` `[salon] [raison]` | Cacher ou montrer un salon à @everyone | Gérer les salons |
| `/slowmode <durée> [salon]` (alias `lent`) | Mode lent (6 heures au plus, `0` pour retirer) | Gérer les salons |
| `/nuke [salon]` 🔒 | Recrée un salon vide, après confirmation | Gérer le serveur |

Les durées s'écrivent `30s`, `10m`, `2h`, `1h30`, `3j`, `1sem` (anglais accepté : `d`, `w`). Avec le préfixe, sans espace : `1h30`, pas `1h 30m`.

### Informations

| Commande | Rôle | Visible pour |
|---|---|---|
| `/userinfo [membre]` (alias `ui`, `membre`) | Compte, arrivée, rôles, exclusion en cours | Tout le monde |
| `/serverinfo` (alias `si`) | Membres, salons, rôles, boosts | Tout le monde |
| `/pic [membre]` (alias `avatar`, `pp`) | Avatar en grand (profil et serveur) | Tout le monde |
| `/banner [membre]` (alias `banniere`) | Bannière du profil | Tout le monde |

---

## Permissions et accès

Deux mécanismes se combinent.

**1. La permission Discord par défaut.** Chaque commande déclare une permission Discord (Gérer le serveur, Bannir des membres…). Discord **cache la commande de la liste `/`** aux membres qui ne l'ont pas. C'est le comportement par défaut, sans aucun réglage.

**2. Les accès du bot** (`/config` › Accès), pour des règles plus fines :

- un accès est un niveau de l'échelle (par défaut **Admin ▸ Staff ▸ Joueur**), lié à un ou plusieurs rôles Discord ;
- un accès placé plus haut a tous les droits de ceux du dessous ;
- on peut réserver une **commande** ou tout un **module** à un accès ;
- règle appliquée : réglage de la commande, sinon réglage de son module, sinon permission Discord par défaut ;
- les **administrateurs Discord** passent toujours ;
- les commandes de configuration (🔒) ne peuvent jamais être ouvertes à tout le monde.

Le bot **revérifie l'accès à chaque utilisation** : en `/`, en préfixe, et à chaque clic sur un bouton ou un menu d'un panneau. Un panneau ne peut être utilisé que par la personne qui l'a ouvert.

Si un accès ouvre une commande à des membres qui n'ont pas sa permission Discord, Discord ne la leur affiche pas dans la liste `/`. Ils peuvent quand même l'utiliser avec le préfixe.

**Réponses privées** : en `/`, elles sont éphémères (visibles seulement par l'auteur). Avec le préfixe, le message de commande est retiré et la réponse part en MP. Si les MP sont fermés, elle s'affiche dans le salon et s'efface après 10 secondes.

---

## Fonctionnement de chaque module

Chaque module peut être désactivé dans `/config` › Modules, sauf **Général** et **Configuration**.

### Général et configuration

- `/aide` ne montre que les commandes que le membre peut utiliser, avec un menu par module et des exemples.
- `/config` regroupe tous les réglages en panneau :
  - **Général** : préfixe, effacement des panneaux et les trois couleurs des embeds ;
  - **Modules**, **Accès**, **Commandes** ;
  - **Profil du bot** : pseudo, bio, avatar et bannière propres au serveur, statut, activité ;
  - **Messages** : chaque texte envoyé par le bot, ses variables, un aperçu et un essai.
- **Effacement des panneaux** (`src/core/expiry.ts`) : un panneau ouvert par une commande s'efface après **10 minutes sans clic** par défaut. Le délai se règle dans `/config` › Général : 2, 5, 10 ou 15 minutes, ou jamais. Chaque clic remet le compteur à zéro.
  - Un panneau privé (`/`) ne peut être effacé qu'avec le jeton de la dernière interaction, valable 15 minutes : le délai ne peut donc pas dépasser 15 minutes après le dernier clic qui a mis le panneau à jour.
  - Un panneau ouvert au préfixe est un message du salon, effacé au délai réglé.
  - Les messages publiés (règlement, panneau des tickets, statut FiveM, giveaways, embeds) ne sont jamais effacés.
  - Les minuteurs vivent en mémoire : un panneau ouvert avant un redémarrage du bot n'est pas effacé.

### Lien avec le site

- **Présence** :
  - le bot tient à jour en temps réel la présence des comptes du site sur le serveur (`users.in_guild`) ; le pseudo et l'avatar suivent à chaque changement de rôles, arrivée ou resynchronisation ;
  - il écrit les événements `discord.rejoint` / `discord.quitte`, comme le site ;
  - quand les rôles d'un membre changent, il demande au site de relire son rang (voir [Le bot et le site](#le-bot-et-le-site)) ;
  - au démarrage et après une coupure, il compare tous les comptes du site aux membres du serveur et corrige les écarts ;
  - il ne crée jamais de compte.
- `/candidature` lit la **dernière candidature** du joueur :
  - brouillon ;
  - envoyée, avec sa date ;
  - modification demandée, avec les étapes et le commentaire ;
  - entretien : la **prochaine session de whitelist** choisie par le recruteur à la validation écrite (affichée à l'heure de chacun dans Discord), avec le rappel que les entretiens ont lieu pendant les sessions, quand l'équipe est disponible ;
  - whitelisté ;
  - refusée, avec les motifs, le commentaire et la date à partir de laquelle il peut recandidater (3 mois, comme sur le site) ; si un admin a levé ce délai, le joueur peut recandidater tout de suite ;
  - délai gardé par le site après la suppression d'un ancien compte (`reapply_locks`) : la date à partir de laquelle il peut recandidater ;
  - whitelist retirée par un admin : comme sur le portail, l'ancienne candidature ne compte plus et le parcours repart de zéro.

  Boutons : **Ouvrir le portail**, **Actualiser** (relit le statut) et **Comment ça marche** (les étapes de la candidature).

  Le rôle « Magistrat (wl) » passe toujours en premier. Sans candidature, le bot se fie aux rôles du parcours.
- `/fiche @joueur` : compte (rang, CGU, présence), candidature (statut, dates, relecteur, session de whitelist, délai levé, whitelist retirée), personnage, HRP, liens du background et du dossier, décision. Les notes de l'équipe restent sur le site.
- **Logs staff** (`/site`) :
  - le bot lit le journal `events` du site toutes les 20 s ;
  - il publie les candidatures envoyées ou renvoyées, validées, à modifier, refusées (avec les motifs), les entretiens validés, les candidatures effacées, les changements de rang, et les blacklists posées ou levées (depuis le site ou le bot) ;
  - chaque log a un bouton vers la fiche du joueur sur l'espace équipe ;
  - la position de lecture est gardée en base : au premier démarrage, l'historique n'est pas republié ;
  - rien n'est perdu : si le salon refuse un envoi (coupure Discord, salon inaccessible), la lecture n'avance pas et l'événement est retenté au passage suivant ;
  - les 2 dernières minutes sont relues à chaque passage : un événement que le site a validé après un plus récent est quand même relayé, une seule fois.

### Blacklist (`/blacklist`)

La blacklist est **partagée avec le site** (table `blacklist`, migration 0017 du site) : une personne blacklistée d'un côté l'est aussi de l'autre.

- **Accès** : réservé aux rangs **admin** et **owner** du site (lus dans `users.rank`), revérifié à chaque clic. La commande demande aussi « Bannir des membres » par défaut.
- **Blacklister** : sélecteur de membre, ou « Saisir un ID » pour quelqu'un qui n'est pas sur le serveur ; raison facultative dans un formulaire. Le bot inscrit l'ID (`source = 'bot'`), envoie un message privé au membre, puis le bannit. Il refuse soi-même, un owner, un membre au rôle plus haut et un ID déjà blacklisté. Si le bannissement échoue, la ligne reste et le panneau le signale.
- **Liste** : 10 personnes par page, la plus récente d'abord : nom du compte du site (ou ID), raison, date, auteur, origine (site ou Discord).
- **Lever** : menu limité aux personnes de la page affichée, puis confirmation. La ligne est retirée et le bannissement levé.
- **La table fait foi** : un débannissement à la main ne lève pas la blacklist. Si la personne revient sur le serveur, le bot la bannit de nouveau et le signale dans le salon de logs staff ; s'il n'y arrive pas, une alerte y part pour que l'équipe la bannisse à la main.
- **Tout ou rien** : la ligne de blacklist, le retrait de whitelist et l'événement du site sont écrits dans une seule transaction (de même pour la levée). Un échec en cours de route ne laisse rien à moitié.
- **Journal du site** : `compte.blacklist` et `compte.blacklist_levee` (avec la raison), seulement si la personne a un compte sur le site (`events` pointe vers `users`).
- **Whitelist retirée**, comme sur le site : si la dernière candidature est whitelistée, le bot y note le retrait (`whitelist_revoked_at`, raison `Blacklist`, auteur s'il a un compte). Après une levée, le joueur doit donc recandidater.

### Accueil (`/accueil`)

- **Bienvenue et départ** : un salon pour chacun (vide pour désactiver), textes modifiables, message privé de bienvenue facultatif, bouton « Essai ».
- **Rôles à l'arrivée** : jusqu'à 5, donnés à chaque nouveau membre.
- **Règlement** : texte modifiable, rôle donné par le bouton « J'accepte », message publié mis à jour tout seul quand le texte change.
- **Panneaux de rôles** : jusqu'à 10 panneaux de 25 rôles, en boutons (un clic prend ou rend le rôle) ou en menu déroulant, avec l'option « un seul rôle à la fois » (couleurs).
- Le bot refuse de distribuer un rôle géré par une intégration, placé au-dessus du sien, ou qui donne des permissions de gestion ou de modération. Il le revérifie à chaque clic.

### Vie du serveur (`/serveur`, `/soutien`, `/statut`)

- **Statut FiveM** :
  - le bot interroge `http://<adresse>/dynamic.json` du serveur FiveM chaque minute (délai de 5 s, pas de redirection) ;
  - le message de statut publié affiche en ligne ou hors ligne, le nombre de joueurs et un bouton « Se connecter » vers le lien cfx.re ;
  - `/statut` le montre à tout le monde.
- **Compteurs** : membres, joueurs en jeu, citoyens whitelistés (porteurs de `DISCORD_ROLE_WL`).
  - Le nom de chaque salon suit un modèle (`👥 Membres : {n}`).
  - Discord limite les renommages à 2 toutes les 10 minutes par salon : mise à jour toutes les 10 minutes, seulement si la valeur a changé.
- **Rôle soutien** :
  - donné à qui affiche le **tag du serveur** sur son profil (si l'option est active), ou dont le **statut personnalisé** contient l'un des **textes autorisés** (25 au plus, sans tenir compte des majuscules ni des accents) ;
  - retiré sinon. Un membre hors ligne garde son rôle, car Discord ne transmet plus son statut ;
  - vérifié à chaque changement de statut ou de profil, et pour tout le monde toutes les 15 minutes.
- **Vocaux temporaires** :
  - rejoindre le salon créateur ouvre un salon vocal personnel dans la même catégorie, avec les permissions de la catégorie ;
  - son créateur peut le renommer, le limiter et déplacer les membres ;
  - le salon est supprimé une fois vide. Ceux restés vides pendant un arrêt du bot sont supprimés au démarrage.

### Tickets (`/tickets`, `/ticket`)

- **Réglages** :
  - catégorie Discord où naissent les tickets ;
  - salon des transcriptions ;
  - fermeture automatique : jamais, ou après 1, 2, 3, 5, 7 ou 14 jours sans message ;
  - catégories de tickets, 20 au plus : nom, emoji, description, rôles de l'équipe, jusqu'à 5 questions posées à l'ouverture. Six sont proposées au départ : Support, Question whitelist, Plainte joueur, Plainte staff, Dossier de reprise, Partenariat.
- **Panneau public** : un bouton par catégorie, mis à jour tout seul quand les catégories changent.
- **Ouverture** : le joueur remplit le formulaire, un salon privé s'ouvre (lui et les rôles de la catégorie). Un seul ticket ouvert par catégorie et par membre, garanti par la base.
- **Dans le ticket** : prendre en charge (une seule personne, même avec deux clics simultanés), ajouter ou retirer un membre, fermer (avec une raison), rouvrir, supprimer le salon. `/ticket` affiche en privé l'état du ticket et ces boutons.
- **Fermeture** : transcription HTML envoyée dans le salon des transcriptions et gardée en base, salon verrouillé pour l'auteur, MP avec une note de satisfaction de 1 à 5. Si les messages du ticket n'ont pas pu être lus, la fermeture est annulée : le ticket reste ouvert plutôt que d'enregistrer une transcription vide.
- **Catégorie supprimée** : refusé tant qu'elle a des tickets ouverts (son équipe ne pourrait plus les gérer).
- **Salon supprimé à la main** : le ticket est fermé en base, même si le bot était arrêté à ce moment (vérification au démarrage).
- Chaque étape apparaît dans le log **Tickets**.

### Modération

- **Sanctions** (`/warn`, `/timeout`, `/kick`, `/ban`, `/tempban`) :
  - le membre reçoit un **message privé** (texte modifiable), envoyé **avant** l'expulsion ou le bannissement, sinon il ne le recevrait plus ;
  - la **hiérarchie des rôles** est respectée : on ne sanctionne ni soi-même, ni le propriétaire, ni le bot, ni un membre de rang égal ou supérieur au sien ou à celui du bot ;
  - la sanction n'est inscrite au casier **que si Discord l'a acceptée**. Si le casier est injoignable, un bannissement ou une exclusion qui vient d'être posé est annulé sur Discord.
- **Casier** (`/casier`, panneau) :
  - choix du membre dans un sélecteur, ou ID saisi pour quelqu'un qui a quitté le serveur ; `/casier @membre` ouvre directement son casier ;
  - retrait d'une sanction depuis le menu « Retirer une sanction » (sanctions non levées seulement), avec la raison dans un formulaire ;
  - chaque sanction a un numéro (#12), un auteur, une raison, une durée et un état (en cours, terminée, levée) ;
  - rien n'est jamais supprimé : une sanction retirée est marquée levée, avec qui et pourquoi ;
  - retirer une sanction la lève aussi sur Discord : un bannissement non levé l'est même s'il est échu (sauf si un autre bannissement du membre est en vigueur) ; une exclusion que le bot ne peut pas lever n'est pas retirée du casier ;
  - lever un bannissement demande la permission Bannir **ou** l'accès à `/unban` réglé dans `/config`.
- **Bannissements temporaires** : levés automatiquement dans la minute qui suit leur échéance, sauf si un autre bannissement du membre est encore en vigueur.
- **Logs** : bannissements, expulsions et exclusions arrivent dans les logs par le journal d'audit de Discord, avec l'auteur et la raison. Les avertissements ont leur propre type de log.
- **Outils de salon** (`/salon` les regroupe dans un panneau ; les commandes restent disponibles) :
  - `/clear` : garde les messages épinglés ; Discord n'efface pas en masse les messages de plus de 14 jours ;
  - `/lock` et `/unlock` : agissent sur l'écriture de @everyone ;
  - `/hide` : donne d'abord au bot un accès propre au salon, pour qu'il puisse le rendre visible ensuite ;
  - `/nuke` : recrée un salon (mêmes réglages et permissions, nouvel ID) après confirmation. Il refuse les salons réservés par Discord (règles, mises à jour de la communauté, messages système) et supprime la copie si Discord refuse la suppression de l'ancien salon ;
  - `/snipe` : garde **en mémoire seulement** le dernier message supprimé de chaque salon, pendant 10 minutes.

### Logs (`/logs`)

18 types de logs, chacun dans le salon de votre choix (plusieurs types peuvent partager un salon) :

| Catégorie | Types |
|---|---|
| Messages | Messages supprimés, modifiés, suppressions en masse (avec la copie des messages en fichier) |
| Membres | Arrivées (âge du compte), départs (rôles qu'ils avaient), pseudos, rôles des membres, boosts |
| Modération | Bannissements, expulsions, exclusions temporaires (auteur et raison lus dans le journal d'audit), avertissements |
| Vocal | Entrées, sorties, changements de salon |
| Serveur | Salons, rôles, invitations, fils de discussion |
| Tickets | Ouvertures, prises en charge, fermetures, réouvertures |

Les messages des salons de logs eux-mêmes ne sont jamais journalisés. Le contenu d'un message supprimé n'est connu que si le bot l'a vu passer depuis son dernier démarrage.

### Giveaways (`/giveaway`)

Tout se fait depuis le panneau ouvert par `/giveaway` :

- **Accueil** : les giveaways en cours, puis ceux terminés ou annulés depuis moins de 7 jours ; un menu pour en gérer un ; le bouton « Nouveau giveaway ».
- **Création** :
  - sélecteur du salon de publication et du rôle exigé (facultatif) ;
  - menu de durées (10 minutes à 30 jours), ou durée libre dans le formulaire ;
  - formulaire pour le lot, le nombre de gagnants (1 à 20) et la description ;
  - aperçu en direct du message tel qu'il sera publié ; « Publier » s'active quand le lot et le salon sont choisis ;
  - le brouillon est gardé une heure en mémoire, propre à chaque membre.
- **Participation** : le message publié porte un bouton **Participer** ; un second clic retire la participation. Le compteur de participants est mis à jour par lots.
- **Tirage automatique** dans les 15 secondes qui suivent la fin, au hasard (aléatoire cryptographique), parmi les participants **encore sur le serveur** et porteurs du rôle exigé. Le message est mis à jour et les gagnants sont félicités.
- **Gestion d'un giveaway** : tirer maintenant, nouveau tirage une fois terminé (les gagnants du dernier tirage sont écartés), annuler (avec confirmation), lien vers le message.

### Créateur d'embeds (`/embed`)

- Éléments : titre, description, couleur, auteur, images, pied de page, horodatage, champs (25 au plus), mention d'un rôle.
- Aperçu en direct, Défaire et Refaire, vérification des limites de Discord.
- Publication dans le salon choisi. Le brouillon est gardé deux heures en mémoire.

### Informations

`/userinfo`, `/serverinfo`, `/pic`, `/banner` : données publiques de Discord, sans rien lire en base.

---

## Architecture du code

```
src/
├── index.ts                  Démarrage : client Discord, intents, vérification de la base, modules, arrêt propre
├── env.ts                    Variables d'environnement validées (zod)
├── logger.ts                 Logs pino
├── db/
│   ├── index.ts              Client PostgreSQL (sans requêtes préparées, pour le pooler Supabase)
│   ├── check.ts              Tables indispensables et tables de chaque module
│   └── database.types.ts     Types générés depuis la base (pnpm db:types), à ne pas modifier à la main
├── config/
│   └── store.ts              Configuration du serveur en base (préfixe, couleurs, modules, accès, messages), avec cache
├── core/                     Socle partagé par tous les modules
│   ├── command.ts            defineCommand : une commande servie en / et en préfixe ; permissions par défaut
│   ├── dispatch.ts           Réception des interactions et des messages, contrôle d'accès, lecture des arguments
│   ├── context.ts            CommandContext : réponse commune aux deux modes, réponses privées
│   ├── args.ts               Découpage des arguments en préfixe
│   ├── permissions.ts        Échelle des accès, résolution d'une exigence
│   ├── access.ts             Module actif ? membre autorisé ? modules hors service
│   ├── components.ts         Boutons, menus et formulaires : identifiants, propriétaire du panneau
│   ├── panels.ts             Kit d'interface (boutons, « Fais un choix », formulaires, ICON)
│   ├── embeds.ts             Embeds aux couleurs du serveur
│   ├── messages.ts           Textes personnalisables
│   ├── templates.ts          Variables des textes ({user}, {server}…)
│   ├── duration.ts           Lecture et affichage des durées (30m, 1h30, 3j…)
│   ├── published.ts          Relecture d'un message publié (supprimé ou erreur passagère ?)
│   ├── errors.ts             UserError : erreur affichée telle quelle au membre
│   └── registry.ts           Liste des modules et des commandes, vérifications au démarrage
└── modules/                  Un dossier par module
    ├── index.ts              Liste des modules chargés, dans l'ordre de l'aide
    ├── general/              /aide, /ping, messages système
    ├── config/               Panneau /config et ses raccourcis (/acces, /module…), profil du bot
    ├── site/                 Présence, /candidature, /fiche, /site, relais du journal du site
    ├── accueil/              /accueil : bienvenue, autorôle, règlement, panneaux de rôles
    ├── serveur/              /serveur, /soutien, /statut : FiveM, compteurs, soutien, vocaux temporaires
    ├── tickets/              /tickets, /ticket : panneau public, salons, transcription, note
    ├── moderation/           Sanctions, casier (panneau), levée des bannissements temporaires
    ├── blacklist/            Blacklist partagée avec le site (panneau /blacklist)
    ├── salons/               Panneau /salon, /clear, /lock, /hide, /slowmode, /nuke, /snipe
    ├── logs/                 /logs et écoute des événements du serveur
    ├── embeds/               /embed : brouillon, aperçu, publication
    ├── giveaways/            /giveaway : participation, tirage
    └── infos/                /userinfo, /serverinfo, /pic, /banner

tests/                        Tests Vitest (*.integration.test.ts : avec une base de test)
docs/guide-staff.md           Guide d'utilisation pour le staff
```

Un module type contient :
- `index.ts` : le `BotModule` (commandes, gestionnaires de composants, messages, écouteurs) ;
- `settings.ts` : réglages validés par zod, rangés dans `bot_modules.settings` ;
- `panel.ts` : panneau de configuration ;
- `ui.ts` : messages publics ;
- `store.ts` : requêtes SQL ;
- `logic.ts` : règles pures, testées sans Discord ni base.

### Principes

- **Une commande, deux modes.** `defineCommand` décrit la commande une seule fois : nom, description, options, permission par défaut. Elle sert en `/` et en préfixe. `CommandContext` cache la différence entre les deux.
- **Les panneaux sont des messages à composants.** Identifiant d'un composant : `préfixe:propriétaire:action:arguments`. Le dispatcher vérifie que celui qui clique est bien le propriétaire (`*` pour un bouton public) et **revérifie la permission de la commande à chaque clic**.
- **Réglages en base, validés par zod.** Une valeur invalide en base est ignorée (valeurs par défaut) plutôt que d'arrêter le bot.
- **Une erreur de module n'arrête pas le bot.** Une `UserError` est montrée au membre ; toute autre erreur est journalisée, et le membre voit un message générique. Un module dont une table manque est mis hors service, les autres continuent.
- **Discord peut échouer à tout moment.** Une erreur passagère (panne, limite de débit) ne fait jamais oublier un message publié ni sauter un contrôle. Seule une réponse « inconnu » de Discord vaut suppression.
- **Rien n'est écrit dans la structure de la base.** Le bot ne fait que lire et écrire des lignes (voir [Base de données](#base-de-données)).

### Ajouter un module

1. Créer `src/modules/<id>/index.ts` qui exporte un `BotModule` : `id`, `label`, `icon`, `description`, `commands`, `components`, `messages`, `setup` (écouteurs d'événements, avant la connexion) et `onReady` (tâches de démarrage et tâches régulières).
2. L'ajouter à `src/modules/index.ts`.
3. Pour des réglages : un schéma zod rangé dans `bot_modules.settings` (exemple : `src/modules/accueil/settings.ts`).
4. Pour une nouvelle table : demander la migration au dépôt du site, puis `pnpm db:types` ici. Déclarer la table dans `tables` du module : tant qu'elle manque, le module est mis hors service au lieu d'arrêter le bot.
5. Ajouter les tests : logique pure, rendu des panneaux (limites de Discord), et intégration si le module écrit en base.

---

## Base de données

Le bot utilise **la base PostgreSQL du site**. **Le schéma et les migrations vivent uniquement dans le dépôt du site** (`src/db/schema.ts` et `drizzle/`), y compris pour les tables du bot. Le bot ne crée, ne modifie et ne supprime **aucune table**.

### Tables du bot

| Table | Contenu |
|---|---|
| `bot_guild_config` | Configuration du serveur : préfixe, couleurs, profil du bot (pseudo, bio, avatar, bannière), statut, activité |
| `bot_permission_levels` | Accès du bot (nom, ordre) |
| `bot_permission_level_roles` | Rôles Discord liés à chaque accès |
| `bot_modules` | Par module : actif ou non, accès requis, réglages (JSON validé par le module) |
| `bot_command_permissions` | Accès requis par commande |
| `bot_messages` | Textes personnalisés (sans ligne : texte par défaut du code) |
| `bot_tickets` | Tickets : numéro, catégorie, auteur, salon, réponses, prise en charge, fermeture, transcription, note |
| `bot_giveaways` | Giveaways : lot, salon et message, gagnants, rôle exigé, échéance, statut |
| `bot_giveaway_entries` | Participants (une ligne par participant) |
| `bot_sanctions` | Casier : numéro, membre, auteur, type, raison, échéance, levée. Jamais supprimé |

Tous les réglages des modules (accueil, vie du serveur, tickets, logs, lien avec le site, effacement des panneaux) sont dans `bot_modules.settings`. Une valeur invalide en base (édition à la main, schéma resserré depuis) n'emporte pas tout le réglage : seul le champ, ou l'élément de liste, en cause est ignoré et signalé dans les journaux. Les tables propres aux modules (`bot_tickets`, `bot_giveaways`, `bot_giveaway_entries`, `bot_sanctions`) sont déclarées par ces modules : si l'une manque, seul son module est mis hors service.

### Tables du site utilisées par le bot

| Table | Usage |
|---|---|
| `users` | **Écrit** : présence (`in_guild`), pseudo, avatar, et `roles_synced_at = null` pour demander au site de relire le rang. **Jamais** `rank`, ni les CGU, ni aucune suppression |
| `events` | **Lu** pour les logs staff. **Écrit** : `discord.rejoint`, `discord.quitte`, `compte.blacklist` et `compte.blacklist_levee` |
| `applications` | **Lu** : `/candidature`, `/fiche` (dont la session de whitelist et le délai levé, migration 0019). **Écrit** : seulement le retrait de whitelist (`whitelist_revoked_*`) quand `/blacklist` vise un joueur whitelisté |
| `blacklist` | **Lu et écrit** : `/blacklist` (ajout avec `source = 'bot'`, levée), nouveau bannissement d'un blacklisté qui revient |
| `role_ranks` | **Lu** : `/site` (rôles qui donnent les rangs du site ; une ligne `joueur` ne donne aucun droit) |
| `reapply_locks` | **Lu** : `/candidature` (délai de recandidature gardé après la suppression d'un ancien compte) |

Toutes les tables ont la sécurité au niveau des lignes (RLS) activée sans règle : seul le propriétaire des tables (l'utilisateur de `DATABASE_URL`) y accède. Le bot doit donc se connecter **avec le même utilisateur que le site**.

### Connexion

`src/db/index.ts` désactive les requêtes préparées (`prepare: false`) : c'est indispensable derrière un pooler en mode transaction (Supabase, PgBouncer). Les dates sont gardées en texte ISO, comme dans les types générés.

### Types

Après chaque migration du site qui touche une table utilisée par le bot :

```bash
pnpm exec supabase login     # une seule fois
pnpm db:types                # utilise SUPABASE_PROJECT_ID
```

Sans Supabase, les types peuvent être écrits à la main dans `src/db/database.types.ts` en suivant le même format.

### Ajouter une table pour le bot

1. Décrire la table au dépôt du site : colonnes en `snake_case`, contraintes nommées, RLS activée.
2. Le site ajoute la table à `src/db/schema.ts`, génère la migration, l'applique.
3. Ici : `pnpm db:types`, puis déclarer la table dans `tables` du module concerné.

---

## Le bot et le site

Ce sont **deux programmes distincts** qui partagent **la même base PostgreSQL** et **la même application Discord**.

| | Bot (ce dépôt) | Site (`neahelike`) |
|---|---|---|
| Ce que c'est | Processus Discord connecté en permanence | Application web Next.js |
| Discord | Passerelle : réagit aux événements du serveur ; commandes, panneaux | Appels REST ponctuels avec le token : lire un membre, donner un rôle, envoyer un MP |
| Base | Tables `bot_*` ; présence dans `users` ; `blacklist` (partagée) ; lit `events`, `applications`, `role_ranks` | Toutes les autres tables ; **possède le schéma et les migrations** |

Règles de cohabitation :

- **Rangs du site** (joueur, recruteur, admin, owner) : calculés **par le site seul** (owners, rôles réglés dans *Administration › Rôles*). Le bot ne les écrit jamais.
  - Quand les rôles d'un membre changent sur Discord, ou qu'il quitte le serveur, le bot remet `roles_synced_at` à `null` : le site relit le rang à la page suivante.
  - Le site garde sa propre synchronisation (connexion, toutes les 5 minutes) : il fonctionne bot éteint, avec un peu plus de délai.
- **Rôles du parcours whitelist** (« attente de wl », « Magistrat (wl) », « Novice (Non WL) ») :
  - donnés et retirés **par le site** au moment des décisions, même bot éteint ; le bot ne fait que les lire ;
  - ne les mettez ni dans les rôles à l'arrivée ni dans un panneau de rôles. Seule exception : « Novice (Non WL) » en rôle à l'arrivée, compatible avec le site.
- **Candidatures** : le bot ne fait que les lire. Les décisions se prennent sur l'espace équipe du site ; le bot les relaie dans le salon de logs staff.
- **Demandes des joueurs** (par exemple la suppression de compte prévue par les CGU) : par **ticket**. Un admin agit ensuite depuis la fiche du joueur sur le site.
- **Une seule instance du bot** avec ce token.

---

## Modifier les textes

Tous les textes envoyés par le bot se modifient **depuis Discord** : `/config` › Messages (ou `/message`). Sans texte personnalisé, le bot utilise le texte par défaut du code.

| Clé | Texte |
|---|---|
| `permission.refusee`, `module.desactive`, `erreur.inattendue` | Messages système |
| `candidature.lien`, `candidature.statut.*` (10 états, dont `{session}` pour l'attente du vocal) | `/candidature` |
| `accueil.bienvenue`, `accueil.bienvenue-mp`, `accueil.depart`, `accueil.reglement` | Accueil (aussi depuis `/accueil`) |
| `tickets.panneau`, `tickets.bienvenue`, `tickets.fermeture-mp` | Tickets |
| `moderation.mp` | Message privé au membre sanctionné |

Variables communes : `{user}` (mention), `{user.name}` (nom affiché), `{user.tag}`, `{user.id}`, `{server}`, `{count}` (membres), `{channel}`. Chaque texte indique ses variables propres (par exemple `{raison}`, `{duree}`, `{lien}`).

Les libellés de la candidature (étapes, critères de refus, affinités, créatures) sont recopiés du site dans `src/modules/site/labels.ts`. Une valeur ajoutée sur le site s'affiche sous son identifiant tant que ce fichier n'est pas mis à jour.

---

## Tests

```bash
pnpm typecheck
pnpm lint
pnpm test
```

- **Tests rapides** (sans base ni réseau) :
  - règles des accès, arguments en préfixe, durées, textes ;
  - panneaux et limites de Discord : 5 rangées, 25 options, identifiants de 100 caractères ;
  - embeds, logs, tickets, accueil, rôle soutien, giveaways, modération, informations.
- **Tests d'intégration** (`*.integration.test.ts`) : stockage de la configuration, présence des comptes du site, candidatures et journal, tickets, giveaways, casier, blacklist. Discord est simulé. Ils ne tournent que si `TEST_DATABASE_URL` est défini, vers une base **de test** où les migrations du site ont été appliquées, **jamais la production** :

  ```bash
  # dans le dépôt du site : appliquer les migrations sur une base de test
  DATABASE_URL=postgres://.../nea_test pnpm db:migrate
  # ici
  TEST_DATABASE_URL=postgres://.../nea_test pnpm test
  ```

  Les tests n'écrivent que des lignes de test (serveurs et membres aux ID `1000…`, `3000…`, `9000…`) et les effacent.

---

## Sécurité

- **Aucun secret dans le dépôt** : tout passe par les variables d'environnement (`.env` est ignoré par git). Le token et l'adresse de la base ne sont jamais journalisés.
- **Contrôle d'accès à chaque action** : commande `/`, préfixe, et chaque clic sur un composant. Un panneau n'obéit qu'à celui qui l'a ouvert.
- **Hiérarchie des rôles** respectée pour toute sanction et tout retrait de sanction. Lever un bannissement demande la permission Bannir ou l'accès à `/unban`.
- **Distribution de rôles bornée** : le bot ne donne jamais un rôle qui porte des permissions de gestion ou de modération, ni un rôle au-dessus du sien. Il le revérifie au moment de le donner.
- **Mentions maîtrisées** : jamais de `@everyone` ou `@here` involontaire. Les messages de logs ne notifient personne.
- **Requêtes SQL paramétrées** partout. Le bot n'écrit dans les tables du site que la présence (`users`) et deux types d'événements.
- **Données personnelles minimales** : `/snipe` ne garde qu'en mémoire, 10 minutes, le dernier message supprimé de chaque salon. Les transcriptions de tickets sont gardées en base pour l'équipe.
- **Statut FiveM** : le bot n'interroge que l'adresse réglée par un administrateur, sans suivre de redirection.

---

## À faire avant le déploiement

- [ ] **Application Discord** : intents privilégiés activés (Server Members, Message Content, Presence), bot invité avec les permissions (voir [Configurer l'application Discord](#configurer-lapplication-discord)), **rôle du bot placé au-dessus** des rôles qu'il gère et des rôles du parcours whitelist.
- [ ] **Hébergement** : un processus Node 22 qui tourne en continu, redémarré automatiquement (PM2, systemd ou Docker), **une seule instance**.
- [ ] **`.env`** : `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `DATABASE_URL` (même base et même utilisateur que le site), `SITE_URL` (adresse de **production** du site), `DISCORD_ROLE_ATTENTE_WL`, `DISCORD_ROLE_WL`.
- [ ] **Base** : migrations du site appliquées (au moins jusqu'à la `0019` : giveaways, casier, blacklist, session de whitelist). Au démarrage, aucun module ne doit être signalé « hors service ».
- [ ] **Serveur FiveM** (`/serveur` › Statut FiveM) :
  - remplacer les exemples par la vraie adresse `IP:port` (exemple : `51.75.12.34:30120`) et le vrai lien de connexion (exemple : `https://cfx.re/join/abc123`) ;
  - le port HTTP du serveur FiveM doit être joignable depuis l'hébergement du bot ;
  - publier ensuite le message de statut.
- [ ] **Accès** (`/config` › Accès) : lier les rôles du staff ; vérifier qui voit quoi avec `/aide` depuis un compte de chaque rang.
- [ ] **Logs** (`/logs`) et **logs staff** (`/site`) : salons choisis, essai envoyé.
- [ ] **Accueil** (`/accueil`) : salon de bienvenue, « Novice (Non WL) » en rôle à l'arrivée, règlement relu (le texte par défaut est provisoire) et publié.
- [ ] **Tickets** (`/tickets`) : catégorie Discord, salon des transcriptions, rôles de chaque catégorie, panneau publié. Une catégorie sans rôle n'est visible que des administrateurs.
- [ ] **Vie du serveur** (`/serveur`, `/soutien`) : compteurs, salon créateur des vocaux temporaires, rôle soutien et ses textes (lien d'invitation du Discord, nom du serveur…).
- [ ] **Textes** (`/config` › Messages) : relire les textes par défaut (bienvenue, règlement, MP de sanction, tickets).
- [ ] **Essai complet** sur le serveur : ouvrir et fermer un ticket, accepter le règlement, prendre un rôle, `/candidature`, un avertissement sur un compte de test puis `/casier`, un petit giveaway, `/blacklist` sur un compte de test puis sa levée.
