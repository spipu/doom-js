class DoomGame {
    constructor() {
        this._engine   = null;
        this._world    = null;
        this._screen   = null;
        this._hud      = null;
        this._mouse    = null;
        this._keyboard = null;
        this._wakeLock = null;
        this._animateCallback = this._animate.bind(this);
    }

    // Convert a WAD level on the fly and start the game on it (no URL, no fetch)
    async startFromWad(wadFile, levelName) {
        loader.reset();
        loader.beginBatch();
        await new WadWorldBuilder(wadFile, levelName).build();
        loader.setCallback(() => {
            appBootstrap.askStats();
            this._init();
        });
        loader.endBatch();
    }

    _init() {
        this._world = loader.world().get();

        this._wakeLock = new ScreenWakeLock();
        this._wakeLock.init();

        this._screen = new ScreenManager('screen', {
            fullscreen: true,
            virtualWidth: 1920,
            virtualHeight: 1080
        });

        this._keyboard = new InputKeyboard();
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

        requestAnimationFrame(this._animateCallback);
    }

    _animate(timestamp) {
        this._engine.calculateDeltaTime(timestamp);
        this._world.update(this._engine.getDeltaTime(), this._keyboard, this._mouse);
        this._engine.displayWorld(this._world);
        this._screen.update();

        requestAnimationFrame(this._animateCallback);
    }
}
