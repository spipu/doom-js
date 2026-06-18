/**
 * Entry point of the menu: instantiates the display, the storage and the
 * screens, handles the navigation between them, and launches the game.
 */
class MenuNavigator {
    constructor() {
        this._display  = new MenuDisplay('screen');
        this._storage  = new WadStorage();
        this._registry = new WadRegistry(this._storage);

        this._wadListScreen   = new WadListScreen(this, this._display, this._registry);
        this._levelListScreen = new LevelListScreen(this, this._display, this._registry);

        this._currentScreen = null;
        this._selectedWad   = null;
        this._selectedLevel = null;
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
     */
    start(wadName = null, levelCode = null, spawnOverride = null) {
        this._display.init();

        this._registry.init()
            .then(() => {
                if (wadName !== null) {
                    this._startDirect(wadName, levelCode, spawnOverride);
                    return;
                }
                this.showWadList();
            })
            .catch(() => {
                this._showFallback();
            });

        return this;
    }

    /**
     * Starts the menu directly on the level list of the given WAD
     * (used when leaving a level with the pause button).
     * @param {object} meta
     */
    startAtLevels(meta) {
        this._display.init();

        this._registry.init()
            .then(() => {
                this.openWad(meta);
            })
            .catch(() => {
                this._showFallback();
            });

        return this;
    }

    showWadList() {
        this._switchTo(this._wadListScreen);
    }

    /**
     * @param {object} meta
     */
    openWad(meta) {
        this._switchTo(this._levelListScreen.setWad(meta));
    }

    /**
     * Convert the selected level on the fly and start the game on it.
     *
     * @param {object} meta
     * @param {string} levelName
     */
    startGame(meta, levelName) {
        this._selectedWad   = meta;
        this._selectedLevel = levelName;

        this._launchFromWad(meta, levelName);
    }

    getSelectedWad() {
        return this._selectedWad;
    }

    getSelectedLevel() {
        return this._selectedLevel;
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

        try {
            const wadFile = await this._registry.getWadFile(meta.id);
            const game = new DoomGame();
            await game.startFromWad(wadFile, levelName, meta, spawnOverride);
            modal.close();
            this._closeMenus();
        } catch (error) {
            console.error(error);
            loader.reset();
            modal.close();
            if (this._currentScreen !== null) {
                this._currentScreen.showError(error);
            }
        }
    }

    /**
     * Test shortcut: resolve the WAD and level from start()'s arguments and
     * launch straight into the game. An unknown WAD drops back to the WAD list;
     * the level falls back to the first one of the WAD when levelCode is unknown.
     *
     * @param {string} wadName
     * @param {string|null} levelCode
     * @param {object|null} spawnOverride
     */
    async _startDirect(wadName, levelCode, spawnOverride) {
        const list = await this._registry.getList();
        const meta = this._findWad(list, wadName);
        if (meta === null) {
            console.warn('Spipu-Doom: unknown WAD "' + wadName + '", showing the WAD list.');
            this.showWadList();
            return;
        }

        const modal = new MenuModal(this._display)
            .showLoading('Chargement de ' + meta.name);

        try {
            const wadFile   = await this._registry.getWadFile(meta.id);
            const levelName = this._resolveLevel(wadFile, levelCode);

            this._selectedWad   = meta;
            this._selectedLevel = levelName;

            const game = new DoomGame();
            await game.startFromWad(wadFile, levelName, meta, spawnOverride);
            modal.close();
            this._closeMenus();
        } catch (error) {
            console.error(error);
            loader.reset();
            modal.close();
            this.showWadList();
        }
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

    /**
     * Degraded screen when IndexedDB is not available: no WAD can be stored,
     * the game cannot run.
     */
    _showFallback() {
        const container = document.createElement('div');
        container.className = 'doom-menu';
        this._display.getContainer().appendChild(container);

        const title = document.createElement('div');
        title.className = 'doom-menu-title';
        title.textContent = 'Spipu-Doom';
        container.appendChild(title);

        const message = document.createElement('div');
        message.className = 'doom-menu-status doom-menu-error';
        message.textContent = 'Stockage navigateur indisponible — impossible de gérer les WADs.';
        container.appendChild(message);
    }
}
