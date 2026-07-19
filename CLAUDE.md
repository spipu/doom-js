# CLAUDE.md

## Instructions

Charger et appliquer automatiquement à chaque session :

1. Tous les fichiers d'instructions depuis `~/git/claude/memory/instructions/`
   (lire d'abord `~/git/claude/memory/instructions/_main.md` pour obtenir la liste complète)
2. La fiche du projet : `~/git/claude/memory/projects/test/lib3d_js/_main.md`
3. Puis tous les autres fichiers MD dans le répertoire `~/git/claude/memory/projects/test/lib3d_js/`

Puis lancer le serveur python et lancer doom dans firefox via playwright.

Si la liste des WAD est vide, ajouter les 4 fichiers WAD présents dans `./.source/wad/`, dans l'ordre suivant :

* freedoom1
* freedoom2
* Doom1
* Doom2

Enfin analyse les 10 derniers commits, et analyser le fichier `~/git/claude/memory/projects/test/lib3d_js/next-steps.md`. 
