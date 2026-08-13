# CLAUDE.md

## Règles de codage

### Répartition du code

* Tout code générique, sans aucune connaissance du jeu, va dans `./website/js/engine` : moteur 3D, rendu, physique, collision, entités, chargeurs, entrées.
* Tout code spécifique à Doom va dans `./website/js/doom` : règles de jeu, conversion WAD, catalogues, HUD de jeu.
* Le moteur ne dépend jamais de `doom/` ni de `WadConstants` : il expose des primitives paramétrables (`Engine3d.setDepthShading`, `Instance.setRenderOffset`, `Instance.setRenderLight`…) que la couche jeu alimente avec ses propres constantes.
* À l'intérieur de `doom/`, ce qui est propre à un jeu donné appartient à son profil (`wad/profile/`), pas aux tables de base.

### Commentaires

* Pas de commentaire inutile : le code doit être écrit assez clairement pour être compris sans commentaire (nommage explicite, méthodes courtes). Si le code se suffit à lui-même, pas de commentaire — point.
* N'en mettre que lorsque c'est réellement nécessaire, et uniquement pour le « pourquoi » non déductible du code : écart volontaire par rapport à la source d'origine, contrainte non évidente, piège évité.
* Un commentaire nécessaire va droit au but : une à deux lignes. Pas de récit du bug corrigé, pas de rappel de l'historique, pas de justification défensive.
* Jamais de commentaire qui paraphrase le code.

### Qualité de code

* Jamais de copier-coller : factoriser, refactorer, extraire une méthode ou un service commun.
* Toujours privilégier la qualité de code : une duplication repérée doit être supprimée, pas dupliquée une fois de plus.
* Mettre à jour `README.md` automatiquement, sans attendre qu'on le demande, dès qu'une modification le rend obsolète : nouvelle fonctionnalité, comportement décrit qui change, nouveau fichier dans l'arborescence.
* Respecter les standards de codage en place dans le projet (ci-dessous).

### Standards de codage

* Une classe par fichier, nom de fichier en camelCase identique à la classe (`doomMonsterSystem.js` → `DoomMonsterSystem`), préfixé par son domaine (`Wad*`, `Doom*`, `Input*`).
* Pas de modules ES : tout est chargé en portée globale par le bootstrap, donc un nouveau fichier doit être déclaré dans le `libBootstrap.json` concerné. Il y en a **deux**, un par arborescence, chacun avec sa propre `version` :
  * `website/js/engine/libBootstrap.json` (version `v2.x`) — couvre `js/engine/` ;
  * `website/js/doom/libBootstrap.json` (version `v1.x`) — couvre `js/doom/`.
  * Un fichier de `js/webapp/` est déclaré dans le bootstrap de la bibliothèque qui le **consomme** (aujourd'hui doom : `screenWakeLock.js`, `appDatabase.js`, `appTranslator.js`), et c'est donc cette version qu'on incrémente en le touchant. Les démos, qui n'empilent que le bootstrap engine, ne téléchargent ainsi que ce dont elles ont l'usage.
  * L'ordre de déclaration est l'ordre de chargement : un fichier doit être listé avant ceux qui l'utilisent à l'initialisation.
* Incrémenter la `version` de **chaque** `libBootstrap.json` dont un fichier a été touché, à chaque changement. Ce n'est pas cosmétique : le service worker sert les fichiers depuis le cache tant que la version concaténée (`v2.x|v1.x`) est inchangée, donc **sans l'incrément la modification n'est pas prise en compte, même après un rechargement**.
* Champs privés préfixés `_`, exposés par des accesseurs explicites ; les setters de configuration chaînables retournent `this`.
* Indentation de 4 espaces, toujours des accolades, early return plutôt qu'imbrication.
* Parenthèses systématiques autour des ternaires et des comparaisons composées : `((a !== null) ? a : b)`, `((x > 0) && (y === true))`.
* Comparaisons strictes (`===` / `!==`), `??` pour les valeurs par défaut, `null` pour l'absence de valeur.
* Constantes en `MAJUSCULES_SNAKE`, en statique de classe ou affectées après la classe (`DoomPlayerWeapon.MS_PER_TIC = …`) ; jamais de nombre magique en ligne — les valeurs de jeu vont dans `WadConstants` ou dans un profil.
* Code et commentaires en anglais.
* **Aucun texte affiché à l'utilisateur ne doit être écrit en dur dans le code.** Tout libellé passe obligatoirement par le système de traduction : le code ne porte qu'un **code de traduction** (`appTranslator.get('menu.back')`, avec `{placeholders}` pour les textes paramétrés), et le texte lui-même vit dans le catalogue `website/js/doom/doomTranslations.js`, renseigné dans **toutes** les langues (`fr` et `en` aujourd'hui). Cela vaut aussi pour les tables déclaratives, qui portent un code (`nameCode` des réglages) et non un libellé.
  * Le moteur (`js/engine/`) n'affiche aucun texte utilisateur et ne doit donc jamais dépendre du traducteur : un libellé vient toujours de la couche jeu.
  * Seules exceptions, à ne pas traduire : les noms propres (la marque Spipu-Doom, les noms de WAD et de niveaux, les autonymes de langues `Français` / `English`, `BFG9000`), et les tables de données transcrites des sources d'origine, qui gardent leur nom anglais — la traduction se fait alors par code, avec repli sur ce nom.
  * Ce qui dépend de la locale et non des mots (dates, tailles, pourcentages) se formate avec `Intl` à partir de `appTranslator.getLocale()`, jamais avec un séparateur ou une unité codés en dur.
* Les tables de données de jeu sont déclaratives et transcrites depuis les sources d'origine, référence citée (fichier / fonction vanilla ou zscript).

## Instructions

Avant toute chose, vérifier l'existence du répertoire `~/git/claude/memory/instructions/`.

* Si le répertoire existe, suivre les instructions du paragraphe "Procédure avec mémoire".
* Si le répertoire n'existe pas, suivre les instructions du paragraphe "Procédure sans mémoire".

Enfin, suivre les instructions du paragraphe "Procédure commune".

### Procédure avec mémoire

1. Lire le fichier `~/git/claude/memory/instructions/_main.md` pour obtenir l'arborescence de la mémoire.
2. Lire tous les fichiers d'instructions dans le répertoire `~/git/claude/memory/instructions/`
3. Lire la fiche du projet `~/git/claude/memory/projects/test/lib3d_js/_main.md`
4. Lire tous les autres fichiers markdown dans le répertoire `~/git/claude/memory/projects/test/lib3d_js/`
5. Enfin analyse les 10 derniers commits, et analyser le fichier `~/git/claude/memory/projects/test/lib3d_js/next-steps.md` pour en déduire les prochains chantiers potentiels.

### Procédure sans mémoire

1. Analyse tous les fichiers js du répertoire `./website/js/webapp`.
2. Analyse tous les fichiers js du répertoire `./website/js/engine` et de ses sous-répertoires.
3. Analyse tous les fichiers js du répertoire `./website/js/doom`   et de ses sous-répertoires.
4. Enfin analyse les 10 derniers commits.

### Procédure commune

1. Lancer un serveur web Python sur le répertoire ./website
2. Lancer firefox via playwright, et aller sur ce serveur web
3. Une fois l'application lancée, vérifier la liste des WAD disponibles
4. Ajouter ceux qui manquent parmi les 6 fichiers WAD présents dans `./.source/wad/`, en respectant cet ordre :

  * freedoom1
  * freedoom2
  * Doom1
  * Doom2
  * heretic
  * hexen
