# Guide du staff

Ce guide explique comment régler et utiliser le bot Néa Hélikè depuis Discord. Toutes les commandes existent en `/` et avec le préfixe (`+` par défaut) : `/config` et `+config` font la même chose.

Chaque panneau a un bouton **❓ Aide** qui rappelle ce qu'il faut savoir sur la page affichée.

## Qui voit quoi

- Une commande `/` n'apparaît dans la liste que pour les membres qui ont sa **permission Discord par défaut** :

  | Commandes | Permission Discord |
  |---|---|
  | `/config`, `/logs`, `/tickets`, `/site`, `/prefixe`, `/couleur`, `/module`, `/acces`, `/permission`, `/profil`, `/message` | Gérer le serveur |
  | `/embed`, `/fiche` | Gérer les messages |
  | `/aide`, `/ping`, `/candidature`, `/ticket` | Tout le monde |

- Les **administrateurs Discord** peuvent toujours tout utiliser.
- Les panneaux et les réponses privées ne sont visibles que de la personne qui a lancé la commande. Avec le préfixe, le panneau s'affiche dans le salon, mais seul son auteur peut cliquer dessus.

## Premiers réglages

1. `/config`, puis **Accès** : liez vos rôles de staff aux accès.
2. `/config`, puis **Modules** : coupez ce dont vous n'avez pas besoin.
3. `/logs` : choisissez où partent les logs.
4. `/site salon-logs #salon` : salon où le staff suit les candidatures (envoi, validation, modification demandée, refus, entretien) et les changements de rang du site.
5. `/config`, puis **Profil du bot** et **Messages** : pseudo, avatar, activité, textes.

## /config : le panneau de configuration

| Section | À quoi elle sert |
|---|---|
| **Général** | Préfixe des commandes écrites, et les trois couleurs des messages du bot (avec leur rendu). |
| **Modules** | Un bouton par module : vert = actif, gris = désactivé, cadenas = toujours actif. Le menu permet de réserver tout un module à un accès. |
| **Accès** | L'échelle des droits du bot. Un accès placé plus haut a tous les droits de ceux du dessous. Chaque accès est lié à un ou plusieurs rôles. Boutons Monter, Descendre, Renommer et Supprimer. |
| **Commandes** | Pour chaque commande, qui peut l'utiliser : par défaut (sa permission Discord), un accès et ceux au-dessus, ou tout le monde. |
| **Profil du bot** | Pseudo, bio, avatar et bannière sur ce serveur ; statut et activité. Aperçu en direct. |
| **Messages** | Les textes que le bot envoie, avec leurs variables (`{user}`, `{server}`…), un aperçu et un bouton pour s'envoyer un essai. |

### Accès ou permission Discord ?

Tant qu'aucun accès n'est réglé, une commande suit sa permission Discord : c'est le plus simple, et la liste `/` est alors exactement fidèle. Réglez un accès quand vous voulez une règle plus fine, par exemple « `/embed` réservé à l'accès Staff ».

Si un accès ouvre une commande à des membres **sans** sa permission Discord, ils ne la verront pas dans la liste `/`. Ils pourront quand même l'utiliser avec le préfixe (`+embed`).

## /logs : les logs du serveur

- Choisissez un **type de log** dans le premier menu, puis son salon. Le bouton « Envoyer un essai » vérifie que tout fonctionne.
- Le second menu règle une **catégorie entière** d'un coup (Messages, Membres, Modération, Vocal, Serveur), ou **tout**.
- Plusieurs types peuvent partager un salon ; un type sans salon est désactivé.

| Catégorie | Types |
|---|---|
| Messages | Messages supprimés, modifiés, suppressions en masse (avec la copie des messages en fichier) |
| Membres | Arrivées, départs, pseudos, rôles des membres, boosts |
| Modération | Bannissements, expulsions, exclusions temporaires (avec l'auteur et la raison) |
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
| ➕ Ajouter un membre, `/ticket ajouter`, `/ticket retirer` | Équipe | Donne ou retire l'accès au salon |
| 🔒 Fermer, `/ticket fermer` | Équipe ou auteur | Demande une raison, enregistre la transcription, verrouille le salon pour l'auteur et lui envoie en MP une note de 1 à 5 |
| 🔓 Rouvrir | Équipe | Rouvre le ticket fermé |
| 🗑️ Supprimer le salon | Équipe | Supprime le salon d'un ticket fermé (la transcription reste) |

« L'équipe », c'est les rôles de la catégorie, ainsi que les membres qui ont « Gérer les salons ». Le type de log **Tickets** (dans `/logs`) suit les ouvertures, prises en charge, fermetures et réouvertures.

## /embed : le créateur d'embeds

1. Choisissez un élément dans le menu « Fais un choix » : titre, description, couleur, auteur, images, pied de page, horodatage, champs, mention d'un rôle.
2. Remplissez le formulaire : l'aperçu se met à jour aussitôt.
3. **Défaire** et **Refaire** annulent ou rétablissent une modification.
4. **Valider**, puis choisissez le salon : l'embed est publié.

Le brouillon est gardé deux heures. Relancez `/embed` pour le retrouver.

## Le lien avec le site

- Le rang du site (joueur, recruteur, staff) suit les rôles Discord en temps réel. `/site resync` force une vérification complète.
- Les rôles du parcours (« attente de wl », « Magistrat (wl) ») sont donnés par le site.
- Les joueurs suivent leur candidature avec `/candidature statut` : brouillon, envoyée, modification demandée (étapes et commentaire), entretien, refus (motifs et date de la prochaine candidature possible). La réponse n'est visible que d'eux. Les textes se modifient dans `/config` ▸ Messages.
- `/fiche @joueur` affiche son compte, sa candidature, son personnage, ses documents et la décision, avec un bouton vers sa fiche sur l'espace staff du site. La réponse n'est visible que de vous. Les notes de l'équipe restent sur le site.
- Les décisions prises sur le site arrivent dans le salon de logs staff en une vingtaine de secondes, avec un lien vers la fiche du joueur.
