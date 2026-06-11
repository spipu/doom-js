class DoomGame {
    constructor() {
        this._engine   = null;
        this._world    = null;
        this._screen   = null;
        this._hud      = null;
        this._mouse    = null;
        this._keyboard = null;
        this._wakeLock = null;
        this._wadFile   = null;
        this._levelName = null;
        this._running       = false;
        this._transitioning = false;
        this._animateCallback = this._animate.bind(this);
    }

    // Convert a WAD level on the fly and start the game on it (no URL, no fetch)
    async startFromWad(wadFile, levelName) {
        this._wadFile   = wadFile;
        this._levelName = levelName;

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

        // InputKeyboard is a strict singleton — created once, reused across levels
        if (this._keyboard === null) {
            this._keyboard = new InputKeyboard();
        }
        this._mouse = new InputMouse(this._screen.getCanvas());

        this._engine = new Engine3d(this._screen, new Object3dRendererList().getRenderer('webgl'));
        this._engine.setFov(45.0);
        this._engine.setZBuffer(0.1, 100);

        this._hud = new HudDebug(this._engine)
            .bindUser(this._world.getUser())
            .addDescription(() => appBootstrap.getStatsText())
            .addDescription('(c)2026 Spipu')
        ;

        this._screen.bindHud(this._hud);

        this._engine.initFromWorld(this._world);

        this._running = true;
        requestAnimationFrame(this._animateCallback);
    }

    _animate(timestamp) {
        if (!this._running) {
            return;
        }

        this._engine.calculateDeltaTime(timestamp);
        this._world.update(this._engine.getDeltaTime(), this._keyboard, this._mouse);
        this._engine.displayWorld(this._world);
        this._screen.update();

        requestAnimationFrame(this._animateCallback);
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
