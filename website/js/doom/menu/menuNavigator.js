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
     * Phase 1: the selected WAD/level are only memorized - the current
     * static doom game is launched. Phase 2 will use them to convert the
     * level dynamically.
     *
     * @param {object} meta
     * @param {string} levelName
     */
    startGame(meta, levelName) {
        this._selectedWad   = meta;
        this._selectedLevel = levelName;

        this._launchGame();
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

    _launchGame() {
        if (this._currentScreen !== null) {
            this._currentScreen.hide();
            this._currentScreen = null;
        }
        this._display.destroy();

        const game = new DoomGame();
        game.start();
    }

    /**
     * Degraded screen when IndexedDB is not available: the game stays playable.
     */
    _showFallback() {
        const container = document.createElement('div');
        container.className = 'doom-menu';
        this._display.getContainer().appendChild(container);

        const title = document.createElement('div');
        title.className = 'doom-menu-title';
        title.textContent = 'SpipuDoom';
        container.appendChild(title);

        const message = document.createElement('div');
        message.className = 'doom-menu-status doom-menu-error';
        message.textContent = 'Stockage navigateur indisponible — impossible de gérer les WADs.';
        container.appendChild(message);

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'doom-menu-button';
        button.textContent = 'Lancer la démo E1M1';
        button.addEventListener('click', () => {
            container.remove();
            this._launchGame();
        });
        container.appendChild(button);
    }
}
