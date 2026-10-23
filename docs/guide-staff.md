# Guide du staff

Ce guide explique comment régler et utiliser le bot Néa Hélikè depuis Discord. Toutes les commandes existent en `/` et avec le préfixe (`+` par défaut) : `/config` et `+config` font la même chose.

Chaque panneau a un bouton **❓ Aide** qui rappelle ce qu'il faut savoir sur la page affichée.

## Qui voit quoi

- Une commande `/` n'apparaît dans la liste que pour les membres qui ont sa **permission Discord par défaut** :

  | Commandes | Permission Discord |
  |---|---|
  | `/config`, `/prefixe`, `/couleur`, `/module`, `/acces`, `/permission`, `/profil`, `/message`, `/site`, `/accueil`, `/serveur`, `/soutien`, `/tickets`, `/logs`, `/giveaway`, `/nuke` | Gérer le serveur |
  | `/warn`, `/timeout`, `/untimeout`, `/casier` | Exclure temporairement des membres |
  | `/kick` | Expulser des membres |
  | `/ban`, `/tempban`, `/unban`, `/blacklist` (réservée en plus aux admins et owners du site) | Bannir des membres |
  | `/salon`, `/lock`, `/unlock`, `/hide`, `/unhide`, `/slowmode` | Gérer les salons |
  | `/embed`, `/fiche`, `/clear`, `/snipe` | Gérer les messages |
  | `/aide`, `/ping`, `/candidature`, `/ticket`, `/statut`, `/userinfo`, `/serverinfo`, `/pic`, `/banner` | Tout le monde |

- Les **administrateurs Discord** peuvent toujours tout utiliser.
- Les panneaux et les réponses privées ne sont visibles que de la personne qui a lancé la commande. Avec le préfixe, le panneau s'affiche dans le salon, mais seul son auteur peut cliquer dessus.

## Premiers réglages

1. `/config`, puis **Accès** : liez vos rôles de staff aux accès.
2. `/config`, puis **Modules** : coupez ce dont vous n'avez pas besoin.
3. `/logs` : choisissez où partent les logs.
4. `/site`, puis le menu du salon : salon où le staff suit les candidatures (envoi, validation, modification demandée, refus, entretien) et les changements de rang du site.
5. `/accueil` : salon de bienvenue, rôle « Novice (Non WL) » à l'arrivée, règlement à publier.
6. `/config`, puis **Profil du bot** et **Messages** : pseudo, avatar, activité, textes.

## /config : le panneau de configuration

| Section | À quoi elle sert |
|---|---|
| **Général** | Préfixe des commandes écrites, et les trois couleurs des messages du bot (avec leur rendu). |
| **Modules** | Un bouton par module : vert = actif, gris = désactivé, cadenas = toujours actif. Le menu permet de réserver tout un module à un accès. |
| **Accès** | L'échelle des droits du bot. Un accès placé plus haut a tous les droits de ceux du dessous. Chaque accès est lié à un ou plusieurs rôles. Boutons Monter, Descendre, Renommer et Supprimer. |
| **Commandes** | Pour chaque commande, qui peut l'utiliser : par défaut (sa permission Discord), un accès et ceux au-dessus, ou tout le monde. |
| **Profil du bot** | Pseudo, bio, avatar et bannière sur ce serveur ; statut et activité. Aperçu en direct. |
| **Messages** | Les textes que le bot envoie, avec leurs variables (`{user}`, `{server}`…), un aperçu et un bouton pour s'envoyer un essai. |

Raccourcis : `/prefixe` et `/couleur` ouvrent **Général**, `/module` **Modules**, `/acces` **Accès**, `/permission` **Commandes**, `/profil` **Profil du bot** et `/message` **Messages**. Rien à taper : tout se fait avec les boutons et les menus.

### Accès ou permission Discord ?

Tant qu'aucun accès n'est réglé, une commande suit sa permission Discord : c'est le plus simple, et la liste `/` est alors exactement fidèle. Réglez un accès quand vous voulez une règle plus fine, par exemple « `/embed` réservé à l'accès Staff ».

Si un accès ouvre une commande à des membres **sans** sa permission Discord, ils ne la verront pas dans la liste `/`. Ils pourront quand même l'utiliser avec le préfixe (`+embed`).

## /accueil : bienvenue, règlement et rôles

- **Bienvenue et départ** : choisissez un salon pour chacun (vide pour désactiver) et modifiez les textes. Le message privé de bienvenue s'active d'un bouton. « Essai » montre le résultat avec votre profil.
- **Rôles à l'arrivée** : jusqu'à 5 rôles donnés à chaque nouveau membre, par exemple « Novice (Non WL) ».
- **Règlement** : écrivez le texte, choisissez le rôle donné en l'acceptant, puis publiez-le. Le message publié se met à jour tout seul quand vous changez le texte.
- **Panneaux de rôles** : jusqu'à 10 panneaux de 25 rôles, en boutons ou en menu déroulant. « Un seul rôle à la fois » convient aux couleurs.
- Le bot refuse les rôles placés au-dessus du sien et ceux qui donnent des permissions de gestion ou de modération. Les rôles de la whitelist (« attente de wl », « Magistrat (wl) ») sont donnés par le site : ne les mettez pas dans un panneau.

## /serveur : la vie du serveur

- **Statut FiveM** : indiquez l'adresse du serveur (IP:port) et le lien de connexion. Publiez le statut dans un salon : il se met à jour chaque minute. Tout le monde peut taper `/statut`.
- **Compteurs** : un salon par compteur (membres, joueurs en jeu, citoyens whitelistés). Prenez un salon vocal verrouillé ; son nom affiche la valeur (`{n}`). Mise à jour toutes les 10 minutes, limite imposée par Discord.
- **Rôle soutien** : donné automatiquement à qui affiche le tag du serveur sur son profil, ou l'un des **textes autorisés** dans son statut personnalisé (lien du Discord, nom du serveur…), et retiré sinon. Les majuscules et les accents ne comptent pas. Tout se règle depuis Discord, dans le panneau `/soutien` (ou `/serveur` ▸ Rôle soutien) : menu pour choisir le rôle, bouton « Ajouter un texte » (jusqu'à 25), menu « Retirer un texte », bouton pour compter ou non le tag du serveur, et « Vérifier tout le monde ».
- **Vocaux temporaires** : choisissez un salon créateur. En le rejoignant, un membre obtient son propre vocal dans la même catégorie, qu'il peut renommer et limiter ; le salon disparaît une fois vide.

## /giveaway : les giveaways

`/giveaway` ouvre le panneau des giveaways.

- **Nouveau giveaway** : choisissez le salon, le rôle exigé si besoin, la durée dans le menu, puis remplissez « Lot, gagnants, description ». L'aperçu montre le message final ; cliquez sur **Publier**. « Recommencer » efface le brouillon.
- Les membres cliquent sur **Participer** (un second clic retire leur participation). À la fin, le bot tire au sort parmi les participants encore sur le serveur et porteurs du rôle exigé, met à jour le message et félicite les gagnants.
- Dans le menu « Gérer un giveaway » : **Tirer maintenant**, **Annuler le giveaway** (avec confirmation), **Nouveau tirage** une fois terminé (les gagnants précédents sont écartés), et un lien vers le message.

## Modération

Chaque commande n'apparaît que pour les membres qui ont la permission Discord correspondante (Exclure, Expulser, Bannir, Gérer les messages, Gérer les salons) ; un accès réglé dans `/config` peut la remplacer.

- **Sanctions** : `/warn`, `/timeout membre duree` (28 jours au plus ; en préfixe, la durée s'écrit sans espace : `1h30`), `/untimeout`, `/kick`, `/ban` (aussi par identifiant, même si la personne a quitté le serveur), `/tempban membre duree` (débanni automatiquement), `/unban`. Le membre reçoit un message privé avant la sanction (texte modifiable : `/config` ▸ Messages). Personne ne peut sanctionner un membre de rang égal ou supérieur au sien, ni le propriétaire.
- **Casier** : `/casier` ouvre un panneau. Choisissez le membre dans le menu (ou « Saisir un ID » pour quelqu'un qui a quitté le serveur) ; `/casier @membre` l'ouvre directement. Ses sanctions sont numérotées (#12), avec l'auteur, la raison et l'état. Le menu « Retirer une sanction » en retire une, avec la raison du retrait ; si elle est en cours, le bannissement ou l'exclusion est levé aussi. Retirer un bannissement demande la permission « Bannir des membres », et la hiérarchie des rôles s'applique comme pour sanctionner.
- **Blacklist** : `/blacklist` ouvre un panneau, réservé aux admins et owners du site. La blacklist est la même que sur le site.
  - **Blacklister** : choisissez le membre dans le menu (ou « Saisir un ID » pour quelqu'un qui n'est pas sur le serveur) et donnez une raison si vous le souhaitez. La personne reçoit un message privé, puis est bannie. Elle ne peut plus non plus utiliser le site, et sa whitelist est retirée.
  - **Liste** : 10 personnes par page, avec la raison, la date, l'auteur et l'origine (site ou Discord).
  - **Lever** : choisissez la personne dans le second menu, puis confirmez. Son bannissement est levé ; sur le site, elle devra recandidater si elle n'est plus whitelistée.
  - Un débannissement à la main **ne lève pas** la blacklist : si la personne revient, le bot la bannit de nouveau. Passez toujours par « Lever ».
- Les bannissements, expulsions et exclusions arrivent dans les logs par le journal d'audit ; les avertissements ont leur propre type de log, « Avertissements ».
- **Salons** : `/salon` ouvre un panneau pour le salon où vous êtes (ou celui choisi dans le menu) : son état (verrouillé, caché, mode lent), et des boutons pour verrouiller ou déverrouiller, cacher ou montrer, régler le mode lent, supprimer des messages, revoir le dernier message supprimé et recréer le salon. Un bouton grisé vous est fermé. Les commandes existent aussi une par une : `/clear nombre [membre]` (100 au plus, messages de moins de 14 jours, épinglés gardés), `/lock` et `/unlock`, `/hide` et `/unhide`, `/slowmode 10s` (0 pour retirer), `/nuke` pour recréer un salon vide après confirmation (refusé pour les salons réservés par Discord ; le nouveau salon a un autre identifiant, à choisir de nouveau dans les panneaux du bot s'il y servait), `/snipe` pour revoir le dernier message supprimé (gardé 10 minutes, en mémoire seulement).
- **Informations** : `/userinfo`, `/serverinfo`, `/pic`, `/banner`, ouvertes à tous.

## /logs : les logs du serveur

- Choisissez un **type de log** dans le premier menu, puis son salon. Le bouton « Envoyer un essai » vérifie que tout fonctionne.
- Le second menu règle une **catégorie entière** d'un coup (Messages, Membres, Modération, Vocal, Serveur, Tickets), ou **tout**.
- Plusieurs types peuvent partager un salon ; un type sans salon est désactivé.

| Catégorie | Types |
|---|---|
| Messages | Messages supprimés, modifiés, suppressions en masse (avec la copie des messages en fichier) |
| Membres | Arrivées, départs, pseudos, rôles des membres, boosts |
| Modération | Bannissements, expulsions, exclusions temporaires (avec l'auteur et la raison), avertissements donnés avec le bot |
| Vocal | Entrées, sorties et changements de salon vocal |
| Serveur | Salons, rôles, invitations, fils de discussion |

Le contenu d'un message supprimé n'est connu que si le bot l'a vu passer depuis son dernier démarrage.

## /tickets : les tickets

**Réglages** (`/tickets`) :

1. **Où créer les tickets** : choisissez une catégorie Discord ; chaque ticket y devient un salon privé.
2. **Transcriptions** : le salon qui reçoit, à chaque fermeture, un résumé et la conversation complète en fichier HTML.
3. **Fermeture automatique** : jamais, ou après 1 à 14 jours sans message.
4. **Catégories** (Support, Question whitelist, Plainte joueur, Plainte staff, Dossier de reprise, Partenariat au départ) : pour chacune, les **rôles** qui voient et gèrent ses tickets, les **questions** posées à l'ouverture (5 au plus), le nom, l'emoji, la description et la place sur le panneau. Le bouton ➕ en ajoute.
5. **Publier le panneau** : choisissez un salon. Le panneau se met à jour tout seul quand vous changez les catégories.

**Côté joueur** : il clique sur une catégorie, répond au formulaire, et un salon privé s'ouvre, visible de lui et des rôles de la catégorie. Un seul ticket ouvert par catégorie à la fois.

**Dans un ticket** :

| Bouton ou commande | Qui | Effet |
|---|---|---|
| 🙋 Prendre en charge | Équipe | Indique qui s'occupe du ticket |
| ➕ Ajouter un membre, ➖ Retirer un membre | Équipe | Donne ou retire l'accès au salon (l'auteur ne peut pas être retiré) |
| 🔒 Fermer | Équipe ou auteur | Demande une raison, enregistre la transcription, verrouille le salon pour l'auteur et lui envoie en MP une note de 1 à 5 |
| 🔓 Rouvrir | Équipe | Rouvre le ticket fermé |
| 🗑️ Supprimer le salon | Équipe | Supprime le salon d'un ticket fermé (la transcription reste) |

Dans le salon d'un ticket, `/ticket` montre en privé l'état du ticket et ces mêmes boutons, pratique quand le message d'accueil est loin.

« L'équipe », c'est les rôles de la catégorie, ainsi que les membres qui ont « Gérer les salons ». Le type de log **Tickets** (dans `/logs`) suit les ouvertures, prises en charge, fermetures et réouvertures.

## /embed : le créateur d'embeds

1. Choisissez un élément dans le menu « Fais un choix » : titre, description, couleur, auteur, images, pied de page, horodatage, champs, mention d'un rôle.
2. Remplissez le formulaire : l'aperçu se met à jour aussitôt.
3. **Défaire** et **Refaire** annulent ou rétablissent une modification.
4. **Valider**, puis choisissez le salon : l'embed est publié.

Le brouillon est gardé deux heures. Relancez `/embed` pour le retrouver.

## Le lien avec le site

- Le rang du site (joueur, recruteur, admin, owner) se règle sur le site. Le bot prévient le site dès que les rôles d'un membre changent ; chaque changement de rang arrive dans le salon de logs staff. `/site` ouvre le panneau du lien avec le site : salon de logs staff, rôles des rangs, et « Resynchroniser » pour revérifier qui est encore sur le serveur.
- Les rôles du parcours (« attente de wl », « Magistrat (wl) ») sont donnés par le site.
- Les joueurs suivent leur candidature avec `/candidature` : brouillon, envoyée, modification demandée (étapes et commentaire), entretien, refus (motifs et date de la prochaine candidature possible), whitelist retirée (le parcours repart de zéro). La réponse n'est visible que d'eux, avec les boutons « Ouvrir le portail », « Actualiser » et « Comment ça marche ». Les textes se modifient dans `/config` ▸ Messages.
- `/fiche @joueur` affiche son compte, sa candidature (et un éventuel retrait de whitelist), son personnage, ses documents et la décision, avec un bouton vers sa fiche sur l'espace staff du site. La réponse n'est visible que de vous. Les notes de l'équipe restent sur le site.
- Les décisions prises sur le site arrivent dans le salon de logs staff en une vingtaine de secondes, avec un lien vers la fiche du joueur.
