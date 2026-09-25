class DoomGame {
    constructor() {
        this._roster          = new DoomPlayerRoster().setLocal(new DoomPlayer(DoomGame.LOCAL_PLAYER_ID));
        this._simulation      = new DoomSimulation(this._roster);
        this._presentation    = new DoomPresentation();
        this._inputs          = null;
        this._commandSampler  = null;
        this._wakeLock        = null;
        this._wadFile         = null;
        this._wadMeta         = null;
        this._mapInfo         = null;
        this._dehackedStrings = null;
        this._levelCode       = null;
        this._levelName       = null;
        this._spawnOverride   = null;
        this._restoreSnapshot = null;
        this._pauseWasDown    = true;
        this._running         = false;
        this._transitioning   = false;
        this._paused          = false;
        this._pauseDisplay    = null;
        this._pauseModal      = null;
        this._deathDisplay    = null;
        this._deathModal      = null;
        this._deathClockMs    = 0;
        this._animateCallback = this._animate.bind(this);

        this._simulation.setOnPlayerTeleported((user) => this._onPlayerTeleported(user));
    }

    /**
     * @returns {DoomPlayer} the player this device samples and views
     */
    _localPlayer() {
        return this._roster.getLocal();
    }

    _onPlayerTeleported(user) {
        if (user === this._localPlayer().getUser()) {
            this._presentation.startTeleZoom();
        }
    }

    _wadId() {
        return ((this._wadMeta !== null) ? this._wadMeta.id : null);
    }

    // Debug helper. The given Y is the floor-search ceiling, like the initial
    // snap in World.finalizeInit: the player drops onto the floor below it.
    _applySpawnOverride() {
        if (this._spawnOverride === null) {
            return;
        }
        const user     = this._localPlayer().getUser();
        const position = this._spawnOverride.position;
        user.x     = position[0];
        user.y     = position[1];
        user.z     = position[2];
        user.yaw   = this._spawnOverride.yaw;
        user.pitch = this._spawnOverride.pitch;
        user.syncPositionTracking();

        const floorY = this._simulation.getWorld().getCollision().getFloor(user.x, user.z, user.getRadius(), user.y);
        if (floorY !== -Infinity) {
            user.y = floorY;
        }
    }

    // --- Save / load ---

    // Restored by the next startFromWad, on top of the rebuilt level.
    setRestoreSnapshot(snapshot) {
        this._restoreSnapshot = snapshot;
        return this;
    }

    captureSnapshot() {
        return this._simulation.captureSnapshot(this._localPlayer(), this._wadId(), this._levelCode);
    }

    // spawnOverride = {position, yaw, pitch}, debug only (see _applySpawnOverride).
    async startFromWad(wadFile, levelCode, wadMeta = null, spawnOverride = null, skill = null) {
        this._wadFile = wadFile;
        this._simulation.useProfile(new GameProfileList().getForWad(wadFile));
        this._mapInfo         = new WadMapInfo(wadFile, this._simulation.getGameProfile());
        this._dehackedStrings = new WadDehackedStrings(wadFile);
        this._levelCode       = levelCode;
        this._levelName       = this._resolveLevelName();
        this._spawnOverride   = spawnOverride;
        if (wadMeta !== null) {
            this._wadMeta = wadMeta;
        }
        // Null on a level transition: the skill carries over.
        if (skill !== null) {
            this._simulation.setSkill(skill);
        }

        // Before loader.reset() destroys the world the equipment is read from.
        this._localPlayer().packForNextLevel();

        this._teardownLevel();
        loader.beginBatch();
        await this._simulation.buildLevel(wadFile, levelCode, (secret) => {
            this._onLevelExit(secret);
        });

        loader.setCallback(() => {
            this._init();
        });
        loader.endBatch();
    }

    _init() {
        const world = loader.world().get();
        // Runtime spawns (puffs, projectiles) must never re-enter _init.
        loader.clearCallback();

        const player   = this._localPlayer();
        const snapshot = this._restoreSnapshot;
        this._simulation.enterLevel(world, player, ((snapshot !== null) ? snapshot.player.state : null));
        this._deathClockMs = 0;
        this._applySpawnOverride();

        if (this._wakeLock === null) {
            this._wakeLock = new ScreenWakeLock();
            this._wakeLock.init();
        }

        // Created once: it owns the keyboard singleton.
        if (this._inputs === null) {
            this._inputs         = new Inputs();
            this._commandSampler = this._createCommandSampler(this._inputs);
            this._presentation.bindInputs(this._inputs);
        }
        this._applyGameSettings(player);
        this._presentation.showLevel(this._simulation, player, {
            wadId:     this._wadId(),
            levelCode: this._levelCode,
            skill:     this._simulation.getSkill(),
            levelName: this._levelName
        });

        this._simulation.startLevel(player);
        if (player.getWeapon() !== null) {
            this._presentation.showWeaponOverlay();
        }

        if (snapshot !== null) {
            this._simulation.applySnapshot(player, snapshot);
            this._restoreSnapshot = null;
            this._presentation.getEngine().resetDeltaClock();
        }

        // A button held during the level start must not open the pause at once.
        this._pauseWasDown = true;

        this._presentation.startLevelSound(this._mapInfo.musicLumpsFor(this._levelCode));

        this._running = true;
        requestAnimationFrame(this._animateCallback);
    }

    // The game's own controls join the engine's in every command: the
    // simulation never reads a device.
    _createCommandSampler(inputs) {
        return new InputCommandSampler(inputs)
            .addButton(DoomSimulation.BUTTON_FIRE, () => inputs.readButtonFire())
            .addButton(DoomSimulation.BUTTON_WEAPON_NEXT, () => inputs.readButtonWeaponNext())
            .addButton(DoomSimulation.BUTTON_WEAPON_PREV, () => inputs.readButtonWeaponPrev())
            .addButton(DoomSimulation.BUTTON_CHEAT_FULL_KIT, () => inputs.readButtonCheatFullKit())
            .addImpulse(DoomSimulation.IMPULSE_WEAPON_WHEEL, () => inputs.readWeaponWheel());
    }

    _animate(timestamp) {
        if (!this._running) {
            return;
        }
        this._simulation.tickLevelClock(timestamp, !this._paused && !this._transitioning);

        // Read on paused frames too, to keep the edge state.
        const pauseDown = this._inputs.readButtonPause();
        if (pauseDown && !this._pauseWasDown && !this._transitioning && (this._deathModal === null)) {
            if (this._paused) {
                // A stacked modal handles Escape itself as one step back.
                if (this._pauseModal.isAtRoot()) {
                    this._leavePause();
                }
            } else {
                this._enterPause();
            }
        }
        this._pauseWasDown = pauseDown;

        const player = this._localPlayer();
        // Frozen frame (pause, tally): the modal owns the inputs.
        if (this._paused || this._transitioning) {
            this._applyGameSettings(player);
            this._presentation.presentFrozen();
            requestAnimationFrame(this._animateCallback);
            return;
        }

        const engine = this._presentation.getEngine();
        engine.calculateDeltaTime(timestamp);
        const dt       = engine.getDeltaTime();
        const commands = new Map([[player.getId(), this._commandSampler.collect(dt).sample()]]);

        this._presentation.readViewToggles();
        this._simulation.tickPlayers(dt, commands);
        this._trackDeath(dt);
        // Between the two halves, where vanilla's renderer marks the lines:
        // the world half can still push the player.
        this._presentation.revealAutomap();
        this._simulation.tickWorld(dt, commands);
        this._applyGameSettings(player);
        this._presentation.present(dt, this._isGameMenuOpen());

        requestAnimationFrame(this._animateCallback);
    }

    // Read every frame so a change from the pause options applies live.
    _applyGameSettings(player) {
        player.applyMovementSettings({
            fallDamage: doomSettings.getGameFallDamage(),
            jump:       doomSettings.getGameJump(),
            crouch:     doomSettings.getGameCrouch()
        });
    }

    // A gamepad pause can leave the pointer lock engaged. Inputs are null
    // before the first level.
    _teardownLevel() {
        if (this._inputs !== null) {
            this._inputs.releaseMouse();
        }
        this._stopLevel();
        loader.reset();
    }

    // --- Pause menu ---

    _enterPause() {
        this._paused = true;
        doomSound.playUi('menu/activate').setPaused(true);
        this._inputs.releaseMouse().setVirtualPadVisible(false);

        this._pauseDisplay = new MenuDisplay('screen').init(true);
        this._pauseModal   = new MenuPauseModal(this._pauseDisplay)
            .setOnResume(() => this._leavePause())
            .setOnQuit(() => {
                this._leavePause(false);
                this._quitToMenu();
            })
            .setSaveContext(this._saveContext())
            .show(() => this._pauseTitle());
    }

    // Null without WAD metadata (direct test shortcut): saves are keyed by WAD.
    _saveContext() {
        if (this._wadMeta === null) {
            return null;
        }
        return {
            wadMeta:   this._wadMeta,
            buildMeta: (slot) => ({
                id:            DoomSaveStore.saveId(this._wadMeta.id, slot),
                wadId:         this._wadMeta.id,
                slot:          slot,
                levelCode:     this._levelCode,
                skill:         this._simulation.getSkill(),
                savedAt:       Date.now(),
                formatVersion: DoomSaveStore.FORMAT_VERSION,
            }),
            capture:   () => this.captureSnapshot(),
            canSave:   () => !this._localPlayer().isDead(),
            onLoad:    (saveMeta) => this._loadFromSave(saveMeta),
        };
    }

    // The browser refuses the mouse grab on an Escape resume (no user
    // activation): the player re-clicks the canvas.
    _leavePause(backToGame = true) {
        doomSound.playUi('menu/clear').setPaused(false);
        this._pauseModal.close();
        this._pauseDisplay.destroy();
        this._pauseModal   = null;
        this._pauseDisplay = null;

        this._paused       = false;
        this._pauseWasDown = true;
        this._presentation.getEngine().resetDeltaClock();
        if (backToGame) {
            this._inputs.setVirtualPadVisible(true);
            if (this._inputs.getMode() === 'keyboardMouse') {
                this._inputs.grabMouse();
            }
        }
    }

    // "{wad} — Episode {n}"; a MAPxx game is episode 1.
    _pauseTitle() {
        const episode  = (WadLevelCode.parse(this._levelCode).episode ?? 1);
        const wadTitle = ((this._wadMeta !== null) ? WadRegistry.displayTitle(this._wadMeta) : this._levelCode);

        return wadTitle + ' — ' + appTranslator.get('menu.episode.item', {episode: episode});
    }

    _quitToMenu() {
        this._teardownLevel();
        this._backToMenu();
    }

    // The running level only goes down once the save proved readable and compatible.
    async _loadFromSave(saveMeta) {
        const display = (this._pauseDisplay ?? this._deathDisplay);
        let snapshot = null;
        try {
            snapshot = (await doomSaveStore.read(saveMeta.wadId, saveMeta.slot)).snapshot;
        } catch (error) {
            console.error(error);
            new MenuModal(display).showError(appTranslator.get('menu.save.loadError'), error.message, () => {});
            return;
        }
        if (snapshot.formatVersion !== DoomSaveStore.FORMAT_VERSION) {
            new MenuModal(display).info(appTranslator.get('menu.save.incompatible'));
            return;
        }

        this._closeGameMenu();
        this._teardownLevel();
        new MenuNavigator().startFromSave(this._wadMeta, saveMeta);
    }

    // The death menu does not freeze the game: its frames run live under it.
    _isGameMenuOpen() {
        return ((this._pauseDisplay !== null) || (this._deathDisplay !== null));
    }

    _closeGameMenu() {
        if (this._pauseModal !== null) {
            this._leavePause(false);
        }
        if (this._deathModal !== null) {
            this._closeDeathMenu();
        }
    }

    // --- Death menu ---

    // The level keeps running under the death menu, like vanilla. Never during
    // a level exit: the tally owns the screen.
    _trackDeath(dt) {
        if (!this._localPlayer().isDead()) {
            this._deathClockMs = 0;
            return;
        }
        if ((this._deathModal !== null) || this._transitioning) {
            return;
        }
        this._deathClockMs += dt;
        if (this._deathClockMs >= DoomGame.DEATH_MENU_DELAY_MS) {
            this._openDeathMenu();
        }
    }

    _openDeathMenu() {
        this._inputs.releaseMouse().setVirtualPadVisible(false);

        this._deathDisplay = new MenuDisplay('screen').init(true);
        this._deathModal   = new MenuDeathModal(this._deathDisplay)
            .setOnRestart(() => this._restartLevel())
            .setOnNewGame(() => {
                this._closeDeathMenu();
                this._teardownLevel();
                this._leaveLevelTo((navigator, meta) => navigator.startAtEpisodes(meta, this._simulation.getSkill()));
            })
            .setOnQuit(() => {
                this._closeDeathMenu();
                this._quitToMenu();
            })
            .setSaveContext(this._saveContext())
            .show(() => appTranslator.get('game.death.title'));
    }

    _closeDeathMenu() {
        this._deathModal.close();
        this._deathDisplay.destroy();
        this._deathModal   = null;
        this._deathDisplay = null;
    }

    // Replays the level with the equipment it began with (the level-start
    // autosave of the modern ports).
    _restartLevel() {
        this._transitioning = true;
        this._closeDeathMenu();
        this._localPlayer().requestRestart();

        const display = new MenuDisplay('screen').init(true);
        this._startNextLevel(display, new MenuModal(display), this._levelCode);
    }

    // Carries the skill over so a new game preselects it.
    _backToMenu() {
        this._leaveLevelTo((navigator, meta) => navigator.startAtWadMenu(meta, this._simulation.getSkill()));
    }

    _leaveLevelTo(openMenu) {
        const navigator = new MenuNavigator();
        if (this._wadMeta !== null) {
            openMenu(navigator, this._wadMeta);
            return;
        }
        navigator.start();
    }

    // --- Level transition ---

    // Before loader.reset(): the running world reads its data from the loaders.
    _stopLevel() {
        this._running = false;
        doomSound.unbindLevel();
        this._presentation.teardown();
    }

    // Called by an exit line: the tally, the optional story text, then the
    // next level (or back to the menu after the last one).
    _onLevelExit(secret = false) {
        if (this._transitioning) {
            return;
        }
        this._transitioning = true;
        // A corpse pushed over an exit line: the exit wins over the death menu.
        if (this._deathModal !== null) {
            this._closeDeathMenu();
        }
        // The next level's bindLevel lifts the freeze.
        doomSound.setPaused(true).playIntermissionMusic();

        // Null at the end of the game.
        const nextLevel = this._mapInfo.nextLevelCode(this._levelCode, secret === true);

        // A pointer-locked canvas would swallow the clicks on the tally button.
        this._inputs.releaseMouse().setVirtualPadVisible(false);

        const display = new MenuDisplay('screen').init(true);
        const modal = new MenuModal(display);
        const title = this._tallyTitle(nextLevel);
        const buttonCode = ((nextLevel === null) ? 'game.tally.menu' : 'game.tally.next');

        // Vanilla order: the story text comes after the tally.
        const finaleText = this._finaleText(secret === true);
        const tallyCode  = ((finaleText !== null) ? 'game.finale.continue' : buttonCode);

        modal.tally(title, this._tallyLines(), appTranslator.get(tallyCode), () => {
            if (finaleText === null) {
                this._startNextLevel(display, modal, nextLevel);
                return;
            }
            // gameinfo finalemusic (D_VICTOR / D_READ_M / MUS_CPTD).
            doomSound.playFinaleMusic();
            modal.finale(finaleText, appTranslator.get(buttonCode), () => {
                this._startNextLevel(display, modal, nextLevel);
            });
        });
    }

    _tallyTitle(nextLevel) {
        if (nextLevel === null) {
            return appTranslator.get(((WadLevelCode.isEpisodic(this._levelCode)) ? 'game.episode.finished' : 'game.finished'));
        }
        if (this._levelName !== null) {
            return appTranslator.get('game.level.finishedNamed', {level: this._levelCode, name: this._levelName});
        }

        return appTranslator.get('game.level.finished', {level: this._levelCode});
    }

    // Vanilla precedence: UMAPINFO, the DEHACKED HUSTR replacement (Freedoom),
    // then the game's transcribed table.
    _resolveLevelName() {
        const profile = this._simulation.getGameProfile();

        return (this._mapInfo.levelNameFor(this._levelCode)
            ?? this._dehackedStrings.levelName(this._levelCode, profile.levelNameStringPrefix())
            ?? profile.levelNames()[this._levelCode]
            ?? null);
    }

    // Null when the chapter is not over. Precedence: UMAPINFO, the DEHACKED
    // replacement (Freedoom), then the game's catalog, the only translated one.
    _finaleText(secret) {
        const finale = this._mapInfo.finaleFor(this._levelCode, secret);
        if (finale === null) {
            return null;
        }
        const text = ((finale.text !== undefined)
            ? finale.text
            : (this._dehackedStrings.get(finale.code) ?? doomFinaleTexts.get(this._simulation.getGameProfile().getCode(), finale.code)));

        return ((text !== null) ? DoomFinaleTexts.reflow(text) : null);
    }

    // A score with nothing to find reads "none" instead of 0/0.
    _tallyLines() {
        const score = (code, found, total) => ({
            label: appTranslator.get(code),
            value: ((total <= 0)
                ? appTranslator.get('game.tally.none')
                : found + '/' + total + ' (' + DoomGame.formatPercent(found, total) + ')')
        });

        const stats = this._simulation;

        return [
            {label: appTranslator.get('game.tally.time'), value: DoomGame.formatDuration(stats.getLevelTimeMs())},
            score('game.tally.kills',   stats.getKillsCount(),   stats.getKillsTotal()),
            score('game.tally.items',   stats.getItemsFound(),   stats.getItemsTotal()),
            score('game.tally.secrets', stats.getSecretsFound(), stats.getSecretsTotal())
        ];
    }

    // M:SS, or H:MM:SS past the hour.
    static formatDuration(ms) {
        const total   = Math.max(0, Math.floor(ms / 1000));
        const seconds = String(total % 60).padStart(2, '0');
        const minutes = Math.floor(total / 60) % 60;
        const hours   = Math.floor(total / 3600);

        return ((hours > 0)
            ? (hours + ':' + String(minutes).padStart(2, '0') + ':' + seconds)
            : (minutes + ':' + seconds));
    }

    // Truncated like the vanilla integer division: 199/200 reads 99 %, not 100 %.
    static formatPercent(found, total) {
        const percent = Math.floor((found * 100) / total);

        return new Intl.NumberFormat(appTranslator.getLocale(), {style: 'percent', maximumFractionDigits: 0})
            .format(percent / 100);
    }

    async _startNextLevel(display, modal, nextLevel) {
        if (nextLevel === null) {
            this._teardownLevel();
            modal.close();
            display.destroy();
            this._transitioning = false;
            this._backToMenu();
            return;
        }

        modal.showLoading(appTranslator.get('game.level.loading', {level: nextLevel}));
        try {
            await this.startFromWad(this._wadFile, nextLevel);
            modal.close();
            display.destroy();
            this._transitioning = false;
        } catch (error) {
            console.error(error);
            loader.reset();
            modal.close();
            display.destroy();
            this._transitioning = false;
            this._backToMenu();
        }
    }
}

// Delay between the player's death and the death menu: the camera falls and
// the red tint settles first, and an exit fired right after the death wins.
DoomGame.DEATH_MENU_DELAY_MS = 1000;
// The main holds slot 1; a single-player game has it alone.
DoomGame.LOCAL_PLAYER_ID = 1;
