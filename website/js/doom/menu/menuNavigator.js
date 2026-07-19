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
        this._difficultyScreen = new DifficultyScreen(this, this._display);
        this._levelListScreen  = new LevelListScreen(this, this._display, this._registry);
        this._fallbackScreen   = new FallbackScreen(this, this._display);

        this._currentScreen      = null;
        this._selectedDifficulty = 3;
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
    start(wadName = null, levelCode = null, spawnOverride = null, skill = 3) {
        return this._boot(() => {
            if (wadName !== null) {
                this._startDirect(wadName, levelCode, spawnOverride, skill);
                return;
            }
            this.showWadList();
        });
    }

    /**
     * Starts the menu directly on the level list of the given WAD
     * (used when leaving a level with the pause button). The difficulty already
     * chosen for this session is kept, so this skips the difficulty screen.
     * @param {object} meta
     */
    startAtLevels(meta) {
        return this._boot(() => {
            this._switchTo(this._levelListScreen.setWad(meta));
        });
    }

    // Shared boot: display + registry init, then the persisted settings (same
    // database), then the entry action; a storage failure falls back to the
    // degraded screen.
    _boot(onReady) {
        this._display.init();

        this._registry.init()
            .then(() => doomSettings.init(this._storage.getDatabase()))
            .then(onReady)
            .catch(() => {
                this._showFallback();
            });

        return this;
    }

    showWadList() {
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
     * WAD selected → pick the difficulty before the level list.
     * @param {object} meta
     */
    openWad(meta) {
        this._switchTo(this._difficultyScreen.setWad(meta));
    }

    /**
     * Difficulty selected → go to the level list (keeps the chosen skill).
     * @param {object} meta
     * @param {number} skill
     */
    openLevels(meta, skill) {
        this._selectedDifficulty = skill;
        this._switchTo(this._levelListScreen.setWad(meta));
    }

    /**
     * Convert the selected level on the fly and start the game on it.
     *
     * @param {object} meta
     * @param {string} levelName
     */
    startGame(meta, levelName) {
        this._launchFromWad(meta, levelName);
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
            .showLoading('Chargement du niveau ' + levelName + ' de ' + meta.name);
        await this._launchGame(meta, levelName, spawnOverride, modal, false);
    }

    // Shared tail of both launch paths, with the same failure modal on any
    // error. fallbackToFirst is the direct test shortcut's behaviour (unknown
    // or null level → first one of the WAD); the menu path stays strict — a
    // stale registry name surfaces as an error instead of silently launching
    // the wrong level.
    async _launchGame(meta, levelCode, spawnOverride, modal, fallbackToFirst) {
        try {
            const wadFile   = await this._registry.getWadFile(meta.id);
            const levelName = ((fallbackToFirst) ? this._resolveLevel(wadFile, levelCode) : levelCode);
            const game = new DoomGame();
            await game.startFromWad(wadFile, levelName, meta, spawnOverride, this._selectedDifficulty);
            modal.close();
            this._closeMenus();
        } catch (error) {
            this._showBuildError(error, modal);
        }
    }

    // Surface a level-launch failure as a centred modal (on top of the console
    // log) so the cause is immediately visible, then drop back to the WAD list.
    _showBuildError(error, modal) {
        console.error(error);
        loader.reset();

        const message = ((error && error.message) ? error.message : String(error));
        const detail = ((error && error.stack)
            ? error.stack.split('\n').slice(0, 4).join('\n')
            : null);

        // Reuse the loading modal instance (showError() closes its own overlay
        // first) instead of closing it and spawning a second one.
        modal.showError(message, detail, () => {
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
    async _startDirect(wadName, levelCode, spawnOverride, skill = 3) {
        this._selectedDifficulty = skill;

        const list = await this._registry.getList();
        const meta = this._findWad(list, wadName);
        if (meta === null) {
            console.warn('Spipu-Doom: unknown WAD "' + wadName + '", showing the WAD list.');
            this.showWadList();
            return;
        }

        const modal = new MenuModal(this._display)
            .showLoading('Chargement de ' + meta.name);
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
