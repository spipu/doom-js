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
            'menu.back':               {fr: 'Retour',                                en: 'Back'},
            'menu.close':              {fr: 'Fermer',                                en: 'Close'},
            'menu.confirm':            {fr: 'Confirmer',                             en: 'Confirm'},
            'menu.cancel':             {fr: 'Annuler',                               en: 'Cancel'},
            'menu.storageUnavailable': {fr: 'Stockage navigateur indisponible — impossible de gérer les WADs.',
                                        en: 'Browser storage unavailable — WADs cannot be managed.'},

            // WAD list
            'menu.wad.title':          {fr: 'Fichiers WAD',                          en: 'WAD files'},
            'menu.wad.empty':          {fr: 'Aucun WAD — ajoutez-en un ci-dessous',  en: 'No WAD — add one below'},
            'menu.wad.urlPlaceholder': {fr: 'https://exemple.com/fichier.wad',       en: 'https://example.com/file.wad'},
            'menu.wad.addUrl':         {fr: 'Ajouter par URL',                       en: 'Add by URL'},
            'menu.wad.addFile':        {fr: 'Fichier local',                         en: 'Local file'},
            'menu.wad.urlMissing':     {fr: 'Saisissez une URL',                     en: 'Enter a URL'},
            'menu.wad.downloading':    {fr: 'Téléchargement...',                     en: 'Downloading...'},
            'menu.wad.reading':        {fr: 'Lecture du fichier...',                 en: 'Reading the file...'},
            'menu.wad.added':          {fr: '{wad} ajouté',                          en: '{wad} added'},
            'menu.wad.delete':         {fr: 'Supprimer',                             en: 'Delete'},
            'menu.wad.deleteConfirm':  {fr: 'Supprimer {wad} ?',                     en: 'Delete {wad}?'},
            'menu.wad.loading':        {fr: 'Chargement de {wad}',                   en: 'Loading {wad}'},

            // WAD menu (one WAD selected)
            'menu.game.newGame':       {fr: 'Nouvelle partie',                       en: 'New game'},
            'menu.game.load':          {fr: 'Charger une partie',                    en: 'Load game'},
            'menu.game.options':       {fr: 'Options',                               en: 'Options'},
            'menu.game.quit':          {fr: 'Quitter {wad}',                         en: 'Quit {wad}'},

            // Save slots modal (load from the WAD menu or the pause menu,
            // save from the pause menu)
            'menu.save.titleLoad':        {fr: 'Charger une partie',                 en: 'Load game'},
            'menu.save.titleSave':        {fr: 'Sauvegarder la partie',              en: 'Save game'},
            'menu.save.slot':             {fr: 'Slot {n}',                           en: 'Slot {n}'},
            'menu.save.empty':            {fr: 'Vide',                               en: 'Empty'},
            'menu.save.delete':           {fr: 'Supprimer',                          en: 'Delete'},
            'menu.save.deleteConfirm':    {fr: 'Supprimer la sauvegarde du slot {n} ?',
                                           en: 'Delete the save in slot {n}?'},
            'menu.save.overwriteConfirm': {fr: 'Remplacer la sauvegarde du slot {n} ?',
                                           en: 'Replace the save in slot {n}?'},
            'menu.save.deadInfo':         {fr: 'Impossible de sauvegarder quand on est mort',
                                           en: 'Cannot save while dead'},
            'menu.save.incompatible':     {fr: 'Sauvegarde incompatible avec cette version du jeu',
                                           en: 'Save incompatible with this game version'},
            'menu.save.loadError':        {fr: 'Impossible de charger la sauvegarde',
                                           en: 'Unable to load the save'},

            // Episode selection (New game). The episode NAMES are proper
            // nouns carried by the game profiles, never translated — like the
            // level names.
            'menu.episode.title':      {fr: 'Épisode',                               en: 'Episode'},
            'menu.episode.item':       {fr: 'Épisode {episode}',                     en: 'Episode {episode}'},
            'menu.episode.reading':    {fr: 'Lecture du WAD...',                     en: 'Reading the WAD...'},
            'menu.episode.empty':      {fr: 'Aucun niveau trouvé dans ce WAD',       en: 'No level found in this WAD'},

            // Difficulty
            'menu.difficulty.title':   {fr: 'Difficulté',                            en: 'Difficulty'},
            'menu.difficulty.skill':   {fr: 'Niveau {skill}',                        en: 'Level {skill}'},

            // Level launch modal
            'menu.level.loading':      {fr: 'Chargement du niveau {level} de {wad}', en: 'Loading level {level} of {wad}'},

            // --- Options modal (also serves the About page of the ? button) ---
            'help.display':            {fr: 'Affichage',                             en: 'Display'},
            'help.controls':           {fr: 'Contrôles',                             en: 'Controls'},
            'help.reset':              {fr: 'Réinitialiser tous les paramétrages',   en: 'Reset every setting'},
            'help.resetConfirm':       {fr: 'Supprimer tous les paramétrages enregistrés ?',
                                        en: 'Delete every saved setting?'},
            'help.about':              {fr: 'À propos',                              en: 'About'},
            'help.keyCapture':         {fr: 'Appuyez sur la touche à utiliser pour « {action} »…',
                                        en: 'Press the key to use for "{action}"…'},
            'help.about.what':         {fr: 'Spipu-Doom convertit et fait tourner vos fichiers WAD Doom à la volée, entièrement dans le navigateur : rendu WebGL, physique FPS, éléments mouvants et armes fidèles au jeu original.',
                                        en: 'Spipu-Doom converts and runs your Doom WAD files on the fly, entirely in the browser: WebGL rendering, FPS physics, moving elements and weapons faithful to the original game.'},
            'help.about.author':       {fr: 'Développé par Spipu (Laurent Minguet).',
                                        en: 'Developed by Spipu (Laurent Minguet).'},
            'help.about.licence':      {fr: 'Licence MIT — à l\'exception des graphismes de decals d\'impact, repris d\'UZDoom sous licence GPL v3.',
                                        en: 'MIT licence — except the impact decal graphics, taken from UZDoom under the GPL v3 licence.'},
            'help.about.wads':         {fr: 'Aucun fichier WAD n\'est fourni. Utilisez un WAD libre comme Freedoom, ou vos propres fichiers dont vous détenez les droits — Doom et ses données de jeu restent la propriété de leurs ayants droit.',
                                        en: 'No WAD file is shipped. Use a free WAD such as Freedoom, or your own files that you hold the rights to — Doom and its game data remain the property of their rights holders.'},
            'help.about.copyright':    {fr: '© 2024-{year} Spipu.',                  en: '© 2024-{year} Spipu.'},

            // Setting values and input devices
            'value.yes':               {fr: 'Oui',                                   en: 'Yes'},
            'value.no':                {fr: 'Non',                                   en: 'No'},
            'key.space':               {fr: 'Espace',                                en: 'Space'},
            'key.numpad':              {fr: 'Num {key}',                             en: 'Numpad {key}'},
            'device.gamepad':          {fr: 'Manette {name}',                        en: 'Gamepad {name}'},
            'device.virtualPad':       {fr: 'Manette virtuelle',                     en: 'Virtual gamepad'},
            'device.keyboardMouse':    {fr: 'Clavier et souris',                     en: 'Keyboard and mouse'},

            // --- Errors (WadError codes) ---
            'error.generic':             {fr: 'Erreur : {message}',                  en: 'Error: {message}'},
            'error.fetchOffline':        {fr: 'Aucune connexion réseau',              en: 'No network connection'},
            'error.fetchBlocked':        {fr: 'Ce serveur n\'autorise pas le téléchargement direct — enregistrez le fichier, puis utilisez « Fichier local »',
                                          en: 'This server does not allow direct downloads — save the file, then use "Local file"'},
            'error.fetchHttp':           {fr: 'Le serveur a refusé le fichier',       en: 'The server refused the file'},
            'error.fetchFailed':         {fr: 'Téléchargement impossible',            en: 'Download failed'},
            'error.invalidFormat':       {fr: 'Ce fichier n\'est pas un WAD valide (IWAD/PWAD attendu)',
                                          en: 'This file is not a valid WAD (IWAD/PWAD expected)'},
            'error.quotaExceeded':       {fr: 'Espace de stockage insuffisant — supprimez un WAD',
                                          en: 'Not enough storage space — delete a WAD'},
            'error.storageUnavailable':  {fr: 'Stockage navigateur indisponible',     en: 'Browser storage unavailable'},
            'error.notFound':            {fr: 'WAD introuvable',                      en: 'WAD not found'},

            // --- Game (pause menu + level chaining modals) ---
            'game.pause.resume':       {fr: 'Reprendre',                             en: 'Resume'},
            'game.pause.save':         {fr: 'Sauvegarder la partie',                 en: 'Save game'},
            'game.pause.quit':         {fr: 'Quitter le niveau',                     en: 'Leave the level'},
            'game.level.loading':      {fr: 'Chargement du niveau {level}',          en: 'Loading level {level}'},
            'game.level.finished':     {fr: 'Niveau {level} terminé !',              en: 'Level {level} finished!'},
            'game.episode.finished':   {fr: 'Épisode terminé !',                     en: 'Episode finished!'},
            'game.finished':           {fr: 'Partie terminée !',                     en: 'Game over!'},
            'game.tally.time':         {fr: 'Temps',                                 en: 'Time'},
            'game.tally.kills':        {fr: 'Ennemis',                               en: 'Kills'},
            'game.tally.items':        {fr: 'Objets',                                en: 'Items'},
            'game.tally.secrets':      {fr: 'Secrets',                               en: 'Secrets'},
            'game.tally.none':         {fr: 'aucun',                                 en: 'none'},
            'game.tally.next':         {fr: 'Niveau suivant',                        en: 'Next level'},
            'game.tally.menu':         {fr: 'Retour au menu',                        en: 'Back to menu'},

            // --- HUD ---
            'hud.health':              {fr: 'PV',                                    en: 'HP'},
            'hud.armor':               {fr: 'AR',                                    en: 'AR'},
            'hud.ammo':                {fr: 'MUNITIONS',                             en: 'AMMO'},

            // Running power-up effects (one shared label per effect, whatever
            // the game's item name — user decision)
            'effect.berserk':          {fr: 'Berserk',                               en: 'Berserk'},
            'effect.invulnerability':  {fr: 'Invulnérabilité',                       en: 'Invulnerability'},
            'effect.radiationSuit':    {fr: 'Anti-radiations',                       en: 'Radiation suit'},
            'effect.light':            {fr: 'Vision de nuit',                        en: 'Night vision'},
            'effect.invisibility':     {fr: 'Invisibilité',                          en: 'Invisibility'},

            // --- Units (byte sizes) ---
            'unit.megabyte':           {fr: 'Mo',                                    en: 'MB'},
            'unit.kilobyte':           {fr: 'Ko',                                    en: 'KB'},
            'unit.byte':               {fr: 'o',                                     en: 'B'},

            // --- Difficulties ---
            // Generic scale: the vanilla titles of skills 1-5 were
            // "I'm too young to die", "Hey, not too rough", "Hurt me plenty",
            // "Ultra-Violence" and "Nightmare!"; skill 0 is our own monster-free
            // exploration mode.
            'difficulty.0':            {fr: 'Sans monstre',                          en: 'No monsters'},
            'difficulty.1':            {fr: 'Très facile',                           en: 'Very easy'},
            'difficulty.2':            {fr: 'Facile',                                en: 'Easy'},
            'difficulty.3':            {fr: 'Moyen',                                 en: 'Normal'},
            'difficulty.4':            {fr: 'Difficile',                             en: 'Hard'},
            'difficulty.5':            {fr: 'Très difficile',                        en: 'Very hard'},

            // --- Weapon names (the only game data a view displays) ---
            // Keyed by the weapon code of the game profiles; the English side
            // repeats the name transcribed in the profile table, which stays the
            // HUD fallback for a weapon with no entry here.
            'weapon.fist':             {fr: 'Poing',                                 en: 'Fist'},
            'weapon.chainsaw':         {fr: 'Tronçonneuse',                          en: 'Chainsaw'},
            'weapon.pistol':           {fr: 'Pistolet',                              en: 'Pistol'},
            'weapon.shotgun':          {fr: 'Fusil à pompe',                         en: 'Shotgun'},
            'weapon.supershotgun':     {fr: 'Fusil à pompe double',                  en: 'Super Shotgun'},
            'weapon.chaingun':         {fr: 'Mitrailleuse',                          en: 'Chaingun'},
            'weapon.rocket':           {fr: 'Lance-roquettes',                       en: 'Rocket Launcher'},
            'weapon.plasma':           {fr: 'Fusil à plasma',                        en: 'Plasma Rifle'},
            'weapon.bfg':              {fr: 'BFG9000',                               en: 'BFG9000'},
            'weapon.staff':            {fr: 'Bâton',                                 en: 'Staff'},
            'weapon.gauntlets':        {fr: 'Gantelets',                             en: 'Gauntlets'},
            'weapon.goldwand':         {fr: 'Baguette d\'or',                        en: 'Gold Wand'},
            'weapon.crossbow':         {fr: 'Arbalète éthérée',                      en: 'Ethereal Crossbow'},
            'weapon.blaster':          {fr: 'Griffe de dragon',                      en: 'Dragon Claw'},
            'weapon.skullrod':         {fr: 'Bâton de l\'enfer',                     en: 'Hellstaff'},
            'weapon.phoenixrod':       {fr: 'Sceptre du phénix',                     en: 'Phoenix Rod'},
            'weapon.mace':             {fr: 'Masse de feu',                          en: 'Firemace'},

            // --- Settings (DoomSettings.DEFINITIONS nameCode) ---
            'settings.display.language':          {fr: 'Langue',                       en: 'Language'},
            'settings.display.crosshair':         {fr: 'Afficher le réticule',         en: 'Show the crosshair'},
            'settings.display.distanceShading':   {fr: 'Assombrissement à la distance', en: 'Distance darkening'},
            'settings.display.textureSmoothing':  {fr: 'Lissage des textures',         en: 'Texture smoothing'},
            'settings.pad.yInverse':              {fr: 'Inverser l\'axe vertical',     en: 'Invert the vertical axis'},
            'settings.virtualPad.yInverse':       {fr: 'Inverser l\'axe vertical',     en: 'Invert the vertical axis'},
            'settings.mouse.yInverse':            {fr: 'Inverser l\'axe vertical de la souris',
                                                   en: 'Invert the mouse vertical axis'},
            'settings.virtualPad.moveDeadZone':   {fr: 'Stick de déplacement — zone morte',
                                                   en: 'Move stick — dead zone'},
            'settings.virtualPad.aimDeadZone':    {fr: 'Stick de visée — zone morte',
                                                   en: 'Aim stick — dead zone'},
            'settings.virtualPad.fireDeadZone':   {fr: 'Stick de visée en tirant — zone morte',
                                                   en: 'Aim stick while firing — dead zone'},
            'settings.virtualPad.fireSensitivity': {fr: 'Stick de visée en tirant — sensibilité',
                                                    en: 'Aim stick while firing — sensitivity'},
            'settings.keyboard.forward':          {fr: 'Avancer',                      en: 'Move forward'},
            'settings.keyboard.backward':         {fr: 'Reculer',                      en: 'Move backward'},
            'settings.keyboard.strafeLeft':       {fr: 'Pas à gauche',                 en: 'Strafe left'},
            'settings.keyboard.strafeRight':      {fr: 'Pas à droite',                 en: 'Strafe right'},
            'settings.keyboard.jump':             {fr: 'Sauter',                       en: 'Jump'},
            'settings.keyboard.crouch':           {fr: 'S\'accroupir',                 en: 'Crouch'},
            'settings.keyboard.action':           {fr: 'Action / utiliser',            en: 'Action / use'},
            'settings.keyboard.fire':             {fr: 'Tirer',                        en: 'Fire'},
            'settings.keyboard.weaponPrev':       {fr: 'Arme précédente',              en: 'Previous weapon'},
            'settings.keyboard.weaponNext':       {fr: 'Arme suivante',                en: 'Next weapon'},
            'settings.keyboard.walkSlow':         {fr: 'Marcher lentement',            en: 'Walk slowly'},
            'settings.keyboard.toggleHud':        {fr: 'Afficher le HUD de debug',     en: 'Show the debug HUD'},
            'settings.keyboard.lookDown':         {fr: 'Fausse souris - Y+',           en: 'Fake mouse - Y+'},
            'settings.keyboard.lookUp':           {fr: 'Fausse souris - Y-',           en: 'Fake mouse - Y-'},
            'settings.keyboard.lookRight':        {fr: 'Fausse souris - X+',           en: 'Fake mouse - X+'},
            'settings.keyboard.lookLeft':         {fr: 'Fausse souris - X-',           en: 'Fake mouse - X-'}
        };
    }
}
