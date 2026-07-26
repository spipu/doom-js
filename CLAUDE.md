# CLAUDE.md

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
