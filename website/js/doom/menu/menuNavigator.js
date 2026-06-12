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

    start() {
        this._display.init();

        this._registry.init()
            .then(() => {
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

    async _launchFromWad(meta, levelName) {
        const modal = new MenuModal(this._display)
            .showLoading('Chargement du niveau ' + levelName + ' de ' + meta.name);

        try {
            const wadFile = await this._registry.getWadFile(meta.id);
            const game = new DoomGame();
            await game.startFromWad(wadFile, levelName, meta);
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
