/**
 * Every user-facing text of Spipu-Doom, in one place — the catalog the generic
 * AppTranslator serves. The code carries only translation CODES, so a text has
 * exactly one owner and a missing translation is spotted by reading a column.
 *
 * Conventions:
 *  - dotted codes mirroring the domain of the calling code (menu, help, error,
 *    game, hud, settings…), sections grouped and commented like the code is;
 *  - {placeholders} for the parameterised texts, filled at the call site;
 *  - proper nouns are NOT translated: the Spipu-Doom brand, the WAD and level
 *    names, the language autonyms (Français / English), BFG9000;
 *  - only the texts that actually reach a screen live here. Of the game data,
 *    that means the weapon names alone (HudGameBar shows them); the ammo, item,
 *    monster and decoration names are read by no view, so they stay in their
 *    profile tables as transcribed from the sources.
 */
class DoomTranslations {
    static get CATALOG() {
        return {
            // --- Menu screens ---
            'menu.back': {
                fr: 'Retour',
                en: 'Back',
                it: 'Indietro'
            },
            'menu.close': {
                fr: 'Fermer',
                en: 'Close',
                it: 'Chiudi'
            },
            'menu.confirm': {
                fr: 'Confirmer',
                en: 'Confirm',
                it: 'Conferma'
            },
            'menu.cancel': {
                fr: 'Annuler',
                en: 'Cancel',
                it: 'Annulla'
            },
            'menu.storageUnavailable': {
                fr: 'Stockage navigateur indisponible — impossible de gérer les WADs.',
                en: 'Browser storage unavailable — WADs cannot be managed.',
                it: 'Archiviazione del browser non disponibile — impossibile gestire i WAD.'
            },

            'menu.wad.title': {
                fr: 'Fichiers WAD',
                en: 'WAD files',
                it: 'File WAD'
            },
            'menu.wad.empty': {
                fr: 'Aucun jeu pour l\'instant',
                en: 'No game yet',
                it: 'Nessun gioco per ora'
            },
            'menu.wad.emptyHint': {
                fr: 'Pour jouer, il faut d\'abord ajouter un jeu.',
                en: 'To play, you first need to add a game.',
                it: 'Per giocare, devi prima aggiungere un gioco.'
            },
            'menu.wad.emptyHintHelp': {
                fr: 'Vous n\'en avez pas ?',
                en: 'Don\'t have one?',
                it: 'Non ne hai uno?'
            },
            'menu.wad.emptyHintSteps': {
                fr: 'Cliquez sur « {help} » : tout y est expliqué pas à pas.',
                en: 'Click "{help}": it is all explained step by step.',
                it: 'Clicca su «{help}»: è tutto spiegato passo a passo.'
            },
            'menu.wad.urlPlaceholder': {
                fr: 'https://exemple.com/fichier.wad',
                en: 'https://example.com/file.wad',
                it: 'https://esempio.com/file.wad'
            },
            'menu.wad.addUrl': {
                fr: 'Ajouter par URL',
                en: 'Add by URL',
                it: 'Aggiungi da URL'
            },
            'menu.wad.addFile': {
                fr: 'Fichier local',
                en: 'Local file',
                it: 'File locale'
            },
            'menu.wad.urlMissing': {
                fr: 'Saisissez une URL',
                en: 'Enter a URL',
                it: 'Inserisci un URL'
            },
            'menu.wad.downloading': {
                fr: 'Téléchargement...',
                en: 'Downloading...',
                it: 'Download in corso...'
            },
            'menu.wad.reading': {
                fr: 'Lecture du fichier...',
                en: 'Reading the file...',
                it: 'Lettura del file...'
            },
            'menu.wad.added': {
                fr: '{wad} ajouté',
                en: '{wad} added',
                it: '{wad} aggiunto'
            },
            'menu.wad.delete': {
                fr: 'Supprimer',
                en: 'Delete',
                it: 'Elimina'
            },
            'menu.wad.deleteConfirm': {
                fr: 'Supprimer {wad} ?',
                en: 'Delete {wad}?',
                it: 'Eliminare {wad}?'
            },
            'menu.wad.loading': {
                fr: 'Chargement de {wad}',
                en: 'Loading {wad}',
                it: 'Caricamento di {wad}'
            },

            // WAD menu (one WAD selected)
            'menu.game.newGame': {
                fr: 'Nouvelle partie',
                en: 'New game',
                it: 'Nuova partita'
            },
            'menu.game.load': {
                fr: 'Charger une partie',
                en: 'Load game',
                it: 'Carica partita'
            },
            'menu.game.options': {
                fr: 'Options',
                en: 'Options',
                it: 'Opzioni'
            },
            'menu.game.quit': {
                fr: 'Quitter {wad}',
                en: 'Quit {wad}',
                it: 'Esci da {wad}'
            },

            // Save slots modal (load from the WAD menu or the pause menu,
            // save from the pause menu)
            'menu.save.titleLoad': {
                fr: 'Charger une partie',
                en: 'Load game',
                it: 'Carica partita'
            },
            'menu.save.titleSave': {
                fr: 'Sauvegarder la partie',
                en: 'Save game',
                it: 'Salva partita'
            },
            'menu.save.slot': {
                fr: 'Slot {n}',
                en: 'Slot {n}',
                it: 'Slot {n}'
            },
            'menu.save.empty': {
                fr: 'Vide',
                en: 'Empty',
                it: 'Vuoto'
            },
            'menu.save.delete': {
                fr: 'Supprimer',
                en: 'Delete',
                it: 'Elimina'
            },
            'menu.save.deleteConfirm': {
                fr: 'Supprimer la sauvegarde du slot {n} ?',
                en: 'Delete the save in slot {n}?',
                it: 'Eliminare il salvataggio dello slot {n}?'
            },
            'menu.save.overwriteConfirm': {
                fr: 'Remplacer la sauvegarde du slot {n} ?',
                en: 'Replace the save in slot {n}?',
                it: 'Sostituire il salvataggio dello slot {n}?'
            },
            'menu.save.deadInfo': {
                fr: 'Impossible de sauvegarder quand on est mort',
                en: 'Cannot save while dead',
                it: 'Impossibile salvare quando si è morti'
            },
            'menu.save.incompatible': {
                fr: 'Sauvegarde incompatible avec cette version du jeu',
                en: 'Save incompatible with this game version',
                it: 'Salvataggio incompatibile con questa versione del gioco'
            },
            'menu.save.loadError': {
                fr: 'Impossible de charger la sauvegarde',
                en: 'Unable to load the save',
                it: 'Impossibile caricare il salvataggio'
            },

            // Episode selection (New game). The episode NAMES are proper
            // nouns carried by the game profiles, never translated — like the
            // level names.
            'menu.episode.title': {
                fr: 'Épisode',
                en: 'Episode',
                it: 'Episodio'
            },
            'menu.episode.item': {
                fr: 'Épisode {episode}',
                en: 'Episode {episode}',
                it: 'Episodio {episode}'
            },
            'menu.episode.reading': {
                fr: 'Lecture du WAD...',
                en: 'Reading the WAD...',
                it: 'Lettura del WAD...'
            },
            'menu.episode.empty': {
                fr: 'Aucun niveau trouvé dans ce WAD',
                en: 'No level found in this WAD',
                it: 'Nessun livello trovato in questo WAD'
            },

            'menu.difficulty.title': {
                fr: 'Difficulté',
                en: 'Difficulty',
                it: 'Difficoltà'
            },
            'menu.difficulty.skill': {
                fr: 'Niveau {skill}',
                en: 'Level {skill}',
                it: 'Livello {skill}'
            },

            // Level launch modal
            'menu.level.loading': {
                fr: 'Chargement du niveau {level} de {wad}',
                en: 'Loading level {level} of {wad}',
                it: 'Caricamento del livello {level} di {wad}'
            },

            // --- Options modal (also serves the About page of the ? button) ---
            'help.display': {
                fr: 'Affichage',
                en: 'Display',
                it: 'Visualizzazione'
            },
            'help.game': {
                fr: 'Jeu',
                en: 'Game',
                it: 'Gioco'
            },
            'help.sound': {
                fr: 'Son',
                en: 'Sound',
                it: 'Audio'
            },
            'help.controls': {
                fr: 'Contrôles',
                en: 'Controls',
                it: 'Comandi'
            },
            'help.reset': {
                fr: 'Réinitialiser tous les paramétrages',
                en: 'Reset every setting',
                it: 'Reimposta tutte le impostazioni'
            },
            'help.resetConfirm': {
                fr: 'Supprimer tous les paramétrages enregistrés ?',
                en: 'Delete every saved setting?',
                it: 'Eliminare tutte le impostazioni salvate?'
            },
            'help.about': {
                fr: 'À propos',
                en: 'About',
                it: 'Informazioni'
            },
            'help.guide': {
                fr: 'Aide',
                en: 'Help',
                it: 'Aiuto'
            },
            'help.guide.wad': {
                fr: 'Pour jouer, il faut un fichier de jeu, appelé un WAD : c\'est lui qui contient les niveaux, les monstres, les images et les sons. Spipu-Doom n\'en fournit aucun — vous en apportez un, et il le fait tourner.',
                en: 'To play, you need a game file, called a WAD: it holds the levels, the monsters, the graphics and the sounds. Spipu-Doom comes with none — you bring one, and it runs it.',
                it: 'Per giocare serve un file di gioco, chiamato WAD: è lui che contiene i livelli, i mostri, le immagini e i suoni. Spipu-Doom non ne fornisce nessuno — tu ne porti uno, e lui lo fa girare.'
            },
            'help.guide.freedoom': {
                fr: 'Le plus simple est Freedoom : un jeu complet, gratuit et légal, dans le style de Doom. Téléchargez-le sur le site ci-dessous, ouvrez le fichier ZIP obtenu, et vous y trouverez « freedoom1.wad ». Revenez ici, cliquez sur « {addFile} » et choisissez ce fichier.',
                en: 'The simplest one is Freedoom: a complete game, free and legal, in the style of Doom. Download it from the site below, open the ZIP file you get, and you will find "freedoom1.wad" inside. Come back here, click "{addFile}" and pick that file.',
                it: 'Il più semplice è Freedoom: un gioco completo, gratuito e legale, nello stile di Doom. Scaricalo dal sito qui sotto, apri il file ZIP ottenuto e all\'interno troverai «freedoom1.wad». Torna qui, clicca su «{addFile}» e scegli quel file.'
            },
            'help.guide.own': {
                fr: 'Si vous possédez déjà Doom, Doom II, Heretic ou Hexen, leur fichier WAD fonctionne exactement pareil. « {addUrl} » sert à aller chercher un fichier directement sur une adresse internet, quand le site qui l\'héberge le permet.',
                en: 'If you already own Doom, Doom II, Heretic or Hexen, their WAD file works exactly the same. "{addUrl}" fetches a file straight from a web address, when the site hosting it allows it.',
                it: 'Se possiedi già Doom, Doom II, Heretic o Hexen, il loro file WAD funziona esattamente allo stesso modo. «{addUrl}» serve a prelevare un file direttamente da un indirizzo internet, quando il sito che lo ospita lo consente.'
            },
            'help.guide.install': {
                fr: 'Sur téléphone ou tablette, installez Spipu-Doom pour jouer en plein écran, sans la barre du navigateur : sur iPhone et iPad, avec Safari, touchez le bouton Partager puis « Sur l\'écran d\'accueil » ; sur Android, avec Chrome, ouvrez le menu ⋮ (les trois points) puis « Installer l\'application ». Une icône apparaît, et le jeu fonctionne ensuite même sans connexion internet.',
                en: 'On a phone or a tablet, install Spipu-Doom to play fullscreen, without the browser bar: on iPhone and iPad, in Safari, tap the Share button then "Add to Home Screen"; on Android, in Chrome, open the ⋮ (three dots) menu then "Install app". An icon appears, and the game then works even with no internet connection.',
                it: 'Su telefono o tablet, installa Spipu-Doom per giocare a schermo intero, senza la barra del browser: su iPhone e iPad, con Safari, tocca il pulsante Condividi e poi «Aggiungi a Home»; su Android, con Chrome, apri il menu ⋮ (i tre puntini) e poi «Installa app». Compare un\'icona, e il gioco funziona poi anche senza connessione internet.'
            },
            'help.guide.controls': {
                fr: 'Jouez au clavier et à la souris, à la manette, ou avec les commandes tactiles qui s\'affichent à l\'écran : Spipu-Doom reconnaît tout seul ce que vous utilisez. Chaque touche peut être changée dans les options, une fois un jeu choisi.',
                en: 'Play with the keyboard and mouse, with a gamepad, or with the touch controls shown on screen: Spipu-Doom works out on its own what you are using. Every key can be changed in the options, once you have picked a game.',
                it: 'Gioca con tastiera e mouse, con un controller, o con i comandi touch che compaiono sullo schermo: Spipu-Doom riconosce da solo quello che stai usando. Ogni tasto può essere cambiato nelle opzioni, dopo aver scelto un gioco.'
            },
            'help.keyCapture': {
                fr: 'Appuyez sur la touche à utiliser pour « {action} »…',
                en: 'Press the key to use for "{action}"…',
                it: 'Premi il tasto da usare per «{action}»…'
            },
            'help.about.what': {
                fr: 'Spipu-Doom convertit et fait tourner vos fichiers WAD Doom à la volée, entièrement dans le navigateur : rendu WebGL, physique FPS, éléments mouvants et armes fidèles au jeu original.',
                en: 'Spipu-Doom converts and runs your Doom WAD files on the fly, entirely in the browser: WebGL rendering, FPS physics, moving elements and weapons faithful to the original game.',
                it: 'Spipu-Doom converte e fa girare i tuoi file WAD di Doom al volo, interamente nel browser: rendering WebGL, fisica FPS, elementi mobili e armi fedeli al gioco originale.'
            },
            'help.about.author': {
                fr: 'Développé par Spipu (Laurent Minguet).',
                en: 'Developed by Spipu (Laurent Minguet).',
                it: 'Sviluppato da Spipu (Laurent Minguet).'
            },
            'help.about.source': {
                fr: 'Code source du projet :',
                en: 'Project source code:',
                it: 'Codice sorgente del progetto:'
            },
            'help.about.licence': {
                fr: 'Licence MIT — à l\'exception des graphismes de decals d\'impact et des textes de fin de chapitre, repris d\'UZDoom sous licence GPL v3, et du synthétiseur musical libADLMIDI, embarqué sous licence LGPL v3.',
                en: 'MIT licence — except the impact decal graphics and the end-of-chapter texts, taken from UZDoom under the GPL v3 licence, and the libADLMIDI music synthesizer, embedded under the LGPL v3 licence.',
                it: 'Licenza MIT — a eccezione della grafica dei segni d\'impatto e dei testi di fine capitolo, ripresi da UZDoom con licenza GPL v3, e del sintetizzatore musicale libADLMIDI, incorporato con licenza LGPL v3.'
            },
            'help.about.wads': {
                fr: 'Aucun fichier WAD n\'est fourni. Utilisez un WAD libre comme Freedoom, ou vos propres fichiers dont vous détenez les droits — Doom et ses données de jeu restent la propriété de leurs ayants droit.',
                en: 'No WAD file is shipped. Use a free WAD such as Freedoom, or your own files that you hold the rights to — Doom and its game data remain the property of their rights holders.',
                it: 'Nessun file WAD è incluso. Usa un WAD libero come Freedoom, o i tuoi file di cui detieni i diritti — Doom e i suoi dati di gioco restano proprietà dei rispettivi titolari.'
            },
            'help.about.copyright': {
                fr: '© 2024-{year} Spipu.',
                en: '© 2024-{year} Spipu.',
                it: '© 2024-{year} Spipu.'
            },

            // Setting values and input devices
            'value.yes': {
                fr: 'Oui',
                en: 'Yes',
                it: 'Sì'
            },
            'value.no': {
                fr: 'Non',
                en: 'No',
                it: 'No'
            },
            'key.space': {
                fr: 'Espace',
                en: 'Space',
                it: 'Spazio'
            },
            'key.numpad': {
                fr: 'Num {key}',
                en: 'Numpad {key}',
                it: 'Num {key}'
            },
            'device.gamepad': {
                fr: 'Manette {name}',
                en: 'Gamepad {name}',
                it: 'Controller {name}'
            },
            'device.virtualPad': {
                fr: 'Manette virtuelle',
                en: 'Virtual gamepad',
                it: 'Controller virtuale'
            },
            'device.keyboardMouse': {
                fr: 'Clavier et souris',
                en: 'Keyboard and mouse',
                it: 'Tastiera e mouse'
            },

            // --- Errors (WadError codes) ---
            'error.generic': {
                fr: 'Erreur : {message}',
                en: 'Error: {message}',
                it: 'Errore: {message}'
            },
            'error.fetchOffline': {
                fr: 'Aucune connexion réseau',
                en: 'No network connection',
                it: 'Nessuna connessione di rete'
            },
            'error.fetchBlocked': {
                fr: 'Ce serveur n\'autorise pas le téléchargement direct — enregistrez le fichier, puis utilisez « Fichier local »',
                en: 'This server does not allow direct downloads — save the file, then use "Local file"',
                it: 'Questo server non consente il download diretto — salva il file, poi usa «File locale»'
            },
            'error.fetchHttp': {
                fr: 'Le serveur a refusé le fichier',
                en: 'The server refused the file',
                it: 'Il server ha rifiutato il file'
            },
            'error.fetchFailed': {
                fr: 'Téléchargement impossible',
                en: 'Download failed',
                it: 'Download impossibile'
            },
            'error.invalidFormat': {
                fr: 'Ce fichier n\'est pas un WAD valide (IWAD/PWAD attendu)',
                en: 'This file is not a valid WAD (IWAD/PWAD expected)',
                it: 'Questo file non è un WAD valido (atteso IWAD/PWAD)'
            },
            'error.quotaExceeded': {
                fr: 'Espace de stockage insuffisant — supprimez un WAD',
                en: 'Not enough storage space — delete a WAD',
                it: 'Spazio di archiviazione insufficiente — elimina un WAD'
            },
            'error.storageUnavailable': {
                fr: 'Stockage navigateur indisponible',
                en: 'Browser storage unavailable',
                it: 'Archiviazione del browser non disponibile'
            },
            'error.notFound': {
                fr: 'WAD introuvable',
                en: 'WAD not found',
                it: 'WAD non trovato'
            },

            // --- Game (pause menu + level chaining modals) ---
            'game.pause.resume': {
                fr: 'Reprendre',
                en: 'Resume',
                it: 'Riprendi'
            },
            'game.pause.save': {
                fr: 'Sauvegarder la partie',
                en: 'Save game',
                it: 'Salva partita'
            },
            'game.pause.quit': {
                fr: 'Quitter le niveau',
                en: 'Leave the level',
                it: 'Esci dal livello'
            },
            'game.level.loading': {
                fr: 'Chargement du niveau {level}',
                en: 'Loading level {level}',
                it: 'Caricamento del livello {level}'
            },
            'game.level.finished': {
                fr: 'Niveau {level} terminé !',
                en: 'Level {level} finished!',
                it: 'Livello {level} completato!'
            },
            'game.episode.finished': {
                fr: 'Épisode terminé !',
                en: 'Episode finished!',
                it: 'Episodio completato!'
            },
            'game.finished': {
                fr: 'Partie terminée !',
                en: 'Game over!',
                it: 'Partita completata!'
            },
            'game.tally.time': {
                fr: 'Temps',
                en: 'Time',
                it: 'Tempo'
            },
            'game.tally.kills': {
                fr: 'Ennemis',
                en: 'Kills',
                it: 'Nemici'
            },
            'game.tally.items': {
                fr: 'Objets',
                en: 'Items',
                it: 'Oggetti'
            },
            'game.tally.secrets': {
                fr: 'Secrets',
                en: 'Secrets',
                it: 'Segreti'
            },
            'game.tally.none': {
                fr: 'aucun',
                en: 'none',
                it: 'nessuno'
            },
            'game.tally.next': {
                fr: 'Niveau suivant',
                en: 'Next level',
                it: 'Livello successivo'
            },
            'game.tally.menu': {
                fr: 'Retour au menu',
                en: 'Back to menu',
                it: 'Torna al menu'
            },
            // Leaves the tally for the story text, which carries the real next action
            'game.finale.continue': {
                fr: 'Continuer',
                en: 'Continue',
                it: 'Continua'
            },

            'hud.health': {
                fr: 'PV',
                en: 'HP',
                it: 'PV'
            },
            'hud.armor': {
                fr: 'AR',
                en: 'AR',
                it: 'AR'
            },
            'hud.ammo': {
                fr: 'MUNITIONS',
                en: 'AMMO',
                it: 'MUNIZIONI'
            },
            'hud.automap': {
                fr: 'Carte',
                en: 'Map',
                it: 'Mappa'
            },

            // Running power-up effects (one shared label per effect, whatever
            // the game's item name — user decision)
            'effect.berserk': {
                fr: 'Berserk',
                en: 'Berserk',
                it: 'Berserk'
            },
            'effect.invulnerability': {
                fr: 'Invulnérabilité',
                en: 'Invulnerability',
                it: 'Invulnerabilità'
            },
            'effect.radiationSuit': {
                fr: 'Anti-radiations',
                en: 'Radiation suit',
                it: 'Anti-radiazioni'
            },
            'effect.light': {
                fr: 'Vision de nuit',
                en: 'Night vision',
                it: 'Visione notturna'
            },
            'effect.invisibility': {
                fr: 'Invisibilité',
                en: 'Invisibility',
                it: 'Invisibilità'
            },

            // --- Units (byte sizes) ---
            'unit.megabyte': {
                fr: 'Mo',
                en: 'MB',
                it: 'MB'
            },
            'unit.kilobyte': {
                fr: 'Ko',
                en: 'KB',
                it: 'KB'
            },
            'unit.byte': {
                fr: 'o',
                en: 'B',
                it: 'B'
            },

            // --- Difficulties ---
            // Generic scale: the vanilla titles of skills 1-5 were
            // "I'm too young to die", "Hey, not too rough", "Hurt me plenty",
            // "Ultra-Violence" and "Nightmare!"; skill 0 is our own monster-free
            // exploration mode.
            'difficulty.0': {
                fr: 'Monstres pacifiques',
                en: 'Pacifist monsters',
                it: 'Mostri pacifici'
            },
            'difficulty.1': {
                fr: 'Très facile',
                en: 'Very easy',
                it: 'Molto facile'
            },
            'difficulty.2': {
                fr: 'Facile',
                en: 'Easy',
                it: 'Facile'
            },
            'difficulty.3': {
                fr: 'Moyen',
                en: 'Normal',
                it: 'Normale'
            },
            'difficulty.4': {
                fr: 'Difficile',
                en: 'Hard',
                it: 'Difficile'
            },
            'difficulty.5': {
                fr: 'Très difficile',
                en: 'Very hard',
                it: 'Molto difficile'
            },

            // --- Weapon names (the only game data a view displays) ---
            // Keyed by the weapon code of the game profiles; the English side
            // repeats the name transcribed in the profile table, which stays the
            // HUD fallback for a weapon with no entry here.
            'weapon.fist': {
                fr: 'Poing',
                en: 'Fist',
                it: 'Pugno'
            },
            'weapon.chainsaw': {
                fr: 'Tronçonneuse',
                en: 'Chainsaw',
                it: 'Motosega'
            },
            'weapon.pistol': {
                fr: 'Pistolet',
                en: 'Pistol',
                it: 'Pistola'
            },
            'weapon.shotgun': {
                fr: 'Fusil à pompe',
                en: 'Shotgun',
                it: 'Fucile a pompa'
            },
            'weapon.supershotgun': {
                fr: 'Fusil à pompe double',
                en: 'Super Shotgun',
                it: 'Doppietta'
            },
            'weapon.chaingun': {
                fr: 'Mitrailleuse',
                en: 'Chaingun',
                it: 'Mitragliatrice'
            },
            'weapon.rocket': {
                fr: 'Lance-roquettes',
                en: 'Rocket Launcher',
                it: 'Lanciarazzi'
            },
            'weapon.plasma': {
                fr: 'Fusil à plasma',
                en: 'Plasma Rifle',
                it: 'Fucile al plasma'
            },
            'weapon.bfg': {
                fr: 'BFG9000',
                en: 'BFG9000',
                it: 'BFG9000'
            },
            'weapon.staff': {
                fr: 'Bâton',
                en: 'Staff',
                it: 'Bastone'
            },
            'weapon.gauntlets': {
                fr: 'Gantelets',
                en: 'Gauntlets',
                it: 'Manopole'
            },
            'weapon.goldwand': {
                fr: 'Baguette d\'or',
                en: 'Gold Wand',
                it: 'Bacchetta d\'oro'
            },
            'weapon.crossbow': {
                fr: 'Arbalète éthérée',
                en: 'Ethereal Crossbow',
                it: 'Balestra eterea'
            },
            'weapon.blaster': {
                fr: 'Griffe de dragon',
                en: 'Dragon Claw',
                it: 'Artiglio di drago'
            },
            'weapon.skullrod': {
                fr: 'Bâton de l\'enfer',
                en: 'Hellstaff',
                it: 'Bastone infernale'
            },
            'weapon.phoenixrod': {
                fr: 'Sceptre du phénix',
                en: 'Phoenix Rod',
                it: 'Scettro della fenice'
            },
            'weapon.mace': {
                fr: 'Masse de feu',
                en: 'Firemace',
                it: 'Mazza di fuoco'
            },

            // --- Settings (DoomSettings.DEFINITIONS nameCode) ---
            'settings.display.language': {
                fr: 'Langue',
                en: 'Language',
                it: 'Lingua'
            },
            'settings.display.crosshair': {
                fr: 'Afficher le réticule',
                en: 'Show the crosshair',
                it: 'Mostra il mirino'
            },
            'settings.display.distanceShading': {
                fr: 'Assombrissement à la distance',
                en: 'Distance darkening',
                it: 'Oscuramento con la distanza'
            },
            'settings.display.textureSmoothing': {
                fr: 'Lissage des textures',
                en: 'Texture smoothing',
                it: 'Filtraggio delle texture'
            },
            'settings.game.fallDamage': {
                fr: 'Dégâts de chute',
                en: 'Fall damage',
                it: 'Danni da caduta'
            },
            'settings.game.jump': {
                fr: 'Autoriser le saut',
                en: 'Allow jumping',
                it: 'Consenti il salto'
            },
            'settings.game.crouch': {
                fr: 'Autoriser l\'accroupissement',
                en: 'Allow crouching',
                it: 'Consenti l\'accovacciamento'
            },
            'settings.sound.volumeMusic': {
                fr: 'Volume de la musique',
                en: 'Music volume',
                it: 'Volume della musica'
            },
            'settings.sound.volumeEffects': {
                fr: 'Volume des effets',
                en: 'Effects volume',
                it: 'Volume degli effetti'
            },
            'settings.pad.yInverse': {
                fr: 'Inverser l\'axe vertical',
                en: 'Invert the vertical axis',
                it: 'Inverti l\'asse verticale'
            },
            'settings.virtualPad.yInverse': {
                fr: 'Inverser l\'axe vertical',
                en: 'Invert the vertical axis',
                it: 'Inverti l\'asse verticale'
            },
            'settings.mouse.yInverse': {
                fr: 'Inverser l\'axe vertical de la souris',
                en: 'Invert the mouse vertical axis',
                it: 'Inverti l\'asse verticale del mouse'
            },
            'settings.virtualPad.moveDeadZone': {
                fr: 'Stick de déplacement — zone morte',
                en: 'Move stick — dead zone',
                it: 'Stick di movimento — zona morta'
            },
            'settings.virtualPad.aimDeadZone': {
                fr: 'Stick de visée — zone morte',
                en: 'Aim stick — dead zone',
                it: 'Stick di mira — zona morta'
            },
            'settings.virtualPad.fireDeadZone': {
                fr: 'Stick de visée en tirant — zone morte',
                en: 'Aim stick while firing — dead zone',
                it: 'Stick di mira durante il fuoco — zona morta'
            },
            'settings.virtualPad.fireSensitivity': {
                fr: 'Stick de visée en tirant — sensibilité',
                en: 'Aim stick while firing — sensitivity',
                it: 'Stick di mira durante il fuoco — sensibilità'
            },
            'settings.keyboard.forward': {
                fr: 'Avancer',
                en: 'Move forward',
                it: 'Avanza'
            },
            'settings.keyboard.backward': {
                fr: 'Reculer',
                en: 'Move backward',
                it: 'Retrocedi'
            },
            'settings.keyboard.strafeLeft': {
                fr: 'Pas à gauche',
                en: 'Strafe left',
                it: 'Passo a sinistra'
            },
            'settings.keyboard.strafeRight': {
                fr: 'Pas à droite',
                en: 'Strafe right',
                it: 'Passo a destra'
            },
            'settings.keyboard.jump': {
                fr: 'Sauter',
                en: 'Jump',
                it: 'Salta'
            },
            'settings.keyboard.crouch': {
                fr: 'S\'accroupir',
                en: 'Crouch',
                it: 'Accovacciati'
            },
            'settings.keyboard.action': {
                fr: 'Action / utiliser',
                en: 'Action / use',
                it: 'Azione / usa'
            },
            'settings.keyboard.fire': {
                fr: 'Tirer',
                en: 'Fire',
                it: 'Spara'
            },
            'settings.keyboard.weaponPrev': {
                fr: 'Arme précédente',
                en: 'Previous weapon',
                it: 'Arma precedente'
            },
            'settings.keyboard.weaponNext': {
                fr: 'Arme suivante',
                en: 'Next weapon',
                it: 'Arma successiva'
            },
            'settings.keyboard.walkSlow': {
                fr: 'Marcher lentement',
                en: 'Walk slowly',
                it: 'Cammina lentamente'
            },
            'settings.keyboard.toggleHud': {
                fr: 'Afficher le HUD de debug',
                en: 'Show the debug HUD',
                it: 'Mostra l\'HUD di debug'
            },
            'settings.keyboard.map': {
                fr: 'Afficher la carte',
                en: 'Show the map',
                it: 'Mostra la mappa'
            },
            'settings.keyboard.lookDown': {
                fr: 'Fausse souris - Y+',
                en: 'Fake mouse - Y+',
                it: 'Mouse finto - Y+'
            },
            'settings.keyboard.lookUp': {
                fr: 'Fausse souris - Y-',
                en: 'Fake mouse - Y-',
                it: 'Mouse finto - Y-'
            },
            'settings.keyboard.lookRight': {
                fr: 'Fausse souris - X+',
                en: 'Fake mouse - X+',
                it: 'Mouse finto - X+'
            },
            'settings.keyboard.lookLeft': {
                fr: 'Fausse souris - X-',
                en: 'Fake mouse - X-',
                it: 'Mouse finto - X-'
            }
        };
    }
}
