class DoomGame {
    /**
     * @param {DoomNetSubSession|null} subSession - the session of a sub following
     *                                               the main's game, null for a game of its own
     */
    constructor(subSession = null) {
        this._rules           = new DoomSinglePlayerRules();
        this._roster          = new DoomPlayerRoster().setLocal(new DoomPlayer(DoomGame.LOCAL_PLAYER_ID));
        this._turnEvents      = new DoomTurnEvents();
        this._role            = ((subSession !== null)
            ? new DoomSubRole(this._roster, subSession)
            : new DoomMainRole(this._roster, this._rules, this._turnEvents));
        this._presentation    = new DoomPresentation();
        this._profile         = null;
        this._itemCatalog     = null;
        this._thingCatalog    = null;
        this._monsterCatalog  = null;
        this._builtLevel      = null;
        this._skill           = DoomSimulation.DEFAULT_SKILL;
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
        this._levelExit       = null;   // {display, modal, nextLevel, finaleText, buttonCode} of the tally shown
        this._netLinks        = new DoomNetLinks();
        this._netAvailability = new DoomNetAvailability(this._netLinks);
        this._netSession      = null;   // DoomNetMainSession while the screen is shared
        this._animateCallback = this._animate.bind(this);

        this._turnEvents.addListener((event) => this._presentation.playTurnEvent(event));
        if (subSession !== null) {
            this._role.follow((event) => this._presentation.playTurnEvent(event), (level) => this._followLevel(level),
                (notice) => this._presentation.setNotice(notice), (message) => this._onMainPhase(message),
                (reason) => this._onSessionEnd(reason));
            this._presentation.setForcedRenderer(DoomGame.SESSION_RENDERER)
                .setPingSource(() => subSession.getHostPing());
        }
    }

    /**
     * A sub joins the main's game on the level the main sent. The decoded
     * images come first: the effect and decal templates are only built with them.
     *
     * @param {WadFile}     wadFile
     * @param {object|null} wadMeta - null keeps the game's, on a level change
     * @param {object}      level   - {levelCode, skill, multiplayerThings}
     */
    async joinSharedGame(wadFile, wadMeta, level) {
        await doomImageAssets.whenReady();
        this._role.prepareLevel(level);
        await this.startFromWad(wadFile, level.levelCode, wadMeta, null, level.skill);
    }

    /**
     * @returns {DoomPlayer} the player this device samples and views
     */
    _localPlayer() {
        return this._roster.getLocal();
    }

    _wadId() {
        return ((this._wadMeta !== null) ? this._wadMeta.id : null);
    }

    // --- Save / load ---

    // Restored by the next startFromWad, on top of the rebuilt level.
    setRestoreSnapshot(snapshot) {
        this._restoreSnapshot = snapshot;
        return this;
    }

    captureSnapshot() {
        return this._role.captureSnapshot(this._wadId(), this._levelCode);
    }

    // spawnOverride = {position, yaw, pitch}, debug only (see DoomMainRole.enterLevel).
    async startFromWad(wadFile, levelCode, wadMeta = null, spawnOverride = null, skill = null) {
        this._wadFile        = wadFile;
        this._profile        = new GameProfileList().getForWad(wadFile);
        this._itemCatalog    = new DoomItemCatalog(this._profile);
        this._thingCatalog   = this._profile.createThingCatalog();
        this._monsterCatalog = this._profile.createMonsterCatalog();
        // Null on a level transition: the skill carries over.
        if (skill !== null) {
            this._skill = skill;
        }
        this._role.useProfile(this._profile, this._itemCatalog, this._skill);
        this._presentation.bindProfile(this._profile, this._itemCatalog);
        this._mapInfo         = new WadMapInfo(wadFile, this._profile);
        this._dehackedStrings = new WadDehackedStrings(wadFile);
        this._levelCode       = levelCode;
        this._levelName       = this._resolveLevelName();
        this._spawnOverride   = spawnOverride;
        if (wadMeta !== null) {
            this._wadMeta = wadMeta;
        }

        // Before loader.reset() destroys the world the equipment is read from.
        for (const player of this._roster.getAll()) {
            player.packForNextLevel();
        }

        this._teardownLevel();
        loader.beginBatch();
        const onLevelExit = (secret) => {
            this._onLevelExit(secret);
        };
        this._builtLevel = await new DoomLevelLoader(this._profile, this._thingCatalog, this._monsterCatalog, this._itemCatalog)
            .load(wadFile, levelCode, {
                skill:             this._skill,
                multiplayerThings: this._role.spawnsMultiplayerThings(),
                onLevelExit:       onLevelExit,
                turnEvents:        this._turnEvents
            });
        this._role.adoptLevel(this._builtLevel, onLevelExit);

        loader.setCallback(() => {
            this._init();
        });
        loader.endBatch();
    }

    _init() {
        const world = loader.world().get();
        // Runtime spawns (puffs, projectiles) must never re-enter _init.
        loader.clearCallback();
        this._builtLevel.getEntityIds().index();

        const player   = this._localPlayer();
        const snapshot = this._restoreSnapshot;
        this._role.enterLevel(world, snapshot, this._spawnOverride);
        this._deathClockMs = 0;

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
        this._applyGameSettings();
        this._presentation.showLevel(world, this._builtLevel, this._role.getLevelStats(), player, {
            wadId:     this._wadId(),
            levelCode: this._levelCode,
            skill:     this._skill,
            levelName: this._levelName
        });

        if (snapshot !== null) {
            this._role.restoreSnapshot(snapshot);
            this._restoreSnapshot = null;
            this._presentation.getEngine().resetDeltaClock();
        }

        // A button held during the level start must not open the pause at once.
        this._pauseWasDown = true;

        this._presentation.startLevelSound(this._mapInfo.musicLumpsFor(this._levelCode));
        this._role.levelStarted({levelCode: this._levelCode, skill: this._skill, multiplayerThings: this._role.spawnsMultiplayerThings()});

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
        this._role.tickLevelClock(timestamp, !this._paused && !this._transitioning);

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

        // Frozen frame (pause, tally, a turn waiting for a player): the modal owns the inputs.
        if ((this._paused && this._role.pauseFreezes()) || this._transitioning || !this._role.isTurnReady(timestamp)) {
            this._applyGameSettings();
            this._presentation.presentFrozen();
            requestAnimationFrame(this._animateCallback);
            return;
        }

        const engine = this._presentation.getEngine();
        engine.calculateDeltaTime(timestamp);
        const dt      = engine.getDeltaTime();
        const command = this._commandSampler.collect(dt).sample();

        this._presentation.readViewToggles();
        // The automap is marked between the two halves: the world half can
        // still push the player.
        this._role.advance(dt, command, () => {
            this._trackDeath(dt);
            this._presentation.revealAutomap();
        }, timestamp);
        this._applyGameSettings();
        this._presentation.present(dt, this._isGameMenuOpen());

        requestAnimationFrame(this._animateCallback);
    }

    // Read every frame so a change from the pause options applies live; the
    // main's game rules hold for every player.
    _applyGameSettings() {
        const settings = {
            fallDamage: doomSettings.getGameFallDamage(),
            jump:       doomSettings.getGameJump(),
            crouch:     doomSettings.getGameCrouch()
        };
        for (const player of this._roster.getAll()) {
            player.applyMovementSettings(settings);
        }
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
        this._role.announcePhase({type: DoomNetProtocol.PAUSE});
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
            .setShareContext(this._shareContext())
            .setQuitCode(this._role.quitCode())
            .show(() => this._pauseTitle());
    }

    // Null without WAD metadata (the subs check the WAD identity) or when the
    // mode offers no sharing.
    _shareContext() {
        if ((this._wadMeta === null) || !this._rules.allowsScreenSharing() || !this._role.sharesScreen()) {
            return null;
        }
        return {
            getSession:        () => this._netSession,
            openSession:       (nickname) => this._openNetSession(nickname),
            stop:              () => this._stopSharing(),
            unavailableReason: () => this._netAvailability.unavailableReason()
        };
    }

    // The identity is computed by the WAD menu in the background: a WAD whose
    // hash this browser could not compute cannot be shared.
    _openNetSession(nickname) {
        if (typeof this._wadMeta.sha256 !== 'string') {
            return null;
        }
        const session = new DoomNetMainSession(this._netLinks, this._wadMeta.sha256, nickname, this._profile.maxPlayers());
        this._netSession = session;
        this._presentation.setForcedRenderer(DoomGame.SESSION_RENDERER)
            .setPingSource(() => session.getLobby().getWorstPing());

        return session;
    }

    _stopSharing(endReason = DoomNetProtocol.END_STOPPED) {
        if (this._netSession === null) {
            return;
        }
        this._role.stopHosting();
        this._netSession.stop(endReason);
        this._netSession = null;
        this._showWaiting([]);
        this._presentation.setForcedRenderer(null).setPingSource(null);
    }

    // "Waiting for …" over the frozen game, none clears it.
    _showWaiting(nicknames) {
        this._presentation.setNotice(((nicknames.length > 0) ? appTranslator.get('multiplayer.waiting', {nickname: nicknames.join(', ')}) : null));
    }

    // The main started another level: the sub builds it and joins again.
    async _followLevel(level) {
        this._transitioning = true;
        this._closeGameMenu();
        const display = new MenuDisplay('screen').init(true);
        const modal   = new MenuModal(display).showLoading(appTranslator.get('game.level.loading', {level: level.levelCode}));
        await this.joinSharedGame(this._wadFile, null, level);
        modal.close();
        display.destroy();
        this._transitioning = false;
    }

    // The main stopped, removed this sub, or the link is lost.
    _onSessionEnd(reason) {
        this._closeGameMenu();
        this._teardownLevel();
        new MenuNavigator().startAtWadMenuAfterSession(this._wadMeta, reason);
    }

    // Null without WAD metadata (direct test shortcut: saves are keyed by WAD)
    // or when the mode forbids saving.
    _saveContext() {
        if ((this._wadMeta === null) || !this._rules.allowsSaveAndLoad() || !this._role.savesGame()) {
            return null;
        }
        return {
            wadMeta:   this._wadMeta,
            buildMeta: (slot) => ({
                id:            DoomSaveStore.saveId(this._wadMeta.id, slot),
                wadId:         this._wadMeta.id,
                slot:          slot,
                levelCode:     this._levelCode,
                skill:         this._skill,
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
            if ((this._netSession !== null) && !this._netSession.isStarted()) {
                this._netSession.start();
                this._role.startHosting(this._netSession, (nicknames) => this._showWaiting(nicknames));
            }
            this._role.turnsResumed(performance.now());
            // Before the grab: a renderer changed from the pause options
            // replaces the canvas, and a lock asked on the old one fails.
            this._presentation.applyRendererSetting(false);
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
        this._stopSharing();
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
        if (this._levelExit !== null) {
            this._closeLevelExit();
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
        if ((this._deathClockMs >= DoomGame.DEATH_MENU_DELAY_MS) && this._rules.opensDeathMenu() && this._role.showsDeathMenu()) {
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
                this._leaveLevelTo((navigator, meta) => navigator.startAtEpisodes(meta, this._skill));
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
        for (const player of this._roster.getAll()) {
            player.requestRestart();
        }

        const display = new MenuDisplay('screen').init(true);
        this._startNextLevel(display, new MenuModal(display), this._levelCode);
    }

    // Carries the skill over so a new game preselects it.
    _backToMenu(endReason = DoomNetProtocol.END_STOPPED) {
        this._leaveLevelTo((navigator, meta) => navigator.startAtWadMenu(meta, this._skill), endReason);
    }

    // The game ends: so does the screen sharing, the subs told why.
    _leaveLevelTo(openMenu, endReason = DoomNetProtocol.END_STOPPED) {
        this._stopSharing(endReason);
        this._role.leave();
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
    // next level (or back to the menu after the last one). The subs show the
    // same screens, without their buttons.
    _onLevelExit(secret = false) {
        if (this._transitioning) {
            return;
        }
        this._role.announcePhase({
            type:   DoomNetProtocol.INTERMISSION,
            secret: (secret === true),
            stats:  this._role.getLevelStats().exportCounts()
        });
        this._showLevelExit(secret === true, true);
    }

    // On a sub: the main's tally, then its story text.
    _onMainPhase(message) {
        if (message.type === DoomNetProtocol.INTERMISSION) {
            this._role.getLevelStats().importCounts(message.stats);
            this._showLevelExit(message.secret, false);
            return;
        }
        this._showFinale(false);
    }

    /**
     * @param {boolean} secret
     * @param {boolean} acting - the main presses on; a sub only watches
     */
    _showLevelExit(secret, acting) {
        if (this._transitioning) {
            return;
        }
        this._transitioning = true;
        // A corpse pushed over an exit line: the exit wins over the death menu.
        this._closeGameMenu();
        // The next level's bindLevel lifts the freeze.
        doomSound.setPaused(true).playIntermissionMusic();

        // Null at the end of the game.
        const nextLevel = this._mapInfo.nextLevelCode(this._levelCode, secret);

        // A pointer-locked canvas would swallow the clicks on the tally button.
        this._inputs.releaseMouse().setVirtualPadVisible(false);

        const display = new MenuDisplay('screen').init(true);
        const modal   = new MenuModal(display);
        // Vanilla order: the story text comes after the tally.
        const finaleText = this._finaleText(secret);
        const buttonCode = ((nextLevel === null) ? 'game.tally.menu' : 'game.tally.next');
        const tallyCode  = ((finaleText !== null) ? 'game.finale.continue' : buttonCode);
        this._levelExit = {display: display, modal: modal, nextLevel: nextLevel, finaleText: finaleText, buttonCode: buttonCode};

        modal.tally(this._tallyTitle(nextLevel), this._tallyLines(), ((acting) ? appTranslator.get(tallyCode) : null), () => {
            if (finaleText === null) {
                this._startNextLevel(display, modal, nextLevel);
                return;
            }
            this._showFinale(true);
        });
    }

    // gameinfo finalemusic (D_VICTOR / D_READ_M / MUS_CPTD).
    _showFinale(acting) {
        const exit = this._levelExit;
        if ((exit === null) || (exit.finaleText === null)) {
            return;
        }
        if (acting) {
            this._role.announcePhase({type: DoomNetProtocol.FINALE});
        }
        doomSound.playFinaleMusic();
        exit.modal.finale(exit.finaleText, ((acting) ? appTranslator.get(exit.buttonCode) : null), () => {
            this._startNextLevel(exit.display, exit.modal, exit.nextLevel);
        });
    }

    _closeLevelExit() {
        this._levelExit.modal.close();
        this._levelExit.display.destroy();
        this._levelExit = null;
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
        return (this._mapInfo.levelNameFor(this._levelCode)
            ?? this._dehackedStrings.levelName(this._levelCode, this._profile.levelNameStringPrefix())
            ?? this._profile.levelNames()[this._levelCode]
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
            : (this._dehackedStrings.get(finale.code) ?? doomFinaleTexts.get(this._profile.getCode(), finale.code)));

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

        const stats = this._role.getLevelStats();

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
        this._levelExit = null;
        if (nextLevel === null) {
            this._teardownLevel();
            modal.close();
            display.destroy();
            this._transitioning = false;
            this._backToMenu(DoomNetProtocol.END_GAME_OVER);
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
DoomGame.LOCAL_PLAYER_ID = DoomPlayer.MAIN_ID;
// Every multiplayer session renders with it, whatever the display setting.
DoomGame.SESSION_RENDERER = 'webgl';
