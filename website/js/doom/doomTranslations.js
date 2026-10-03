/**
 * Every user-facing text of Spipu-Doom, served by AppTranslator.
 *
 * Proper nouns are not translated (the brand, WAD and level names, language
 * autonyms, BFG9000). Of the game data, only the weapon names reach a screen;
 * the other names stay in their profile tables as transcribed.
 */
class DoomTranslations {
    static get CATALOG() {
        return {
            // --- Menu screens ---
            'menu.back': {
                fr: 'Retour',
                en: 'Back',
                it: 'Indietro',
                es: 'Volver'
            },
            'menu.close': {
                fr: 'Fermer',
                en: 'Close',
                it: 'Chiudi',
                es: 'Cerrar'
            },
            'menu.confirm': {
                fr: 'Confirmer',
                en: 'Confirm',
                it: 'Conferma',
                es: 'Confirmar'
            },
            'menu.cancel': {
                fr: 'Annuler',
                en: 'Cancel',
                it: 'Annulla',
                es: 'Cancelar'
            },
            // Accessible name of the erase key of the on-screen keyboard.
            'menu.keyboard.erase': {
                fr: 'Effacer',
                en: 'Erase',
                it: 'Cancella',
                es: 'Borrar'
            },
            'menu.storageUnavailable': {
                fr: 'Stockage navigateur indisponible — impossible de gérer les WADs.',
                en: 'Browser storage unavailable — WADs cannot be managed.',
                it: 'Archiviazione del browser non disponibile — impossibile gestire i WAD.',
                es: 'Almacenamiento del navegador no disponible — imposible gestionar los WAD.'
            },

            'menu.wad.title': {
                fr: 'Fichiers WAD',
                en: 'WAD files',
                it: 'File WAD',
                es: 'Archivos WAD'
            },
            'menu.wad.empty': {
                fr: 'Aucun jeu pour l\'instant',
                en: 'No game yet',
                it: 'Nessun gioco per ora',
                es: 'Ningún juego por ahora'
            },
            'menu.wad.emptyHint': {
                fr: 'Pour jouer, il faut d\'abord ajouter un jeu.',
                en: 'To play, you first need to add a game.',
                it: 'Per giocare, devi prima aggiungere un gioco.',
                es: 'Para jugar, primero hay que añadir un juego.'
            },
            'menu.wad.emptyHintHelp': {
                fr: 'Vous n\'en avez pas ?',
                en: 'Don\'t have one?',
                it: 'Non ne hai uno?',
                es: '¿No tienes ninguno?'
            },
            'menu.wad.emptyHintSteps': {
                fr: 'Cliquez sur « {help} » : tout y est expliqué pas à pas.',
                en: 'Click "{help}": it is all explained step by step.',
                it: 'Clicca su «{help}»: è tutto spiegato passo a passo.',
                es: 'Haz clic en «{help}»: allí está todo explicado paso a paso.'
            },
            'menu.wad.urlPlaceholder': {
                fr: 'https://exemple.com/fichier.wad',
                en: 'https://example.com/file.wad',
                it: 'https://esempio.com/file.wad',
                es: 'https://ejemplo.com/archivo.wad'
            },
            'menu.wad.addUrl': {
                fr: 'Ajouter par URL',
                en: 'Add by URL',
                it: 'Aggiungi da URL',
                es: 'Añadir por URL'
            },
            'menu.wad.addFile': {
                fr: 'Fichier local',
                en: 'Local file',
                it: 'File locale',
                es: 'Archivo local'
            },
            'menu.wad.urlMissing': {
                fr: 'Saisissez une URL',
                en: 'Enter a URL',
                it: 'Inserisci un URL',
                es: 'Introduce una URL'
            },
            'menu.wad.downloading': {
                fr: 'Téléchargement...',
                en: 'Downloading...',
                it: 'Download in corso...',
                es: 'Descargando...'
            },
            'menu.wad.reading': {
                fr: 'Lecture du fichier...',
                en: 'Reading the file...',
                it: 'Lettura del file...',
                es: 'Leyendo el archivo...'
            },
            'menu.wad.added': {
                fr: '{wad} ajouté',
                en: '{wad} added',
                it: '{wad} aggiunto',
                es: '{wad} añadido'
            },
            'menu.wad.updated': {
                fr: '{wad} mis à jour',
                en: '{wad} updated',
                it: '{wad} aggiornato',
                es: '{wad} actualizado'
            },
            'menu.wad.updateConfirm': {
                fr: 'Mettre à jour {wad} de {from} vers {to} ?',
                en: 'Update {wad} from {from} to {to}?',
                it: 'Aggiornare {wad} da {from} a {to}?',
                es: '¿Actualizar {wad} de {from} a {to}?'
            },
            'menu.wad.updateRestarted': {
                fr: 'Niveau modifié par la mise à jour, ces sauvegardes repartiront de son début : {slots}',
                en: 'Level changed by the update, these saves will restart from its beginning: {slots}',
                it: 'Livello modificato dall\'aggiornamento, questi salvataggi ripartiranno dal suo inizio: {slots}',
                es: 'Nivel modificado por la actualización, estas partidas volverán a su inicio: {slots}'
            },
            'menu.wad.updateRemoved': {
                fr: 'Niveau absent de la nouvelle version, ces sauvegardes seront supprimées : {slots}',
                en: 'Level missing from the new version, these saves will be deleted: {slots}',
                it: 'Livello assente dalla nuova versione, questi salvataggi saranno eliminati: {slots}',
                es: 'Nivel ausente de la nueva versión, estas partidas se eliminarán: {slots}'
            },
            'menu.wad.delete': {
                fr: 'Supprimer',
                en: 'Delete',
                it: 'Elimina',
                es: 'Eliminar'
            },
            'menu.wad.deleteConfirm': {
                fr: 'Supprimer {wad} ?',
                en: 'Delete {wad}?',
                it: 'Eliminare {wad}?',
                es: '¿Eliminar {wad}?'
            },
            'menu.wad.loading': {
                fr: 'Chargement de {wad}',
                en: 'Loading {wad}',
                it: 'Caricamento di {wad}',
                es: 'Cargando {wad}'
            },

            // WAD menu (one WAD selected)
            'menu.game.newGame': {
                fr: 'Nouvelle partie',
                en: 'New game',
                it: 'Nuova partita',
                es: 'Nueva partida'
            },
            'menu.game.load': {
                fr: 'Charger une partie',
                en: 'Load game',
                it: 'Carica partita',
                es: 'Cargar partida'
            },
            'menu.game.options': {
                fr: 'Options',
                en: 'Options',
                it: 'Opzioni',
                es: 'Opciones'
            },
            'menu.game.quit': {
                fr: 'Quitter {wad}',
                en: 'Quit {wad}',
                it: 'Esci da {wad}',
                es: 'Salir de {wad}'
            },
            'menu.game.reportBug': {
                fr: 'Déclarer un bug',
                en: 'Report a bug',
                it: 'Segnala un bug',
                es: 'Informar de un error'
            },

            // Save slots modal (load from the WAD menu or the pause menu,
            // save from the pause menu)
            'menu.save.titleLoad': {
                fr: 'Charger une partie',
                en: 'Load game',
                it: 'Carica partita',
                es: 'Cargar partida'
            },
            'menu.save.titleSave': {
                fr: 'Sauvegarder la partie',
                en: 'Save game',
                it: 'Salva partita',
                es: 'Guardar la partida'
            },
            'menu.save.slot': {
                fr: 'Slot {n}',
                en: 'Slot {n}',
                it: 'Slot {n}',
                es: 'Ranura {n}'
            },
            'menu.save.empty': {
                fr: 'Vide',
                en: 'Empty',
                it: 'Vuoto',
                es: 'Vacía'
            },
            'menu.save.delete': {
                fr: 'Supprimer',
                en: 'Delete',
                it: 'Elimina',
                es: 'Eliminar'
            },
            'menu.save.deleteConfirm': {
                fr: 'Supprimer la sauvegarde du slot {n} ?',
                en: 'Delete the save in slot {n}?',
                it: 'Eliminare il salvataggio dello slot {n}?',
                es: '¿Eliminar la partida guardada de la ranura {n}?'
            },
            'menu.save.saving': {
                fr: 'Sauvegarde en cours',
                en: 'Saving',
                it: 'Salvataggio in corso',
                es: 'Guardando'
            },
            'menu.save.overwriteConfirm': {
                fr: 'Remplacer la sauvegarde du slot {n} ?',
                en: 'Replace the save in slot {n}?',
                it: 'Sostituire il salvataggio dello slot {n}?',
                es: '¿Reemplazar la partida guardada de la ranura {n}?'
            },
            'menu.save.deadInfo': {
                fr: 'Impossible de sauvegarder quand on est mort',
                en: 'Cannot save while dead',
                it: 'Impossibile salvare quando si è morti',
                es: 'No se puede guardar estando muerto'
            },
            'menu.save.incompatible': {
                fr: 'Sauvegarde incompatible avec cette version du jeu',
                en: 'Save incompatible with this game version',
                it: 'Salvataggio incompatibile con questa versione del gioco',
                es: 'Partida guardada incompatible con esta versión del juego'
            },
            'menu.save.loadError': {
                fr: 'Impossible de charger la sauvegarde',
                en: 'Unable to load the save',
                it: 'Impossibile caricare il salvataggio',
                es: 'No se puede cargar la partida guardada'
            },

            // Episode selection (New game). The episode NAMES are proper
            // nouns carried by the game profiles, never translated — like the
            // level names.
            'menu.episode.title': {
                fr: 'Épisode',
                en: 'Episode',
                it: 'Episodio',
                es: 'Episodio'
            },
            'menu.episode.item': {
                fr: 'Épisode {episode}',
                en: 'Episode {episode}',
                it: 'Episodio {episode}',
                es: 'Episodio {episode}'
            },
            'menu.episode.reading': {
                fr: 'Lecture du WAD...',
                en: 'Reading the WAD...',
                it: 'Lettura del WAD...',
                es: 'Leyendo el WAD...'
            },
            'menu.episode.empty': {
                fr: 'Aucun niveau trouvé dans ce WAD',
                en: 'No level found in this WAD',
                it: 'Nessun livello trovato in questo WAD',
                es: 'No se ha encontrado ningún nivel en este WAD'
            },

            'menu.difficulty.title': {
                fr: 'Difficulté',
                en: 'Difficulty',
                it: 'Difficoltà',
                es: 'Dificultad'
            },
            'menu.difficulty.skill': {
                fr: 'Niveau {skill}',
                en: 'Level {skill}',
                it: 'Livello {skill}',
                es: 'Nivel {skill}'
            },

            // Level launch modal
            'menu.level.loading': {
                fr: 'Chargement du niveau {level} de {wad}',
                en: 'Loading level {level} of {wad}',
                it: 'Caricamento del livello {level} di {wad}',
                es: 'Cargando el nivel {level} de {wad}'
            },

            // --- Options modal (also serves the About page of the ? button) ---
            'help.display': {
                fr: 'Affichage',
                en: 'Display',
                it: 'Visualizzazione',
                es: 'Pantalla'
            },
            'help.game': {
                fr: 'Jeu',
                en: 'Game',
                it: 'Gioco',
                es: 'Juego'
            },
            'help.multiplayer': {
                fr: 'Multijoueur',
                en: 'Multiplayer',
                it: 'Multigiocatore',
                es: 'Multijugador'
            },
            'help.sound': {
                fr: 'Son',
                en: 'Sound',
                it: 'Audio',
                es: 'Sonido'
            },
            'help.controls': {
                fr: 'Contrôles',
                en: 'Controls',
                it: 'Comandi',
                es: 'Controles'
            },
            'help.reset': {
                fr: 'Réinitialiser tous les paramétrages',
                en: 'Reset every setting',
                it: 'Reimposta tutte le impostazioni',
                es: 'Restablecer todos los ajustes'
            },
            'help.resetConfirm': {
                fr: 'Supprimer tous les paramétrages enregistrés ?',
                en: 'Delete every saved setting?',
                it: 'Eliminare tutte le impostazioni salvate?',
                es: '¿Eliminar todos los ajustes guardados?'
            },
            'help.about': {
                fr: 'À propos',
                en: 'About',
                it: 'Informazioni',
                es: 'Acerca de'
            },
            'help.guide': {
                fr: 'Aide',
                en: 'Help',
                it: 'Aiuto',
                es: 'Ayuda'
            },
            'help.guide.wad': {
                fr: 'Pour jouer, il faut un fichier de jeu, appelé un WAD : c\'est lui qui contient les niveaux, les monstres, les images et les sons. Spipu-Doom n\'en fournit aucun — vous en apportez un, et il le fait tourner.',
                en: 'To play, you need a game file, called a WAD: it holds the levels, the monsters, the graphics and the sounds. Spipu-Doom comes with none — you bring one, and it runs it.',
                it: 'Per giocare serve un file di gioco, chiamato WAD: è lui che contiene i livelli, i mostri, le immagini e i suoni. Spipu-Doom non ne fornisce nessuno — tu ne porti uno, e lui lo fa girare.',
                es: 'Para jugar hace falta un archivo de juego, llamado WAD: es el que contiene los niveles, los monstruos, las imágenes y los sonidos. Spipu-Doom no incluye ninguno — tú traes uno, y él lo hace funcionar.'
            },
            'help.guide.freedoom': {
                fr: 'Le plus simple est Freedoom : un jeu complet, gratuit et légal, dans le style de Doom. Téléchargez-le sur le site ci-dessous, ouvrez le fichier ZIP obtenu, et vous y trouverez « freedoom1.wad ». Revenez ici, cliquez sur « {addFile} » et choisissez ce fichier.',
                en: 'The simplest one is Freedoom: a complete game, free and legal, in the style of Doom. Download it from the site below, open the ZIP file you get, and you will find "freedoom1.wad" inside. Come back here, click "{addFile}" and pick that file.',
                it: 'Il più semplice è Freedoom: un gioco completo, gratuito e legale, nello stile di Doom. Scaricalo dal sito qui sotto, apri il file ZIP ottenuto e all\'interno troverai «freedoom1.wad». Torna qui, clicca su «{addFile}» e scegli quel file.',
                es: 'Lo más sencillo es Freedoom: un juego completo, gratuito y legal, al estilo de Doom. Descárgalo desde el sitio de abajo, abre el archivo ZIP obtenido y dentro encontrarás «freedoom1.wad». Vuelve aquí, haz clic en «{addFile}» y elige ese archivo.'
            },
            'help.guide.own': {
                fr: 'Si vous possédez déjà Doom, Doom II ou Heretic, leur fichier WAD fonctionne exactement pareil. « {addUrl} » sert à aller chercher un fichier directement sur une adresse internet, quand le site qui l\'héberge le permet.',
                en: 'If you already own Doom, Doom II or Heretic, their WAD file works exactly the same. "{addUrl}" fetches a file straight from a web address, when the site hosting it allows it.',
                it: 'Se possiedi già Doom, Doom II o Heretic, il loro file WAD funziona esattamente allo stesso modo. «{addUrl}» serve a prelevare un file direttamente da un indirizzo internet, quando il sito che lo ospita lo consente.',
                es: 'Si ya posees Doom, Doom II o Heretic, su archivo WAD funciona exactamente igual. «{addUrl}» sirve para traer un archivo directamente desde una dirección de internet, cuando el sitio que lo aloja lo permite.'
            },
            'help.guide.install': {
                fr: 'Sur téléphone ou tablette, installez Spipu-Doom pour jouer en plein écran, sans la barre du navigateur : sur iPhone et iPad, avec Safari, touchez le bouton Partager puis « Sur l\'écran d\'accueil » ; sur Android, avec Chrome, ouvrez le menu ⋮ (les trois points) puis « Installer l\'application ». Une icône apparaît, et le jeu fonctionne ensuite même sans connexion internet.',
                en: 'On a phone or a tablet, install Spipu-Doom to play fullscreen, without the browser bar: on iPhone and iPad, in Safari, tap the Share button then "Add to Home Screen"; on Android, in Chrome, open the ⋮ (three dots) menu then "Install app". An icon appears, and the game then works even with no internet connection.',
                it: 'Su telefono o tablet, installa Spipu-Doom per giocare a schermo intero, senza la barra del browser: su iPhone e iPad, con Safari, tocca il pulsante Condividi e poi «Aggiungi a Home»; su Android, con Chrome, apri il menu ⋮ (i tre puntini) e poi «Installa app». Compare un\'icona, e il gioco funziona poi anche senza connessione internet.',
                es: 'En un teléfono o una tableta, instala Spipu-Doom para jugar a pantalla completa, sin la barra del navegador: en iPhone y iPad, con Safari, toca el botón Compartir y luego «Añadir a pantalla de inicio»; en Android, con Chrome, abre el menú ⋮ (los tres puntos) y luego «Instalar aplicación». Aparece un icono, y el juego funciona después incluso sin conexión a internet.'
            },
            'help.guide.controls': {
                fr: 'Jouez au clavier et à la souris, à la manette, ou avec les commandes tactiles qui s\'affichent à l\'écran : Spipu-Doom reconnaît tout seul ce que vous utilisez. Chaque touche peut être changée dans les options, une fois un jeu choisi.',
                en: 'Play with the keyboard and mouse, with a gamepad, or with the touch controls shown on screen: Spipu-Doom works out on its own what you are using. Every key can be changed in the options, once you have picked a game.',
                it: 'Gioca con tastiera e mouse, con un controller, o con i comandi touch che compaiono sullo schermo: Spipu-Doom riconosce da solo quello che stai usando. Ogni tasto può essere cambiato nelle opzioni, dopo aver scelto un gioco.',
                es: 'Juega con teclado y ratón, con un mando, o con los controles táctiles que aparecen en pantalla: Spipu-Doom reconoce por sí solo lo que estás usando. Cada tecla puede cambiarse en las opciones, una vez elegido un juego.'
            },
            'help.keyCapture': {
                fr: 'Appuyez sur la touche à utiliser pour « {action} »…',
                en: 'Press the key to use for "{action}"…',
                it: 'Premi il tasto da usare per «{action}»…',
                es: 'Pulsa la tecla que quieres usar para «{action}»…'
            },
            'help.about.what': {
                fr: 'Spipu-Doom convertit et fait tourner vos fichiers WAD Doom à la volée, entièrement dans le navigateur : rendu WebGL, physique FPS, éléments mouvants et armes fidèles au jeu original.',
                en: 'Spipu-Doom converts and runs your Doom WAD files on the fly, entirely in the browser: WebGL rendering, FPS physics, moving elements and weapons faithful to the original game.',
                it: 'Spipu-Doom converte e fa girare i tuoi file WAD di Doom al volo, interamente nel browser: rendering WebGL, fisica FPS, elementi mobili e armi fedeli al gioco originale.',
                es: 'Spipu-Doom convierte y ejecuta tus archivos WAD de Doom al vuelo, completamente en el navegador: renderizado WebGL, físicas FPS, elementos móviles y armas fieles al juego original.'
            },
            'help.about.author': {
                fr: 'Développé par Spipu (Laurent Minguet).',
                en: 'Developed by Spipu (Laurent Minguet).',
                it: 'Sviluppato da Spipu (Laurent Minguet).',
                es: 'Desarrollado por Spipu (Laurent Minguet).'
            },
            'help.about.source': {
                fr: 'Code source du projet :',
                en: 'Project source code:',
                it: 'Codice sorgente del progetto:',
                es: 'Código fuente del proyecto:'
            },
            'help.about.licence': {
                fr: 'Licence MIT — à l\'exception des graphismes de decals d\'impact et des textes de fin de chapitre, repris d\'UZDoom sous licence GPL v3, et du synthétiseur musical libADLMIDI, embarqué sous licence LGPL v3.',
                en: 'MIT licence — except the impact decal graphics and the end-of-chapter texts, taken from UZDoom under the GPL v3 licence, and the libADLMIDI music synthesizer, embedded under the LGPL v3 licence.',
                it: 'Licenza MIT — a eccezione della grafica dei segni d\'impatto e dei testi di fine capitolo, ripresi da UZDoom con licenza GPL v3, e del sintetizzatore musicale libADLMIDI, incorporato con licenza LGPL v3.',
                es: 'Licencia MIT — salvo los gráficos de las marcas de impacto y los textos de fin de capítulo, tomados de UZDoom bajo licencia GPL v3, y el sintetizador musical libADLMIDI, integrado bajo licencia LGPL v3.'
            },
            'help.about.wads': {
                fr: 'Aucun fichier WAD n\'est fourni. Utilisez un WAD libre comme Freedoom, ou vos propres fichiers dont vous détenez les droits — Doom et ses données de jeu restent la propriété de leurs ayants droit.',
                en: 'No WAD file is shipped. Use a free WAD such as Freedoom, or your own files that you hold the rights to — Doom and its game data remain the property of their rights holders.',
                it: 'Nessun file WAD è incluso. Usa un WAD libero come Freedoom, o i tuoi file di cui detieni i diritti — Doom e i suoi dati di gioco restano proprietà dei rispettivi titolari.',
                es: 'No se incluye ningún archivo WAD. Usa un WAD libre como Freedoom, o tus propios archivos cuyos derechos poseas — Doom y sus datos de juego siguen siendo propiedad de sus titulares.'
            },
            'help.about.copyright': {
                fr: '© 2024-{year} Spipu.',
                en: '© 2024-{year} Spipu.',
                it: '© 2024-{year} Spipu.',
                es: '© 2024-{year} Spipu.'
            },

            // Setting values and input devices
            'value.yes': {
                fr: 'Oui',
                en: 'Yes',
                it: 'Sì',
                es: 'Sí'
            },
            'value.no': {
                fr: 'Non',
                en: 'No',
                it: 'No',
                es: 'No'
            },
            'value.noLimit': {
                fr: 'Aucune',
                en: 'None',
                it: 'Nessuno',
                es: 'Ninguno'
            },
            'value.deathmatchItems.weaponsStay': {
                fr: 'Armes permanentes',
                en: 'Weapons stay',
                it: 'Armi permanenti',
                es: 'Armas permanentes'
            },
            'value.deathmatchItems.itemsRespawn': {
                fr: 'Objets qui réapparaissent',
                en: 'Items respawn',
                it: 'Oggetti che ricompaiono',
                es: 'Objetos que reaparecen'
            },
            // Renderer values: 'WebGL' is a proper name and stays literal in
            // the definition, the three CPU rasterizers are named by what they
            // can draw.
            'value.renderer.softwareTextured': {
                fr: 'Logiciel texturé',
                en: 'Software textured',
                it: 'Software con texture',
                es: 'Software con texturas'
            },
            'value.renderer.softwareFlat': {
                fr: 'Logiciel en aplats',
                en: 'Software flat',
                it: 'Software a tinte piatte',
                es: 'Software plano'
            },
            'value.renderer.softwareWireframe': {
                fr: 'Logiciel filaire',
                en: 'Software wireframe',
                it: 'Software wireframe',
                es: 'Software de alambre'
            },
            'key.space': {
                fr: 'Espace',
                en: 'Space',
                it: 'Spazio',
                es: 'Espacio'
            },
            'key.numpad': {
                fr: 'Num {key}',
                en: 'Numpad {key}',
                it: 'Num {key}',
                es: 'Num {key}'
            },
            'device.gamepad': {
                fr: 'Manette {name}',
                en: 'Gamepad {name}',
                it: 'Controller {name}',
                es: 'Mando {name}'
            },
            'device.virtualPad': {
                fr: 'Manette virtuelle',
                en: 'Virtual gamepad',
                it: 'Controller virtuale',
                es: 'Mando virtual'
            },
            'device.keyboardMouse': {
                fr: 'Clavier et souris',
                en: 'Keyboard and mouse',
                it: 'Tastiera e mouse',
                es: 'Teclado y ratón'
            },

            // --- Errors (WadError codes) ---
            'error.generic': {
                fr: 'Erreur : {message}',
                en: 'Error: {message}',
                it: 'Errore: {message}',
                es: 'Error: {message}'
            },
            'error.fetchOffline': {
                fr: 'Aucune connexion réseau',
                en: 'No network connection',
                it: 'Nessuna connessione di rete',
                es: 'Sin conexión de red'
            },
            'error.fetchBlocked': {
                fr: 'Ce serveur n\'autorise pas le téléchargement direct — enregistrez le fichier, puis utilisez « Fichier local »',
                en: 'This server does not allow direct downloads — save the file, then use "Local file"',
                it: 'Questo server non consente il download diretto — salva il file, poi usa «File locale»',
                es: 'Este servidor no permite la descarga directa — guarda el archivo y luego usa «Archivo local»'
            },
            'error.fetchHttp': {
                fr: 'Le serveur a refusé le fichier',
                en: 'The server refused the file',
                it: 'Il server ha rifiutato il file',
                es: 'El servidor rechazó el archivo'
            },
            'error.fetchFailed': {
                fr: 'Téléchargement impossible',
                en: 'Download failed',
                it: 'Download impossibile',
                es: 'Descarga imposible'
            },
            'error.invalidFormat': {
                fr: 'Ce fichier n\'est pas un WAD valide (IWAD/PWAD attendu)',
                en: 'This file is not a valid WAD (IWAD/PWAD expected)',
                it: 'Questo file non è un WAD valido (atteso IWAD/PWAD)',
                es: 'Este archivo no es un WAD válido (se esperaba IWAD/PWAD)'
            },
            'error.quotaExceeded': {
                fr: 'Espace de stockage insuffisant — supprimez un WAD',
                en: 'Not enough storage space — delete a WAD',
                it: 'Spazio di archiviazione insufficiente — elimina un WAD',
                es: 'Espacio de almacenamiento insuficiente — elimina un WAD'
            },
            'error.storageUnavailable': {
                fr: 'Stockage navigateur indisponible',
                en: 'Browser storage unavailable',
                it: 'Archiviazione del browser non disponibile',
                es: 'Almacenamiento del navegador no disponible'
            },
            'error.notFound': {
                fr: 'WAD introuvable',
                en: 'WAD not found',
                it: 'WAD non trovato',
                es: 'WAD no encontrado'
            },
            'error.wadDuplicate': {
                fr: 'Ce WAD est déjà dans la liste',
                en: 'This WAD is already in the list',
                it: 'Questo WAD è già nella lista',
                es: 'Este WAD ya está en la lista'
            },
            'error.wadOlder': {
                fr: 'Une version plus récente de ce WAD est déjà dans la liste',
                en: 'A newer version of this WAD is already in the list',
                it: 'Una versione più recente di questo WAD è già nella lista',
                es: 'Una versión más reciente de este WAD ya está en la lista'
            },

            // --- Game (pause menu + level chaining modals) ---
            'game.pause.resume': {
                fr: 'Reprendre',
                en: 'Resume',
                it: 'Riprendi',
                es: 'Reanudar'
            },
            'game.pause.save': {
                fr: 'Sauvegarder la partie',
                en: 'Save game',
                it: 'Salva partita',
                es: 'Guardar la partida'
            },
            'game.pause.quit': {
                fr: 'Quitter le niveau',
                en: 'Leave the level',
                it: 'Esci dal livello',
                es: 'Salir del nivel'
            },
            'game.death.title': {
                fr: 'Vous êtes mort',
                en: 'You are dead',
                it: 'Sei morto',
                es: 'Has muerto'
            },
            'game.death.restart': {
                fr: 'Recommencer le niveau',
                en: 'Restart the level',
                it: 'Ricomincia il livello',
                es: 'Reiniciar el nivel'
            },
            'game.level.loading': {
                fr: 'Chargement du niveau {level}',
                en: 'Loading level {level}',
                it: 'Caricamento del livello {level}',
                es: 'Cargando el nivel {level}'
            },
            'game.level.finished': {
                fr: 'Niveau {level} terminé !',
                en: 'Level {level} finished!',
                it: 'Livello {level} completato!',
                es: '¡Nivel {level} completado!'
            },
            'game.level.finishedNamed': {
                fr: '{level} {name} terminé !',
                en: '{level} {name} finished!',
                it: '{level} {name} completato!',
                es: '¡{level} {name} completado!'
            },
            'game.episode.finished': {
                fr: 'Épisode terminé !',
                en: 'Episode finished!',
                it: 'Episodio completato!',
                es: '¡Episodio completado!'
            },
            'game.finished': {
                fr: 'Partie terminée !',
                en: 'Game over!',
                it: 'Partita completata!',
                es: '¡Partida completada!'
            },
            'game.tally.time': {
                fr: 'Temps',
                en: 'Time',
                it: 'Tempo',
                es: 'Tiempo'
            },
            'game.tally.kills': {
                fr: 'Ennemis',
                en: 'Kills',
                it: 'Nemici',
                es: 'Enemigos'
            },
            'game.tally.items': {
                fr: 'Objets',
                en: 'Items',
                it: 'Oggetti',
                es: 'Objetos'
            },
            'game.tally.secrets': {
                fr: 'Secrets',
                en: 'Secrets',
                it: 'Segreti',
                es: 'Secretos'
            },
            'game.tally.fragsTotal': {
                fr: 'Total',
                en: 'Total',
                it: 'Totale',
                es: 'Total'
            },
            'game.tally.none': {
                fr: 'aucun',
                en: 'none',
                it: 'nessuno',
                es: 'ninguno'
            },
            'game.tally.next': {
                fr: 'Niveau suivant',
                en: 'Next level',
                it: 'Livello successivo',
                es: 'Siguiente nivel'
            },
            'game.tally.menu': {
                fr: 'Retour au menu',
                en: 'Back to menu',
                it: 'Torna al menu',
                es: 'Volver al menú'
            },
            // Leaves the tally for the story text.
            'game.finale.continue': {
                fr: 'Continuer',
                en: 'Continue',
                it: 'Continua',
                es: 'Continuar'
            },

            'hud.health': {
                fr: 'PV',
                en: 'HP',
                it: 'PV',
                es: 'PV'
            },
            'hud.armor': {
                fr: 'AR',
                en: 'AR',
                it: 'AR',
                es: 'AR'
            },
            'hud.ammo': {
                fr: 'MUNITIONS',
                en: 'AMMO',
                it: 'MUNIZIONI',
                es: 'MUNICIÓN'
            },
            'hud.automap': {
                fr: 'Carte',
                en: 'Map',
                it: 'Mappa',
                es: 'Mapa'
            },
            'hud.fps': {
                fr: '{value} fps',
                en: '{value} fps',
                it: '{value} fps',
                es: '{value} fps'
            },
            'hud.fpsPing': {
                fr: '{value} fps - ping {ping} ms',
                en: '{value} fps - ping {ping} ms',
                it: '{value} fps - ping {ping} ms',
                es: '{value} fps - ping {ping} ms'
            },

            // Running power-up effects: one label per effect, whatever the game's item name.
            'effect.berserk': {
                fr: 'Berserk',
                en: 'Berserk',
                it: 'Berserk',
                es: 'Berserk'
            },
            'effect.invulnerability': {
                fr: 'Invulnérabilité',
                en: 'Invulnerability',
                it: 'Invulnerabilità',
                es: 'Invulnerabilidad'
            },
            'effect.radiationSuit': {
                fr: 'Anti-radiations',
                en: 'Radiation suit',
                it: 'Anti-radiazioni',
                es: 'Antirradiación'
            },
            'effect.light': {
                fr: 'Vision de nuit',
                en: 'Night vision',
                it: 'Visione notturna',
                es: 'Visión nocturna'
            },
            'effect.invisibility': {
                fr: 'Invisibilité',
                en: 'Invisibility',
                it: 'Invisibilità',
                es: 'Invisibilidad'
            },

            // --- Units (byte sizes) ---
            'unit.megabyte': {
                fr: 'Mo',
                en: 'MB',
                it: 'MB',
                es: 'MB'
            },
            'unit.kilobyte': {
                fr: 'Ko',
                en: 'KB',
                it: 'KB',
                es: 'KB'
            },
            'unit.byte': {
                fr: 'o',
                en: 'B',
                it: 'B',
                es: 'B'
            },

            // --- Difficulties ---
            // Generic scale instead of the vanilla skill titles; skill 0 is our
            // own monster-free exploration mode.
            'difficulty.0': {
                fr: 'Monstres pacifiques',
                en: 'Pacifist monsters',
                it: 'Mostri pacifici',
                es: 'Monstruos pacíficos'
            },
            'difficulty.1': {
                fr: 'Très facile',
                en: 'Very easy',
                it: 'Molto facile',
                es: 'Muy fácil'
            },
            'difficulty.2': {
                fr: 'Facile',
                en: 'Easy',
                it: 'Facile',
                es: 'Fácil'
            },
            'difficulty.3': {
                fr: 'Moyen',
                en: 'Normal',
                it: 'Normale',
                es: 'Normal'
            },
            'difficulty.4': {
                fr: 'Difficile',
                en: 'Hard',
                it: 'Difficile',
                es: 'Difícil'
            },
            'difficulty.5': {
                fr: 'Très difficile',
                en: 'Very hard',
                it: 'Molto difficile',
                es: 'Muy difícil'
            },

            // --- Weapon names ---
            // Keyed by weapon code; the profile table's name stays the HUD fallback.
            'weapon.fist': {
                fr: 'Poing',
                en: 'Fist',
                it: 'Pugno',
                es: 'Puño'
            },
            'weapon.chainsaw': {
                fr: 'Tronçonneuse',
                en: 'Chainsaw',
                it: 'Motosega',
                es: 'Motosierra'
            },
            'weapon.pistol': {
                fr: 'Pistolet',
                en: 'Pistol',
                it: 'Pistola',
                es: 'Pistola'
            },
            'weapon.shotgun': {
                fr: 'Fusil à pompe',
                en: 'Shotgun',
                it: 'Fucile a pompa',
                es: 'Escopeta'
            },
            'weapon.supershotgun': {
                fr: 'Fusil à pompe double',
                en: 'Super Shotgun',
                it: 'Doppietta',
                es: 'Superescopeta'
            },
            'weapon.chaingun': {
                fr: 'Mitrailleuse',
                en: 'Chaingun',
                it: 'Mitragliatrice',
                es: 'Ametralladora'
            },
            'weapon.rocket': {
                fr: 'Lance-roquettes',
                en: 'Rocket Launcher',
                it: 'Lanciarazzi',
                es: 'Lanzacohetes'
            },
            'weapon.plasma': {
                fr: 'Fusil à plasma',
                en: 'Plasma Rifle',
                it: 'Fucile al plasma',
                es: 'Rifle de plasma'
            },
            'weapon.bfg': {
                fr: 'BFG9000',
                en: 'BFG9000',
                it: 'BFG9000',
                es: 'BFG9000'
            },
            'weapon.staff': {
                fr: 'Bâton',
                en: 'Staff',
                it: 'Bastone',
                es: 'Bastón'
            },
            'weapon.gauntlets': {
                fr: 'Gantelets',
                en: 'Gauntlets',
                it: 'Manopole',
                es: 'Guanteletes'
            },
            'weapon.goldwand': {
                fr: 'Baguette d\'or',
                en: 'Gold Wand',
                it: 'Bacchetta d\'oro',
                es: 'Vara de oro'
            },
            'weapon.crossbow': {
                fr: 'Arbalète éthérée',
                en: 'Ethereal Crossbow',
                it: 'Balestra eterea',
                es: 'Ballesta etérea'
            },
            'weapon.blaster': {
                fr: 'Griffe de dragon',
                en: 'Dragon Claw',
                it: 'Artiglio di drago',
                es: 'Garra de dragón'
            },
            'weapon.skullrod': {
                fr: 'Bâton de l\'enfer',
                en: 'Hellstaff',
                it: 'Bastone infernale',
                es: 'Báculo infernal'
            },
            'weapon.phoenixrod': {
                fr: 'Sceptre du phénix',
                en: 'Phoenix Rod',
                it: 'Scettro della fenice',
                es: 'Cetro del fénix'
            },
            'weapon.mace': {
                fr: 'Masse de feu',
                en: 'Firemace',
                it: 'Mazza di fuoco',
                es: 'Maza de fuego'
            },

            // --- Settings (DoomSettings.DEFINITIONS nameCode) ---
            'settings.display.language': {
                fr: 'Langue',
                en: 'Language',
                it: 'Lingua',
                es: 'Idioma'
            },
            'settings.display.renderer': {
                fr: 'Moteur de rendu',
                en: 'Rendering engine',
                it: 'Motore di rendering',
                es: 'Motor de renderizado'
            },
            'settings.display.crosshair': {
                fr: 'Afficher le réticule',
                en: 'Show the crosshair',
                it: 'Mostra il mirino',
                es: 'Mostrar la mira'
            },
            'settings.display.showFps': {
                fr: 'Afficher le framerate',
                en: 'Show the framerate',
                it: 'Mostra il frame rate',
                es: 'Mostrar los FPS'
            },
            'settings.display.distanceShading': {
                fr: 'Assombrissement à la distance',
                en: 'Distance darkening',
                it: 'Oscuramento con la distanza',
                es: 'Oscurecimiento con la distancia'
            },
            'settings.display.textureSmoothing': {
                fr: 'Lissage des textures',
                en: 'Texture smoothing',
                it: 'Filtraggio delle texture',
                es: 'Suavizado de texturas'
            },
            'settings.game.fallDamage': {
                fr: 'Dégâts de chute',
                en: 'Fall damage',
                it: 'Danni da caduta',
                es: 'Daño por caída'
            },
            'settings.game.jump': {
                fr: 'Autoriser le saut',
                en: 'Allow jumping',
                it: 'Consenti il salto',
                es: 'Permitir el salto'
            },
            'settings.game.crouch': {
                fr: 'Autoriser l\'accroupissement',
                en: 'Allow crouching',
                it: 'Consenti l\'accovacciamento',
                es: 'Permitir agacharse'
            },
            'settings.multiplayer.nickname': {
                fr: 'Surnom',
                en: 'Nickname',
                it: 'Soprannome',
                es: 'Apodo'
            },
            'settings.multiplayer.friendlyFire': {
                fr: 'Tir allié en coopératif',
                en: 'Friendly fire in cooperative',
                it: 'Fuoco amico in cooperativa',
                es: 'Fuego amigo en cooperativo'
            },
            'settings.multiplayer.dmMonsters': {
                fr: 'Monstres en deathmatch',
                en: 'Monsters in deathmatch',
                it: 'Mostri nel deathmatch',
                es: 'Monstruos en deathmatch'
            },
            'settings.multiplayer.fragLimit': {
                fr: 'Limite de frags',
                en: 'Frag limit',
                it: 'Limite di frag',
                es: 'Límite de frags'
            },
            'settings.multiplayer.timeLimit': {
                fr: 'Limite de temps',
                en: 'Time limit',
                it: 'Limite di tempo',
                es: 'Límite de tiempo'
            },
            'settings.multiplayer.dmItems': {
                fr: 'Objets en deathmatch',
                en: 'Deathmatch items',
                it: 'Oggetti nel deathmatch',
                es: 'Objetos en deathmatch'
            },
            // --- Multiplayer ---
            'multiplayer.newCooperative': {
                fr: 'Nouvelle partie coopérative',
                en: 'New cooperative game',
                it: 'Nuova partita cooperativa',
                es: 'Nueva partida cooperativa'
            },
            'multiplayer.newDeathmatch': {
                fr: 'Nouveau deathmatch',
                en: 'New deathmatch',
                it: 'Nuovo deathmatch',
                es: 'Nuevo deathmatch'
            },
            'multiplayer.join': {
                fr: 'Rejoindre une partie',
                en: 'Join a game',
                it: 'Unisciti a una partita',
                es: 'Unirse a una partida'
            },
            'multiplayer.options': {
                fr: 'Options multijoueur',
                en: 'Multiplayer options',
                it: 'Opzioni multigiocatore',
                es: 'Opciones multijugador'
            },
            'multiplayer.nickname.prompt': {
                fr: 'Veuillez saisir votre surnom',
                en: 'Please enter your nickname',
                it: 'Inserisci il tuo soprannome',
                es: 'Introduce tu apodo'
            },
            'multiplayer.pairing.showToMain': {
                fr: 'Montrez ce code à l\'hôte',
                en: 'Show this code to the host',
                it: 'Mostra questo codice all\'host',
                es: 'Muestra este código al anfitrión'
            },
            'multiplayer.pairing.readMain': {
                fr: 'Scannez le code de l\'hôte',
                en: 'Scan the host\'s code',
                it: 'Inquadra il codice dell\'host',
                es: 'Escanea el código del anfitrión'
            },
            'multiplayer.pairing.showToSub': {
                fr: 'Scannez ce code depuis l\'autre appareil',
                en: 'Scan this code from the other device',
                it: 'Inquadra questo codice dall\'altro dispositivo',
                es: 'Escanea este código desde el otro dispositivo'
            },
            'multiplayer.pairing.readSub': {
                fr: 'Scannez la réponse de l\'autre appareil',
                en: 'Scan the other device\'s answer',
                it: 'Inquadra la risposta dell\'altro dispositivo',
                es: 'Escanea la respuesta del otro dispositivo'
            },
            'multiplayer.pairing.connecting': {
                fr: 'Connexion en cours…',
                en: 'Connecting…',
                it: 'Connessione in corso…',
                es: 'Conectando…'
            },
            'multiplayer.pairing.connectingTo': {
                fr: 'Connexion à {nickname} en cours…',
                en: 'Connecting to {nickname}…',
                it: 'Connessione a {nickname} in corso…',
                es: 'Conectando con {nickname}…'
            },
            'multiplayer.lobby.title': {
                fr: 'Salon — {count}/{capacity} joueurs',
                en: 'Lobby — {count}/{capacity} players',
                it: 'Sala — {count}/{capacity} giocatori',
                es: 'Sala — {count}/{capacity} jugadores'
            },
            'multiplayer.lobby.player': {
                fr: '{slot}. {nickname}',
                en: '{slot}. {nickname}',
                it: '{slot}. {nickname}',
                es: '{slot}. {nickname}'
            },
            'multiplayer.lobby.main': {
                fr: 'Hôte',
                en: 'Host',
                it: 'Host',
                es: 'Anfitrión'
            },
            'multiplayer.lobby.ping': {
                fr: '{ping} ms',
                en: '{ping} ms',
                it: '{ping} ms',
                es: '{ping} ms'
            },
            'multiplayer.lobby.pingPending': {
                fr: 'Connexion…',
                en: 'Connecting…',
                it: 'Connessione…',
                es: 'Conectando…'
            },
            'multiplayer.lobby.away': {
                fr: 'En veille',
                en: 'Away',
                it: 'In standby',
                es: 'En espera'
            },
            'multiplayer.lobby.disconnected': {
                fr: 'Hors ligne',
                en: 'Offline',
                it: 'Non in linea',
                es: 'Sin conexión'
            },
            'multiplayer.lobby.add': {
                fr: 'Ajouter un joueur',
                en: 'Add a player',
                it: 'Aggiungi un giocatore',
                es: 'Añadir un jugador'
            },
            'multiplayer.lobby.start': {
                fr: 'Démarrer',
                en: 'Start',
                it: 'Avvia',
                es: 'Empezar'
            },
            'multiplayer.lobby.leave': {
                fr: 'Quitter',
                en: 'Leave',
                it: 'Esci',
                es: 'Salir'
            },
            'multiplayer.lobby.remove': {
                fr: 'Retirer',
                en: 'Remove',
                it: 'Rimuovi',
                es: 'Quitar'
            },
            'multiplayer.lobby.removeConfirm': {
                fr: 'Retirer {nickname} de la partie ?',
                en: 'Remove {nickname} from the game?',
                it: 'Rimuovere {nickname} dalla partita?',
                es: '¿Quitar a {nickname} de la partida?'
            },
            'multiplayer.lobby.inProgress': {
                fr: 'Partie en cours chez l\'hôte',
                en: 'Game in progress on the host',
                it: 'Partita in corso sull\'host',
                es: 'Partida en curso en el anfitrión'
            },
            'multiplayer.pause.menu': {
                fr: 'Multijoueur',
                en: 'Multiplayer',
                it: 'Multigiocatore',
                es: 'Multijugador'
            },
            'multiplayer.pause.share': {
                fr: 'Partager l\'écran',
                en: 'Share screen',
                it: 'Condividi lo schermo',
                es: 'Compartir pantalla'
            },
            'multiplayer.pause.lobby': {
                fr: 'Salon',
                en: 'Lobby',
                it: 'Sala',
                es: 'Sala'
            },
            'multiplayer.pause.stop': {
                fr: 'Arrêter le partage',
                en: 'Stop sharing',
                it: 'Interrompi la condivisione',
                es: 'Dejar de compartir'
            },
            'multiplayer.pause.leave': {
                fr: 'Quitter le partage d\'écran',
                en: 'Leave the screen sharing',
                it: 'Esci dalla condivisione dello schermo',
                es: 'Salir de la pantalla compartida'
            },
            'multiplayer.pause.stopConfirm': {
                fr: 'Arrêter le partage ?\nTous les joueurs seront déconnectés.',
                en: 'Stop sharing?\nEvery player will be disconnected.',
                it: 'Interrompere la condivisione?\nTutti i giocatori saranno disconnessi.',
                es: '¿Dejar de compartir?\nTodos los jugadores serán desconectados.'
            },
            'multiplayer.pause.switchToCooperative': {
                fr: 'Passer en coopératif',
                en: 'Switch to cooperative',
                it: 'Passa alla cooperativa',
                es: 'Pasar a cooperativo'
            },
            'multiplayer.pause.stopCoop': {
                fr: 'Arrêter le coopératif',
                en: 'Stop cooperative',
                it: 'Interrompi la cooperativa',
                es: 'Detener el cooperativo'
            },
            'multiplayer.pause.stopCoopConfirm': {
                fr: 'Arrêter le coopératif ?\nTous les joueurs seront déconnectés.',
                en: 'Stop cooperative?\nEvery player will be disconnected.',
                it: 'Interrompere la cooperativa?\nTutti i giocatori saranno disconnessi.',
                es: '¿Detener el cooperativo?\nTodos los jugadores serán desconectados.'
            },
            'multiplayer.pause.stopDeathmatch': {
                fr: 'Arrêter le deathmatch',
                en: 'Stop deathmatch',
                it: 'Interrompi il deathmatch',
                es: 'Detener el deathmatch'
            },
            'multiplayer.pause.stopDeathmatchConfirm': {
                fr: 'Arrêter le deathmatch ?\nTous les joueurs seront déconnectés.',
                en: 'Stop deathmatch?\nEvery player will be disconnected.',
                it: 'Interrompere il deathmatch?\nTutti i giocatori saranno disconnessi.',
                es: '¿Detener el deathmatch?\nTodos los jugadores serán desconectados.'
            },
            'multiplayer.pause.leaveGame': {
                fr: 'Quitter la partie',
                en: 'Leave the game',
                it: 'Esci dalla partita',
                es: 'Salir de la partida'
            },
            'multiplayer.settings.title': {
                fr: 'Réglages de la partie',
                en: 'Game settings',
                it: 'Impostazioni della partita',
                es: 'Ajustes de la partida'
            },
            'multiplayer.settings.continue': {
                fr: 'Continuer',
                en: 'Continue',
                it: 'Continua',
                es: 'Continuar'
            },
            'multiplayer.unavailable.webgl': {
                fr: 'Le multijoueur nécessite WebGL, indisponible sur cet appareil',
                en: 'Multiplayer needs WebGL, unavailable on this device',
                it: 'Il multigiocatore richiede WebGL, non disponibile su questo dispositivo',
                es: 'El multijugador necesita WebGL, no disponible en este dispositivo'
            },
            'multiplayer.unavailable.camera': {
                fr: 'Le multijoueur nécessite une caméra pour appairer les appareils',
                en: 'Multiplayer needs a camera to pair the devices',
                it: 'Il multigiocatore richiede una fotocamera per associare i dispositivi',
                es: 'El multijugador necesita una cámara para emparejar los dispositivos'
            },
            'multiplayer.error.version': {
                fr: 'L\'autre appareil utilise une autre version du jeu : rechargez les deux',
                en: 'The other device runs another version of the game: reload both',
                it: 'L\'altro dispositivo usa un\'altra versione del gioco: ricaricali entrambi',
                es: 'El otro dispositivo usa otra versión del juego: recarga ambos'
            },
            'multiplayer.error.wad': {
                fr: 'L\'hôte joue avec un autre fichier WAD',
                en: 'The host plays another WAD file',
                it: 'L\'host usa un altro file WAD',
                es: 'El anfitrión juega con otro archivo WAD'
            },
            'multiplayer.error.wadNamed': {
                fr: 'L\'hôte joue avec un autre fichier WAD :\n{wad}',
                en: 'The host plays another WAD file:\n{wad}',
                it: 'L\'host usa un altro file WAD:\n{wad}',
                es: 'El anfitrión juega con otro archivo WAD:\n{wad}'
            },
            'multiplayer.error.invite': {
                fr: 'Ce code a déjà servi : ajoutez à nouveau le joueur',
                en: 'This code was already used: add the player again',
                it: 'Questo codice è già stato usato: aggiungi di nuovo il giocatore',
                es: 'Este código ya se usó: añade de nuevo al jugador'
            },
            'multiplayer.error.connect': {
                fr: 'La connexion entre les deux appareils n\'a pas pu être établie : mettez-les sur le même Wi-Fi, ou sur le partage de connexion de l\'un d\'eux',
                en: 'The two devices could not connect: put them on the same Wi-Fi, or on one device\'s hotspot',
                it: 'I due dispositivi non sono riusciti a connettersi: mettili sulla stessa rete Wi-Fi, o sull\'hotspot di uno dei due',
                es: 'Los dos dispositivos no pudieron conectarse: ponlos en la misma red Wi-Fi, o en el punto de acceso de uno de ellos'
            },
            'multiplayer.error.otherNetwork': {
                fr: 'L\'autre appareil est sur un autre réseau (Wi-Fi contre données mobiles, par exemple) : mettez les deux appareils sur le même Wi-Fi, ou sur le partage de connexion de l\'un d\'eux',
                en: 'The other device is on another network (Wi-Fi against mobile data, for instance): put both devices on the same Wi-Fi, or on one device\'s hotspot',
                it: 'L\'altro dispositivo è su un\'altra rete (Wi-Fi contro dati mobili, per esempio): metti entrambi i dispositivi sulla stessa rete Wi-Fi, o sull\'hotspot di uno dei due',
                es: 'El otro dispositivo está en otra red (Wi-Fi frente a datos móviles, por ejemplo): pon ambos dispositivos en la misma red Wi-Fi, o en el punto de acceso de uno de ellos'
            },
            'multiplayer.error.sameNetwork': {
                fr: 'Les deux appareils sont sur le même réseau mais ne parviennent pas à se joindre : ce Wi-Fi isole peut-être ses appareils entre eux (réseau invité)',
                en: 'The two devices are on the same network but cannot reach each other: this Wi-Fi may keep its devices apart (guest network)',
                it: 'I due dispositivi sono sulla stessa rete ma non riescono a raggiungersi: questo Wi-Fi forse isola i suoi dispositivi (rete ospiti)',
                es: 'Los dos dispositivos están en la misma red pero no logran comunicarse: este Wi-Fi quizá aísla sus dispositivos entre sí (red de invitados)'
            },
            'multiplayer.error.pairing': {
                fr: 'L\'appairage a échoué',
                en: 'The pairing failed',
                it: 'Associazione non riuscita',
                es: 'El emparejamiento ha fallado'
            },
            'multiplayer.error.camera': {
                fr: 'La caméra n\'a pas pu être ouverte',
                en: 'The camera could not be opened',
                it: 'Impossibile aprire la fotocamera',
                es: 'No se pudo abrir la cámara'
            },
            'multiplayer.error.identity': {
                fr: 'L\'identité de ce WAD n\'a pas pu être calculée sur cet appareil',
                en: 'The identity of this WAD could not be computed on this device',
                it: 'Impossibile calcolare l\'identità di questo WAD su questo dispositivo',
                es: 'No se pudo calcular la identidad de este WAD en este dispositivo'
            },
            'multiplayer.waiting': {
                fr: 'En attente de {nickname}…',
                en: 'Waiting for {nickname}…',
                it: 'In attesa di {nickname}…',
                es: 'Esperando a {nickname}…'
            },
            'multiplayer.playerLeft': {
                fr: '{nickname} a quitté la partie',
                en: '{nickname} left the game',
                it: '{nickname} ha lasciato la partita',
                es: '{nickname} ha dejado la partida'
            },
            'multiplayer.playerAway': {
                fr: 'Absence de {nickname}',
                en: '{nickname} is away',
                it: 'Assenza di {nickname}',
                es: 'Ausencia de {nickname}'
            },
            'multiplayer.playerBack': {
                fr: 'Retour de {nickname}',
                en: '{nickname} is back',
                it: 'Ritorno di {nickname}',
                es: 'Regreso de {nickname}'
            },
            'multiplayer.pausedByMain': {
                fr: 'Partie en pause par l\'hôte',
                en: 'Game paused by the host',
                it: 'Partita in pausa dall\'host',
                es: 'Partida en pausa por el anfitrión'
            },
            'multiplayer.respawnPrompt': {
                fr: 'Appuyez sur Action pour réapparaître',
                en: 'Press Action to respawn',
                it: 'Premi Azione per riapparire',
                es: 'Pulsa Acción para reaparecer'
            },
            'multiplayer.mainDead': {
                fr: 'L\'hôte est mort',
                en: 'The host is dead',
                it: 'L\'host è morto',
                es: 'El anfitrión ha muerto'
            },
            'multiplayer.end.stopped': {
                fr: 'L\'hôte a arrêté la partie',
                en: 'The host stopped the game',
                it: 'L\'host ha interrotto la partita',
                es: 'El anfitrión ha detenido la partida'
            },
            'multiplayer.end.gameOver': {
                fr: 'La partie de l\'hôte est terminée',
                en: 'The host\'s game is over',
                it: 'La partita dell\'host è finita',
                es: 'La partida del anfitrión ha terminado'
            },
            'multiplayer.end.matchOver': {
                fr: 'Le match est terminé',
                en: 'The match is over',
                it: 'La partita è finita',
                es: 'La partida ha terminado'
            },
            'multiplayer.end.invalid': {
                fr: 'Message réseau invalide : la session est terminée',
                en: 'Invalid network message: the session has ended',
                it: 'Messaggio di rete non valido: la sessione è terminata',
                es: 'Mensaje de red no válido: la sesión ha terminado'
            },
            'multiplayer.end.full': {
                fr: 'Le salon est complet',
                en: 'The lobby is full',
                it: 'La sala è al completo',
                es: 'La sala está completa'
            },
            'multiplayer.end.removed': {
                fr: 'L\'hôte vous a retiré de la partie',
                en: 'The host removed you from the game',
                it: 'L\'host ti ha rimosso dalla partita',
                es: 'El anfitrión te ha quitado de la partida'
            },
            'multiplayer.end.lost': {
                fr: 'La connexion avec l\'hôte a été perdue',
                en: 'The connection to the host was lost',
                it: 'La connessione con l\'host è stata persa',
                es: 'Se perdió la conexión con el anfitrión'
            },
            'multiplayer.end.timeout': {
                fr: 'La connexion avec l\'hôte est trop lente : vous avez été déconnecté',
                en: 'The connection to the host is too slow: you have been disconnected',
                it: 'La connessione con l\'host è troppo lenta: sei stato disconnesso',
                es: 'La conexión con el anfitrión es demasiado lenta: has sido desconectado'
            },
            'settings.sound.volumeMusic': {
                fr: 'Volume de la musique',
                en: 'Music volume',
                it: 'Volume della musica',
                es: 'Volumen de la música'
            },
            'settings.sound.volumeEffects': {
                fr: 'Volume des effets',
                en: 'Effects volume',
                it: 'Volume degli effetti',
                es: 'Volumen de los efectos'
            },
            'settings.pad.yInverse': {
                fr: 'Inverser l\'axe vertical',
                en: 'Invert the vertical axis',
                it: 'Inverti l\'asse verticale',
                es: 'Invertir el eje vertical'
            },
            'settings.virtualPad.yInverse': {
                fr: 'Inverser l\'axe vertical',
                en: 'Invert the vertical axis',
                it: 'Inverti l\'asse verticale',
                es: 'Invertir el eje vertical'
            },
            'settings.mouse.yInverse': {
                fr: 'Inverser l\'axe vertical de la souris',
                en: 'Invert the mouse vertical axis',
                it: 'Inverti l\'asse verticale del mouse',
                es: 'Invertir el eje vertical del ratón'
            },
            'settings.virtualPad.moveDeadZone': {
                fr: 'Stick de déplacement — zone morte',
                en: 'Move stick — dead zone',
                it: 'Stick di movimento — zona morta',
                es: 'Stick de movimiento — zona muerta'
            },
            'settings.virtualPad.aimDeadZone': {
                fr: 'Stick de visée — zone morte',
                en: 'Aim stick — dead zone',
                it: 'Stick di mira — zona morta',
                es: 'Stick de puntería — zona muerta'
            },
            'settings.virtualPad.fireDeadZone': {
                fr: 'Stick de visée en tirant — zone morte',
                en: 'Aim stick while firing — dead zone',
                it: 'Stick di mira durante il fuoco — zona morta',
                es: 'Stick de puntería disparando — zona muerta'
            },
            'settings.virtualPad.fireSensitivity': {
                fr: 'Stick de visée en tirant — sensibilité',
                en: 'Aim stick while firing — sensitivity',
                it: 'Stick di mira durante il fuoco — sensibilità',
                es: 'Stick de puntería disparando — sensibilidad'
            },
            'settings.keyboard.forward': {
                fr: 'Avancer',
                en: 'Move forward',
                it: 'Avanza',
                es: 'Avanzar'
            },
            'settings.keyboard.backward': {
                fr: 'Reculer',
                en: 'Move backward',
                it: 'Retrocedi',
                es: 'Retroceder'
            },
            'settings.keyboard.strafeLeft': {
                fr: 'Pas à gauche',
                en: 'Strafe left',
                it: 'Passo a sinistra',
                es: 'Paso a la izquierda'
            },
            'settings.keyboard.strafeRight': {
                fr: 'Pas à droite',
                en: 'Strafe right',
                it: 'Passo a destra',
                es: 'Paso a la derecha'
            },
            'settings.keyboard.jump': {
                fr: 'Sauter',
                en: 'Jump',
                it: 'Salta',
                es: 'Saltar'
            },
            'settings.keyboard.crouch': {
                fr: 'S\'accroupir',
                en: 'Crouch',
                it: 'Accovacciati',
                es: 'Agacharse'
            },
            'settings.keyboard.action': {
                fr: 'Action / utiliser',
                en: 'Action / use',
                it: 'Azione / usa',
                es: 'Acción / usar'
            },
            'settings.keyboard.fire': {
                fr: 'Tirer',
                en: 'Fire',
                it: 'Spara',
                es: 'Disparar'
            },
            'settings.keyboard.weaponPrev': {
                fr: 'Arme précédente',
                en: 'Previous weapon',
                it: 'Arma precedente',
                es: 'Arma anterior'
            },
            'settings.keyboard.weaponNext': {
                fr: 'Arme suivante',
                en: 'Next weapon',
                it: 'Arma successiva',
                es: 'Arma siguiente'
            },
            'settings.keyboard.walkSlow': {
                fr: 'Marcher lentement',
                en: 'Walk slowly',
                it: 'Cammina lentamente',
                es: 'Caminar despacio'
            },
            'settings.keyboard.toggleHud': {
                fr: 'Afficher le HUD de debug',
                en: 'Show the debug HUD',
                it: 'Mostra l\'HUD di debug',
                es: 'Mostrar el HUD de depuración'
            },
            'settings.keyboard.map': {
                fr: 'Afficher la carte',
                en: 'Show the map',
                it: 'Mostra la mappa',
                es: 'Mostrar el mapa'
            },
            'settings.keyboard.lookDown': {
                fr: 'Fausse souris - Y+',
                en: 'Fake mouse - Y+',
                it: 'Mouse finto - Y+',
                es: 'Ratón falso - Y+'
            },
            'settings.keyboard.lookUp': {
                fr: 'Fausse souris - Y-',
                en: 'Fake mouse - Y-',
                it: 'Mouse finto - Y-',
                es: 'Ratón falso - Y-'
            },
            'settings.keyboard.lookRight': {
                fr: 'Fausse souris - X+',
                en: 'Fake mouse - X+',
                it: 'Mouse finto - X+',
                es: 'Ratón falso - X+'
            },
            'settings.keyboard.lookLeft': {
                fr: 'Fausse souris - X-',
                en: 'Fake mouse - X-',
                it: 'Mouse finto - X-',
                es: 'Ratón falso - X-'
            }
        };
    }
}
