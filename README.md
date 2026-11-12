# School FR — page publique `/economie/public`

Amélioration de la page publique de l'économie de School FR (https://schoolfr.ayro.dev/economie/public),
sans toucher à l'API ni au reste du dashboard.

> **Point de départ** : le dépôt du site n'est pas accessible depuis ici. Tout a été repris des fichiers
> réellement servis en production (`index.html`, `style.css`, `app.js`) et retesté contre l'API en direct.
> Les fichiers de `dist/` sont donc des copies patchées de vos fichiers actuels : vous les remplacez, c'est tout.

---

## Contenu du dossier

| Dossier / fichier | Rôle |
|---|---|
| `dist/` | **Les fichiers à envoyer en production** : `index.html`, `style.css`, `app.js` (mêmes noms que vos fichiers actuels) |
| `original/` | Les fichiers actuels, non modifiés (pour comparer) |
| `ameliorations.diff` | Patch unifié (508 lignes) : `git apply ameliorations.diff` ou `patch -p1 < ameliorations.diff` |
| `captures/` | Avant / après, en 1440 px et en 390 px |
| `preview_server.py` | Aperçu local de `dist/` avec relais de l'API en direct |

## Lien d'aperçu (public)

**https://fjfjk-47-253-4-207.run.pinggy-free.link/economie/public**

Au premier passage, pinggy affiche un avertissement « Enter site » : un clic, puis la page s'ouvre normalement
(le clic pose un cookie, il n'y a plus d'avertissement ensuite).

Ce lien sert `dist/` et relaie l'API vers https://schoolfr.ayro.dev : **les chiffres sont les vrais et ils bougent en direct**.
Deux limites à connaître :

1. Il passe par un tunnel qui tourne dans mon environnement de travail : le lien tombe si cet environnement s'arrête
   (pinggy annonce 60 minutes pour son offre gratuite). Dis-moi et je le relance.
2. Le déploiement durable sur le CDN a été refusé : quota de déploiements atteint sur le plan (23/20).
   Pour une URL permanente, il faut dépublier un site existant ou passer sur le plan à 50 déploiements.

## CORS : pour une page publique sur un autre domaine

`https://schoolfr.ayro.dev/api/public/economy` ne renvoie aucun en-tête `Access-Control-Allow-Origin`.
Tant que c'est le cas, aucune page servie depuis un autre domaine ne peut lire l'API (c'est pourquoi l'aperçu
passe par un relais). Si tu veux pouvoir réutiliser ces chiffres ailleurs — un site vitrine, un widget Discord,
une page de stats — ajoute cet en-tête sur la route publique de ton API :

```
Access-Control-Allow-Origin: https://ton-domaine.fr
```

## Mise en ligne

1. Remplacer les trois fichiers servis par la racine du site par ceux de `dist/` (mêmes chemins : `/index.html`, `/style.css`, `/app.js`).
2. Aucun changement serveur, aucune dépendance, aucun build : le JS reste en JavaScript vanilla, l'API est identique.
3. Pousser le cache navigateur : le site répond déjà `no-store`, un simple rechargement suffit.

Pour prévisualiser avant de pousser :

```bash
python3 preview_server.py          # http://127.0.0.1:8099/economie/public
```

Le serveur local sert `dist/` et relaie `/api/*` vers https://schoolfr.ayro.dev, donc les chiffres affichés sont les vrais.

---

## Ce qui a changé

### 1. La page dit enfin ce qu'elle est
Avant, un visiteur arrivait sur « SCHOOL FR » puis « Économie », sans un mot de contexte.

- **Hero** : sur-titre « L'économie de School FR, en direct », phrase d'explication, pastille « En direct » + nombre de visiteurs, et **« Mis à jour il y a X s »** qui défile en direct (le visiteur sait que la page suit le jeu et n'est pas figée).
- **Pied de page** : rappel de la source des chiffres, heure de dernière mise à jour, lien vers la connexion de l'équipe. Un emplacement est prévu pour ton lien Discord (voir « À faire » plus bas).
- **Note « joueurs comptés depuis le 11 novembre 2026 »** : elle passe du texte rouge en pleine page à une barre d'information discrète, lisible sans être agressive.

### 2. Les trois chiffres clés
La grille était à deux tuiles avec un grand vide à gauche (la recherche s'y logeait). Elle devient trois cartes :

- **Argent en circulation** (+ la précision « L'argent que les joueurs ont sur eux »)
- **Argent ajouté** sur la période choisie, avec la barre gagné / dépensé
- **Joueurs comptés** — nouveau, tiré de `players` dans l'API (6 261 aujourd'hui)

### 3. La liste des objets
C'était le point le plus lourd : **483 lignes** affichées d'un bloc, **19 164 px** de page sur desktop et **26 023 px** sur mobile, le tout redessiné toutes les 30 s.

- **50 lignes à la fois** + bouton « Afficher 50 de plus », avec le compte « 50 lignes affichées sur 483 ».
- **En-tête collant** : le tableau scrolle dans sa propre boîte (72 vh max), les titres de colonnes restent en haut.
- **Zebra + survol** sur les lignes, pour suivre le tableau d'un coup d'œil.
- **Recherche débouncée** (120 ms) : la table n'est plus redessinée à chaque lettre tapée.
- **Tri mobile** : sous 760 px, les titres de colonnes disparaissent (le tableau devient des cartes) → un `<select>` + un bouton de sens prennent le relais.
- Les cellules qui changent clignotent toujours en vert / rouge comme avant.

### 4. Sur téléphone, le tableau devient des cartes
C'était le point le plus visible : le tableau faisait 695 px dans un conteneur de 356 px → **les chiffres étaient coupés**, il fallait faire défiler horizontalement sans le savoir.

- Sous 760 px, chaque ligne devient une carte : nom en titre, puis « En circulation / Joueurs qui en ont / Échanges / Ajoutés » avec leur libellé. Plus rien n'est coupé.
- Le sélecteur de période ne déborde plus (il tient sur une ligne).
- La page passe de **26 023 px à 2 099 px**.

### 5. Partage et référencement
Le HTML servi n'avait aucune description : un lien posté sur Discord ou dans une recherche ne montrait rien.

- `meta description`, `theme-color`, **Open Graph** (titre, description, url, type), **Twitter Card**, `link canonical`.
- Sur la page publique, ces balises sont mises à jour par le JS : `og:title` = « Économie de School FR », `og:url` = l'URL canonique de `/economie/public`, description = « L'économie de School FR en direct… Mis à jour toutes les secondes. »
- Titre d'onglet : « Économie de School FR · les chiffres de nos serveurs en direct » (au lieu de « Économie · School FR »).

### 6. Accessibilité
- `<caption>` sur le tableau (invisible à l'écran, lu par les lecteurs d'écran), `scope="col"` sur les en-têtes, `aria-sort` sur la colonne triée, `aria-label` sur chaque bouton de tri.
- La zone « En direct » est une région `status` qui **ne parle que quand le nombre de visiteurs change** (avant, elle aurait pu être lue toutes les 3 s).
- La pastille pulsée et la barre de progression respectent `prefers-reduced-motion`.
- Le tableau a une vraie description pour les lecteurs d'écran, et le tri mobile a un libellé explicite.

### 7. Corrections de détail
- Les étiquettes de variation (« +15 € ») qui **recouvraient les montants** « Gagné / Dépensé » et la barre de progression : elles remontent maintenant dans une zone réservée sous le montant.
- « 6 personnes sur la page » → « 6 visiteurs sur la page » (et le libellé est le même côté staff).
- Le nombre de lignes trouvées est affiché à côté de la recherche.

---

## Impact mesuré (mesure réelle, navigateur)

| | Avant | Après |
|---|---|---|
| Hauteur de page, desktop 1440 px | 19 164 px | **1 484 px** |
| Hauteur de page, mobile 390 px | 26 023 px | **2 099 px** |
| Lignes dans le DOM | 483 | **50** (+ bouton) |
| Tableau sur mobile | 695 px dans 356 px → coupé | **cartes, rien de coupé** |

## Vérifications passées

- Page publique réelle (API en direct) : chargement, `title`/`description`/`og:*`/`canonical` corrects, hero et pied de page présents.
- Filtres : recherche (« chocolat » → 5 lignes), changement de période (le libellé « Argent ajouté » suit), tri par colonne (`aria-sort` + flèche), pagination 50 → 100.
- **Vue staff** simulée (mêmes appels API, `publicEconomy = false`) : la ligne « En direct » reste dans le panneau, les onglets et « Comptes ignorés » ne sont pas touchés.
- Aucune erreur JavaScript (la seule requête en erreur est le `401` de `/api/me`, qui est le fonctionnement normal d'une page publique).
- Mobile 390 px et desktop 1440 px : pas de débordement horizontal.

## À faire côté propriétaire

1. **Lien Discord dans le pied de page** : `dist/index.html`, ligne du commentaire `<!-- Ajoute ici le lien de ton Discord… -->`.
2. **Image de partage** (`og:image`) : pas de logo à plat dans les fichiers servis, je n'en ai pas inventé un. Une image 1200 × 630 avec « SCHOOL FR » ferait une vignette correcte sur Discord.
3. Le pied de page affiche « Connexion de l'équipe » qui renvoie vers `/` : à remplacer par ton lien Discord public si tu préfères.
