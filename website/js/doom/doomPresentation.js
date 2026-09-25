/**
 * What one device shows of the game, seen through one player: the screen, the
 * engine and the HUD built on it, the display settings, the weapon overlay,
 * the view effects (night vision, muzzle flash, telezoom), the level's sound
 * heard from that player, and the automap lines the view reveals — the one
 * piece of simulation state it writes, as vanilla's renderer does.
 */
class DoomPresentation {
    constructor() {
        this._inputs         = null;
        this._simulation     = null;
        this._world          = null;
        this._player         = null;
        this._automap        = null;
        this._levelInfo      = null;
        this._screen         = null;
        this._engine         = null;
        this._hud            = null;
        this._rendererCode   = null;   // renderer the current engine was built on
        this._depthShadingOn = null;   // last states pushed to the engine (null = never)
        this._texSmoothingOn = null;
        this._fov            = WadConstants.PLAYER_FOV;
        this._fovUntickedMs  = 0;
        this._hudWasDown     = false;
        this._mapWasDown     = false;
    }

    bindInputs(inputs) {
        this._inputs = inputs;

        return this;
    }

    getEngine() {
        return this._engine;
    }

    /**
     * @param {DoomSimulation} simulation - its level is loaded
     * @param {DoomPlayer} player - the viewed one
     * @param {{wadId: string|null, levelCode: string, skill: int, levelName: string|null}} levelInfo
     */
    showLevel(simulation, player, levelInfo) {
        this._simulation    = simulation;
        this._world         = simulation.getWorld();
        this._player        = player;
        this._automap       = simulation.getAutomap();
        this._levelInfo     = levelInfo;
        this._fov           = WadConstants.PLAYER_FOV;
        this._fovUntickedMs = 0;
        this._buildDisplay();

        return this;
    }

    // Once the viewed player owns a weapon controller.
    showWeaponOverlay() {
        this._engine.setOverlayCallback((renderer, engine) => this._drawWeaponOverlay(renderer, engine));

        return this;
    }

    // Once the level state is final (a loaded save included).
    startLevelSound(musicLumps) {
        // Also lifts the sound freeze left by an exit modal.
        doomSound.bindLevel(this._player.getUser());
        doomSound.playLevelMusic(musicLumps);
        // Declared during the batch, wired now that the loader hands the instances out.
        const moverSounds = this._simulation.getMoverSounds();
        if (moverSounds !== null) {
            moverSounds.wireAll();
        }

        return this;
    }

    teardown() {
        if (this._screen !== null) {
            this._screen.destroyContainer();
            this._screen = null;
        }
    }

    /**
     * Builds the screen, the engine and the HUD: the objects tied to the canvas.
     * Also called on a renderer change, since a canvas keeps one context type
     * (2D or WebGL) for its whole life.
     */
    _buildDisplay() {
        this._screen = new ScreenManager('screen', {
            fullscreen: true,
            virtualWidth: DoomPresentation.VIRTUAL_WIDTH,
            virtualHeight: DoomPresentation.VIRTUAL_HEIGHT
        });

        this._inputs.bindScreen(this._screen);
        doomSettings.applyToInputs(this._inputs);
        this._inputs.setVirtualPadControlAllowed('map', this._automap !== null);

        // The wanted code, not the effective one: the list falls back to 'full'
        // when a renderer is unavailable, which would trigger a rebuild every frame.
        this._rendererCode = doomSettings.getDisplayRenderer();
        this._engine = new Engine3d(this._screen, new Object3dRendererList().getRenderer(this._rendererCode));
        // Not reset: a telezoom in progress must survive a renderer swap.
        this._applyFov();
        this._engine.setZBuffer(DoomPresentation.Z_NEAR, DoomPresentation.Z_FAR);
        // Forces every setting to be pushed onto the fresh engine.
        this._depthShadingOn = null;
        this._texSmoothingOn = null;
        this._applyDisplaySettings();

        this._hud = new HudDoom(this._engine)
            .bindUser(this._player.getUser())
            .bindInputs(this._inputs)
            .bindSimulation(this._simulation)
            .setLevelInfo(this._levelInfo.wadId, this._levelInfo.levelCode, this._levelInfo.skill, this._levelInfo.levelName)
            .addDescription('(c)2026 Spipu')
        ;
        if (this._automap !== null) {
            this._hud.bindAutomap(this._automap);
        }

        this._screen.bindHud(this._hud);

        this._engine.initFromWorld(this._world);

        // Only on a renderer swap: at level init the controller is built afterwards.
        if (this._player.getWeapon() !== null) {
            this.showWeaponOverlay();
        }
    }

    /**
     * Rebuilds the display on a renderer change, on live frames only: the menus
     * and the screen are stacked by DOM order, so a screen rebuilt under an open
     * menu would cover it. It also costs one rebuild for several changes.
     */
    _applyRendererSetting(menuOpen) {
        const wanted = doomSettings.getDisplayRenderer();
        if ((wanted === this._rendererCode) || menuOpen) {
            return;
        }
        const viewState = this._hud.getViewState();
        // Before the canvas goes: bindCanvas clears the lock flag without exiting the lock.
        this._inputs.releaseMouse();
        this._screen.destroyContainer();
        this._buildDisplay();
        this._hud.setViewState(viewState);
    }

    // The HUD mode and the automap, on a fresh press: local to this view.
    readViewToggles() {
        const hudDown = this._inputs.readButtonToggleHud();
        if (hudDown && !this._hudWasDown) {
            this._hud.toggleMode();
        }
        this._hudWasDown = hudDown;

        const mapDown = this._inputs.readButtonMap();
        if (mapDown && !this._mapWasDown) {
            this._hud.toggleAutomap();
        }
        this._mapWasDown = mapDown;
    }

    // Vanilla marks the lines from the renderer, even with the map closed.
    revealAutomap() {
        if (this._automap !== null) {
            this._automap.reveal(this._player.getUser(), this._fov / 2);
        }
    }

    /**
     * A live frame.
     *
     * @param {number} dt
     * @param {boolean} menuOpen - a menu covers the screen (the death menu runs over live frames)
     */
    present(dt, menuOpen) {
        this._updateSound(dt);
        // Before every push onto the engine, which a swap replaces.
        this._applyRendererSetting(menuOpen);
        this._applyDisplaySettings();
        this._updateTeleZoom(dt);
        this._pushEffectDisplay();
        this._draw();
    }

    // S_UpdateSounds, then the level's ambient emitters.
    _updateSound(dt) {
        doomSound.update();
        const ambientSounds = this._simulation.getAmbientSounds();
        if (ambientSounds !== null) {
            ambientSounds.update(dt);
        }
    }

    // Frozen frame (pause, tally): redrawn since a resize wipes the canvas, the settings stay live.
    presentFrozen() {
        this._applyDisplaySettings();
        this._draw();
    }

    _draw() {
        this._engine.displayWorld(this._world);
        this._screen.update();
    }

    // Read every frame so a change from the pause options applies live.
    _applyDisplaySettings() {
        this._depthShadingOn = DoomPresentation._pushSetting(
            this._depthShadingOn,
            doomSettings.getDisplayDistanceShading(),
            (on) => this._engine.setDepthShading(((on) ? WadConstants.lightDiminishParams() : null)));
        this._texSmoothingOn = DoomPresentation._pushSetting(
            this._texSmoothingOn,
            doomSettings.getDisplayTextureSmoothing(),
            (on) => this._engine.setTextureSmoothing(on));
    }

    static _pushSetting(current, wanted, apply) {
        if (wanted !== current) {
            apply(wanted);
        }
        return wanted;
    }

    // Night vision (light visor / torch) and the muzzle flash extralight.
    _pushEffectDisplay() {
        this._engine.setLightOverride(((this._player.getUser().isEffectVisible('light'))
            ? WadConstants.NIGHT_VISION_LIGHT : null));
        const weapon     = this._player.getWeapon();
        const extraLight = ((weapon !== null) ? weapon.getExtraLight() : 0);
        this._engine.setLightBoost(extraLight * WadConstants.WEAPON_FLASH_LIGHT_STEP);
    }

    // Borrowed from ZDoom (cvar telezoom): a teleport arrival widens the FOV,
    // then _updateTeleZoom eases it back.
    startTeleZoom() {
        this._fov           = Math.min(WadConstants.TELEZOOM_FOV_MAX, WadConstants.PLAYER_FOV + WadConstants.TELEZOOM_FOV_BOOST);
        this._fovUntickedMs = 0;
        this._applyFov();
    }

    // ZDoom CheckFOV, per tic.
    _updateTeleZoom(dt) {
        if (this._fov === WadConstants.PLAYER_FOV) {
            return;
        }
        const msPerTic = WadConstants.SECONDS_PER_TIC * 1000;
        this._fovUntickedMs += dt;
        while (this._fovUntickedMs >= msPerTic) {
            this._fovUntickedMs -= msPerTic;
            const diff = this._fov - WadConstants.PLAYER_FOV;
            if (Math.abs(diff) < WadConstants.TELEZOOM_STEP_MIN) {
                this._fov = WadConstants.PLAYER_FOV;
                break;
            }
            const step = Math.max(WadConstants.TELEZOOM_STEP_MIN, Math.abs(diff) * WadConstants.TELEZOOM_STEP_FACTOR);
            this._fov += ((diff > 0) ? -step : step);
        }
        this._applyFov();
    }

    // The engine's fov parameter is the half-angle of the projection.
    _applyFov() {
        this._engine.setFov(this._fov / 2);
    }

    // The 4:3 psprite layer is squeezed around the centre on a wider screen
    // (like GZDoom) rather than stretched, so asymmetric weapons stay in place.
    _drawWeaponOverlay(renderer, engine) {
        const squeeze = DoomPresentation.PSPRITE_ASPECT / this._screen.getAspectRatio();
        const alpha   = ((this._player.getUser().isEffectVisible('invisibility'))
            ? WadConstants.INVISIBILITY_WEAPON_ALPHA : 1);
        for (const sprite of this._player.getWeapon().getViewSprites()) {
            renderer.drawScreenSprite(engine, sprite.texId, 0.5 + (sprite.x - 0.5) * squeeze, sprite.y, sprite.w * squeeze, sprite.h, sprite.light, alpha);
        }
    }
}

// The 320x200 psprite canvas was authored for a 4:3 display.
DoomPresentation.PSPRITE_ASPECT = 4 / 3;
// Virtual display size, scaled to fit the real screen.
DoomPresentation.VIRTUAL_WIDTH  = 1920;
DoomPresentation.VIRTUAL_HEIGHT = 1080;
// Depth range of the projection, in world units.
DoomPresentation.Z_NEAR = 0.1;
DoomPresentation.Z_FAR  = 100;
