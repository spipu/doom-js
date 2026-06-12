class DoomGame {
    constructor() {
        this._engine   = null;
        this._world    = null;
        this._screen   = null;
        this._hud      = null;
        this._inputs   = null;
        this._wakeLock = null;
        this._wadFile   = null;
        this._wadMeta   = null;
        this._levelName = null;
        this._pauseWasDown = true;
        this._running       = false;
        this._transitioning = false;
        this._animateCallback = this._animate.bind(this);
    }

    // Convert a WAD level on the fly and start the game on it (no URL, no fetch).
    // wadMeta is given on the first launch by the menu and kept across levels —
    // it allows the pause button to go back to the level list of the WAD.
    async startFromWad(wadFile, levelName, wadMeta = null) {
        this._wadFile   = wadFile;
        this._levelName = levelName;
        if (wadMeta !== null) {
            this._wadMeta = wadMeta;
        }

        this._stopLevel();
        loader.reset();
        loader.beginBatch();
        await new WadWorldBuilder(wadFile, levelName, {
            onLevelExit: () => {
                this._onLevelExit();
            }
        }).build();
        loader.setCallback(() => {
            appBootstrap.askStats();
            this._init();
        });
        loader.endBatch();
    }

    _init() {
        this._world = loader.world().get();

        if (this._wakeLock === null) {
            this._wakeLock = new ScreenWakeLock();
            this._wakeLock.init();
        }

        this._screen = new ScreenManager('screen', {
            fullscreen: true,
            virtualWidth: 1920,
            virtualHeight: 1080
        });

        // Inputs owns the keyboard singleton — created once, reused across levels
        if (this._inputs === null) {
            this._inputs = new Inputs();
        }
        // The devices are re-bound to the new screen on each level
        this._inputs.bindScreen(this._screen);

        this._engine = new Engine3d(this._screen, new Object3dRendererList().getRenderer('webgl'));
        this._engine.setFov(45.0);
        this._engine.setZBuffer(0.1, 100);

        this._hud = new HudDebug(this._engine)
            .bindUser(this._world.getUser())
            .bindInputs(this._inputs)
            .addDescription(() => appBootstrap.getStatsText())
            .addDescription('(c)2026 Spipu')
        ;

        this._screen.bindHud(this._hud);

        this._engine.initFromWorld(this._world);

        // Require a release before the first press (a button held during the
        // level start must not immediately quit it)
        this._pauseWasDown = true;

        this._running = true;
        requestAnimationFrame(this._animateCallback);
    }

    _animate(timestamp) {
        if (!this._running) {
            return;
        }

        // Pause button (press edge): leave the level, back to the level list
        const pauseDown = this._inputs.readButtonPause();
        if (pauseDown && !this._pauseWasDown && !this._transitioning) {
            this._pauseWasDown = pauseDown;
            this._quitToLevelList();
            return;
        }
        this._pauseWasDown = pauseDown;

        this._engine.calculateDeltaTime(timestamp);
        this._world.update(this._engine.getDeltaTime(), this._inputs);
        this._engine.displayWorld(this._world);
        this._screen.update();

        requestAnimationFrame(this._animateCallback);
    }

    // Leave the current level and go back to the level list of the WAD
    _quitToLevelList() {
        this._stopLevel();
        loader.reset();
        const navigator = new MenuNavigator();
        if (this._wadMeta !== null) {
            navigator.startAtLevels(this._wadMeta);
            return;
        }
        navigator.start();
    }

    // --- Level transition ---

    // Stop the animation loop and remove the screen — must be done before
    // loader.reset(), the running world reads its data from the loaders
    _stopLevel() {
        this._running = false;
        if (this._screen !== null) {
            this._screen.destroyContainer();
            this._screen = null;
        }
    }

    /**
     * Called by the exit switch interaction: level finished modal, then after
     * 2 seconds, loading modal + next level (or back to the menu after the
     * last level of the WAD).
     */
    _onLevelExit() {
        if (this._transitioning) {
            return;
        }
        this._transitioning = true;

        const levels = this._wadFile.getLevelNames();
        const index = levels.indexOf(this._levelName);
        const nextLevel = ((index >= 0 && index + 1 < levels.length) ? levels[index + 1] : null);

        const display = new MenuDisplay('screen').init();
        const modal = new MenuModal(display);
        modal.showMessage('Niveau ' + this._levelName + ' terminé !');

        setTimeout(() => {
            this._startNextLevel(display, modal, nextLevel);
        }, 2000);
    }

    async _startNextLevel(display, modal, nextLevel) {
        if (nextLevel === null) {
            // Last level of the WAD → back to the menu
            this._stopLevel();
            loader.reset();
            modal.close();
            display.destroy();
            this._transitioning = false;
            new MenuNavigator().start();
            return;
        }

        modal.showLoading('Chargement du niveau ' + nextLevel);
        await this.startFromWad(this._wadFile, nextLevel);
        modal.close();
        display.destroy();
        this._transitioning = false;
    }
}
