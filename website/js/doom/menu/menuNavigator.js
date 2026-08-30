/**
 * Entry point of the menu: instantiates the display, the storage and the
 * screens, handles the navigation between them, and launches the game.
 */
class MenuNavigator {
    constructor() {
        this._display  = new MenuDisplay('screen');
        this._storage  = new WadStorage();
        this._registry = new WadRegistry(this._storage);

        this._wadListScreen    = new WadListScreen(this, this._display, this._registry);
        this._wadMenuScreen    = new WadMenuScreen(this, this._display);
        this._episodeScreen    = new EpisodeScreen(this, this._display, this._registry);
        this._difficultyScreen = new DifficultyScreen(this, this._display);
        this._fallbackScreen   = new FallbackScreen(this, this._display);

        this._currentScreen      = null;
        this._selectedDifficulty = MenuNavigator.DEFAULT_SKILL;
    }

    /**
     * Opens the menu on the WAD list, or — for a faster test loop — launches a
     * level directly. All three arguments are optional and nested:
     *   - wadName alone: load that WAD on its first level.
     *   - wadName + levelCode: load that level; if it does not exist in the WAD,
     *     fall back to the first level.
     *   - wadName + levelCode + spawnOverride: same, and force the player to the
     *     given location instead of the WAD spawn.
     * An unknown WAD falls back to the normal WAD list.
     *
     * @param {string|null} wadName       WAD name or id (case-insensitive, with or without ".wad")
     * @param {string|null} levelCode     level name, e.g. "E1M1" (case-insensitive)
     * @param {{position: number[], yaw: number, pitch: number}|null} spawnOverride
     * @param {number} skill   difficulty 1..5 for the direct shortcut (default 3)
     */
    start(wadName = null, levelCode = null, spawnOverride = null, skill = MenuNavigator.DEFAULT_SKILL) {
        return this._boot(() => {
            if (wadName !== null) {
                this._startDirect(wadName, levelCode, spawnOverride, skill);
                return;
            }
            this.showWadList();
        });
    }

    /**
     * Starts the menu directly on the given WAD's menu (used when the pause
     * button leaves a level and when the game ends). The skill of the
     * interrupted game is carried over, so the difficulty screen of the next
     * new game preselects it.
     * @param {object} meta
     * @param {number|null} skill
     */
    startAtWadMenu(meta, skill = null) {
        this._selectedDifficulty = (skill ?? MenuNavigator.DEFAULT_SKILL);

        return this._boot(() => {
            this.openWadMenu(meta);
        });
    }

    // Shared boot: display + registry init, then the persisted settings (same
    // database) whose language reaches the translator before the first screen
    // is built, then the entry action; a storage failure falls back to the
    // degraded screen.
    _boot(onReady) {
        this._display.init();

        this._registry.init()
            .then(() => doomSettings.init(this._storage.getDatabase()))
            .then(() => doomSaveStore.init(this._storage.getDatabase()))
            .then(() => doomSettings.applyToTranslator(appTranslator))
            .then(() => doomSound.boot())
            .then(onReady)
            .catch(() => {
                this._showFallback();
            });

        return this;
    }

    showWadList() {
        // Back to the WAD list = no WAD selected any more: its sounds go away.
        doomSound.reset();
        this._switchTo(this._wadListScreen);
    }

    /**
     * Difficulty kept for this session (used by the difficulty screen to
     * preselect its entry).
     * @returns {number}
     */
    getSelectedDifficulty() {
        return this._selectedDifficulty;
    }

    /**
     * WAD selected → its menu (new game, options, about, quit).
     * @param {object} meta
     */
    openWadMenu(meta) {
        // Selecting a WAD loads its sound library in the background — no
        // modal, the menu sounds become audible as decoding lands and the
        // title music starts then (the request waits for the load).
        doomSound.loadFromRegistry(this._registry, meta).playMenuMusic();
        this._switchTo(this._wadMenuScreen.setWad(meta));
    }

    /**
     * New game requested → pick the episode.
     * @param {object} meta
     */
    openEpisodes(meta) {
        this._switchTo(this._episodeScreen.setWad(meta));
    }

    /**
     * Episode chosen → pick the difficulty for a new game starting on the
     * episode's first level.
     * @param {object} meta
     * @param {object} episode {episode, firstLevel, name} entry of getEpisodes
     */
    openDifficulty(meta, episode) {
        this._switchTo(this._difficultyScreen.setWad(meta, episode));
    }

    /**
     * Difficulty chosen → convert the episode's first level and start playing.
     * @param {object} meta
     * @param {string} levelName
     * @param {number} skill
     */
    startNewGame(meta, levelName, skill) {
        this._selectedDifficulty = skill;
        this._launchFromWad(meta, levelName);
    }

    /**
     * Load a saved game slot: rebuild its level deterministically, then let
     * the game restore the snapshot on top (DoomGameSnapshot). Reached from
     * the WAD menu and from the pause menu (whose level is torn down first).
     * @param {object} meta     WAD metadata
     * @param {object} saveMeta save slot metadata {wadId, slot, levelCode, …}
     */
    startFromSave(meta, saveMeta) {
        return this._boot(() => {
            this._launchFromSave(meta, saveMeta);
        });
    }

    // --- Internal ---

    _switchTo(screen) {
        if (this._currentScreen !== null) {
            this._currentScreen.hide();
        }
        this._currentScreen = screen;
        screen.show();
    }

    async _launchFromWad(meta, levelName, spawnOverride = null) {
        const modal = new MenuModal(this._display)
            .showLoading(appTranslator.get('menu.level.loading', {level: levelName, wad: meta.name}));
        await this._launchGame(meta, levelName, spawnOverride, modal, false);
    }

    // Saved-game counterpart of _launchGame: reads the snapshot, guards its
    // format version, then launches the saved level with the restore armed.
    // The spawn override places the player safely (the exact saved Y is
    // re-applied after the movers are restored); any failure lands on the
    // same error modal as a normal launch.
    async _launchFromSave(meta, saveMeta) {
        const modal = new MenuModal(this._display)
            .showLoading(appTranslator.get('menu.level.loading', {level: saveMeta.levelCode, wad: meta.name}));
        try {
            const {snapshot} = await doomSaveStore.read(saveMeta.wadId, saveMeta.slot);
            if (snapshot.formatVersion !== DoomSaveStore.FORMAT_VERSION) {
                modal.showError(appTranslator.get('menu.save.incompatible'), null, () => {
                    this.openWadMenu(meta);
                });
                return;
            }
            this._selectedDifficulty = snapshot.skill;

            const wadFile = await this._registry.getWadFile(meta.id);
            doomSound.loadForWad(wadFile, meta.id);
            const game = new DoomGame().setRestoreSnapshot(snapshot);
            await game.startFromWad(wadFile, snapshot.levelCode, meta, {
                position: [snapshot.player.x, snapshot.player.y + DoomGameSnapshot.SPAWN_Y_MARGIN, snapshot.player.z],
                yaw:      snapshot.player.yaw,
                pitch:    snapshot.player.pitch
            }, snapshot.skill);
            modal.close();
            this._closeMenus();
        } catch (error) {
            this._showBuildError(error, modal, meta);
        }
    }

    // Shared tail of both launch paths, with the same failure modal on any
    // error. fallbackToFirst is the direct test shortcut's behaviour (unknown
    // or null level → first one of the WAD); the menu path stays strict — a
    // stale registry name surfaces as an error instead of silently launching
    // the wrong level.
    async _launchGame(meta, levelCode, spawnOverride, modal, fallbackToFirst) {
        try {
            const wadFile   = await this._registry.getWadFile(meta.id);
            doomSound.loadForWad(wadFile, meta.id);
            const levelName = ((fallbackToFirst) ? this._resolveLevel(wadFile, levelCode) : levelCode);
            const game = new DoomGame();
            await game.startFromWad(wadFile, levelName, meta, spawnOverride, this._selectedDifficulty);
            modal.close();
            this._closeMenus();
        } catch (error) {
            this._showBuildError(error, modal, meta);
        }
    }

    // Surface a level-launch failure as a centred modal (on top of the console
    // log) so the cause is immediately visible, then drop back to the WAD's
    // menu (or to the WAD list when no WAD is known).
    _showBuildError(error, modal, meta = null) {
        console.error(error);
        loader.reset();

        const message = ((error && error.message) ? error.message : String(error));
        const detail = ((error && error.stack)
            ? error.stack.split('\n').slice(0, 4).join('\n')
            : null);

        // Reuse the loading modal instance (showError() closes its own overlay
        // first) instead of closing it and spawning a second one.
        modal.showError(message, detail, () => {
            if (meta !== null) {
                this.openWadMenu(meta);
                return;
            }
            this.showWadList();
        });
    }

    /**
     * Test shortcut: resolve the WAD and level from start()'s arguments and
     * launch straight into the game. An unknown WAD drops back to the WAD list;
     * the level falls back to the first one of the WAD when levelCode is unknown.
     *
     * @param {string} wadName
     * @param {string|null} levelCode
     * @param {object|null} spawnOverride
     * @param {number} skill   difficulty 1..5 (default 3)
     */
    async _startDirect(wadName, levelCode, spawnOverride, skill = MenuNavigator.DEFAULT_SKILL) {
        this._selectedDifficulty = skill;

        const list = await this._registry.getList();
        const meta = this._findWad(list, wadName);
        if (meta === null) {
            console.warn('Spipu-Doom: unknown WAD "' + wadName + '", showing the WAD list.');
            this.showWadList();
            return;
        }

        const modal = new MenuModal(this._display)
            .showLoading(appTranslator.get('menu.wad.loading', {wad: meta.name}));
        await this._launchGame(meta, levelCode, spawnOverride, modal, true);
    }

    /**
     * @param {object[]} list metadata list
     * @param {string} wadName
     * @returns {object|null} the matching metadata, or null
     */
    _findWad(list, wadName) {
        const target = wadName.toLowerCase().replace(/\.wad$/, '');
        for (const meta of list) {
            if ((meta.id === target) || (meta.name.toLowerCase() === wadName.toLowerCase())) {
                return meta;
            }
        }
        return null;
    }

    /**
     * @param {WadFile} wadFile
     * @param {string|null} levelCode
     * @returns {string} the requested level if it exists, otherwise the first one
     */
    _resolveLevel(wadFile, levelCode) {
        const levels = wadFile.getLevelNames();
        if (levelCode !== null) {
            for (const name of levels) {
                if (name.toLowerCase() === levelCode.toLowerCase()) {
                    return name;
                }
            }
        }
        return levels[0];
    }

    _closeMenus() {
        if (this._currentScreen !== null) {
            this._currentScreen.hide();
            this._currentScreen = null;
        }
        this._display.destroy();
    }

    _showFallback() {
        this._switchTo(this._fallbackScreen);
    }
}

// Hurt me plenty — the skill preselected before any player choice.
MenuNavigator.DEFAULT_SKILL = 3;
