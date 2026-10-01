/**
 * The flow of a game every device shares — a level built and shown, its
 * frames, the pause and death menus, the tally and the story text, the next
 * level, the saves — driven on the role of the device (DoomMainRole simulates,
 * DoomSubRole follows) and the rules of the mode, never on which they are. The
 * session it hosts (DoomHostedSession) or follows (DoomFollowedSession) reaches
 * it through the public surface below.
 */
class DoomGame {
    /**
     * @param {DoomNetSubSession|null} subSession - the session of a sub following
     *                                               the main's game, null for a game of its own
     */
    constructor(subSession = null) {
        this._rules           = ((subSession !== null) ? DoomGameRules.forMode(subSession.getMode(), subSession.getOptions()) : new DoomSinglePlayerRules());
        this._roster          = new DoomPlayerRoster().setLocal(new DoomPlayer(((subSession !== null) ? subSession.getViewedPlayerId() : DoomGame.LOCAL_PLAYER_ID)));
        this._turnEvents      = new DoomTurnEvents();
        this._role            = ((subSession !== null)
            ? new DoomSubRole(this._roster, subSession)
            : new DoomMainRole(this._roster, this._rules, this._turnEvents));
        this._presentation    = new DoomPresentation().useRules(this._rules);
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
        this._levelExit       = null;   // {display, modal, outcome, nextLevel, finaleText, buttonCode} of the tally shown
        this._animateCallback = this._animate.bind(this);

        this._presentation.setPadControls(this._role.padControls());
        this._turnEvents.addListener((event) => this._presentation.playTurnEvent(event));
        // After the role and the presentation: both sessions reach them.
        this._hosted   = new DoomHostedSession(this);
        this._followed = ((subSession !== null) ? new DoomFollowedSession(this, subSession) : null);
    }

    // --- Surface the sessions and the menus reach ---

    getRules() {
        return this._rules;
    }

    /**
     * The mode changes during the game: cooperative opened, or back to single
     * player. A sub holds the rules of its session's mode for what it shows.
     *
     * @param {DoomGameRules} rules
     */
    setRules(rules) {
        this._rules = rules;
        this._role.useRules(rules);
        this._presentation.useRules(rules);

        return this;
    }

    getRole() {
        return this._role;
    }

    getPresentation() {
        return this._presentation;
    }

    getRoster() {
        return this._roster;
    }

    getWadMeta() {
        return this._wadMeta;
    }

    getWadFile() {
        return this._wadFile;
    }

    getProfile() {
        return this._profile;
    }

    getBuiltLevel() {
        return this._builtLevel;
    }

    getSkill() {
        return this._skill;
    }

    /**
     * A sub joins the main's game on the level the main sent.
     *
     * @param {WadFile}     wadFile
     * @param {object|null} wadMeta - null keeps the game's, on a level change
     * @param {object}      level   - {seq, levelCode, skill, thingFilter}
     */
    joinSharedGame(wadFile, wadMeta, level) {
        return this._followed.join(wadFile, wadMeta, level);
    }

    /**
     * The game starts as a multiplayer one (Multiplayer screen): see DoomHostedSession.requestStart.
     *
     * @param {function} rules    - the DoomGameRules class of the mode
     * @param {string}   nickname
     * @param {function} onCancel - (navigator, wadMeta, skill, noIdentity), the menu to go back to
     */
    openSessionOnStart(rules, nickname, onCancel) {
        this._hosted.requestStart(rules, nickname, onCancel);

        return this;
    }

    /**
     * @param {boolean} transitioning - a level change is under way: the frames freeze
     */
    setTransitioning(transitioning) {
        this._transitioning = transitioning;

        return this;
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

        this.teardownLevel();
        loader.beginBatch();
        const onLevelExit = (secret) => {
            this._onLevelExit(secret);
        };
        this._builtLevel = await new DoomLevelLoader(this._profile, this._thingCatalog, this._monsterCatalog, this._itemCatalog)
            .load(wadFile, levelCode, {
                skill:             this._skill,
                thingFilter:       this._role.thingFilter(),
                onLevelExit:       onLevelExit,
                turnEvents:        this._turnEvents
            });
        // The followed session ended during the build: the level never starts.
        if ((this._followed !== null) && this._followed.hasEnded()) {
            return;
        }
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
        this._role.levelStarted({levelCode: this._levelCode, skill: this._skill, thingFilter: this._role.thingFilter()});
        this._hosted.releaseSeats();
        // A session opened from the pause and never started: the level just
        // shown is the one its subs build (a save loaded there, a restart).
        this._hosted.startPending();

        this._running = true;
        requestAnimationFrame(this._animateCallback);
        if (this._hosted.hasStartPending()) {
            this._hosted.showStartLobby();
        }
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
        if (this._hosted.isOver()) {
            this._hosted.leaveAlone();
            return;
        }
        this._role.tickLevelClock(timestamp, !this._paused && !this._transitioning);
        this._hosted.update(timestamp);

        // Read on paused frames too, to keep the edge state.
        const pauseDown = this._inputs.readButtonPause();
        if (pauseDown && !this._pauseWasDown && !this._transitioning && (this._deathModal === null)) {
            if (this._paused) {
                // A stacked modal, or the start lobby, handles Escape itself as one step back.
                if ((this._pauseModal !== null) && this._pauseModal.isAtRoot()) {
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
        const dt = engine.getDeltaTime();
        // Collected every frame; the role samples the command when its turn needs it.
        this._commandSampler.collect(dt);

        this._presentation.readViewToggles();
        // The automap is marked between the two halves: the world half can
        // still push the player.
        this._role.advance(dt, this._commandSampler, () => {
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
        for (const player of this._roster.getInLevel()) {
            player.applyMovementSettings(settings);
        }
    }

    // A gamepad pause can leave the pointer lock engaged. Inputs are null
    // before the first level.
    teardownLevel() {
        if (this._inputs !== null) {
            this._inputs.releaseMouse();
        }
        this._stopLevel();
        loader.reset();
    }

    // --- Pause menu ---

    _enterPause() {
        this.freeze();
        this._role.announcePhase({type: DoomNetProtocol.PAUSE});
        doomSound.playUi('menu/activate');

        this._pauseDisplay = new MenuDisplay('screen').init(true);
        this._pauseModal   = new MenuPauseModal(this._pauseDisplay)
            .setOnResume(() => this._leavePause())
            .setOnQuit(() => {
                this._leavePause(false);
                this.quitToMenu();
            })
            .setSaveContext(this._saveContext())
            .setSessionContext(this._hosted.pauseContext())
            .setQuitCode(this._role.quitCode())
            .show(() => this._pauseTitle());
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

    _leavePause(backToGame = true) {
        doomSound.playUi('menu/clear');
        this._pauseModal.close();
        this._pauseDisplay.destroy();
        this._pauseModal   = null;
        this._pauseDisplay = null;
        this.unfreeze(backToGame);
    }

    // The level stops under a menu of the game: clock, turns, sound, inputs.
    freeze() {
        this._paused = true;
        this._role.setLocalPaused(true);
        doomSound.setPaused(true);
        this._inputs.releaseMouse().setVirtualPadVisible(false);
    }

    // The browser refuses the mouse grab on an Escape resume (no user
    // activation): the player re-clicks the canvas.
    unfreeze(backToGame) {
        doomSound.setPaused(false);
        this._role.setLocalPaused(false);
        this._paused       = false;
        this._pauseWasDown = true;
        this._presentation.getEngine().resetDeltaClock();
        if (!backToGame) {
            return;
        }
        this._hosted.startPending();
        this._role.turnsResumed(performance.now());
        // Before the grab: a renderer changed from the pause options
        // replaces the canvas, and a lock asked on the old one fails.
        this._presentation.applyRendererSetting(false);
        this._presentation.applyPadControls();
        this._inputs.setVirtualPadVisible(true);
        if (this._inputs.getMode() === 'keyboardMouse') {
            this._inputs.grabMouse();
        }
    }

    // "{wad} — Episode {n}"; a MAPxx game is episode 1.
    _pauseTitle() {
        const episode  = (WadLevelCode.parse(this._levelCode).episode ?? 1);
        const wadTitle = ((this._wadMeta !== null) ? WadRegistry.displayTitle(this._wadMeta) : this._levelCode);

        return wadTitle + ' — ' + appTranslator.get('menu.episode.item', {episode: episode});
    }

    quitToMenu() {
        this.teardownLevel();
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

        // In place, like a level change: a shared screen carries on, the subs follow.
        this._transitioning = true;
        this.closeGameMenu();
        this.setRestoreSnapshot(snapshot);
        const loadingDisplay = new MenuDisplay('screen').init(true);
        await this._loadLevel(loadingDisplay, new MenuModal(loadingDisplay), snapshot.levelCode,
            DoomGameSnapshot.spawnOverrideOf(snapshot), snapshot.skill);
    }

    // The death menu does not freeze the game: its frames run live under it.
    _isGameMenuOpen() {
        return ((this._pauseDisplay !== null) || (this._deathDisplay !== null) || this._hosted.isStartLobbyOpen());
    }

    closeGameMenu() {
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
            this._localNotice().setRespawnPrompt(false);
            return;
        }
        if ((this._deathModal !== null) || this._transitioning) {
            return;
        }
        this._deathClockMs += dt;
        if (this._deathClockMs < WadConstants.DEATH_SETTLE_MS) {
            return;
        }
        if (this._role.promptsRespawn()) {
            this._localNotice().setRespawnPrompt(true);
            return;
        }
        if (this._rules.opensDeathMenu() && this._role.showsDeathMenu()) {
            this._openDeathMenu();
        }
    }

    _localNotice() {
        return (this._role.getNotice() ?? this._hosted.getNotice());
    }

    _openDeathMenu() {
        this._inputs.releaseMouse().setVirtualPadVisible(false);

        this._deathDisplay = new MenuDisplay('screen').init(true);
        this._deathModal   = new MenuDeathModal(this._deathDisplay)
            .setOnRestart(() => this._restartLevel())
            .setOnNewGame(() => {
                this._closeDeathMenu();
                this.teardownLevel();
                this.leaveLevelTo((navigator, meta) => navigator.startAtEpisodes(meta, this._skill));
            })
            .setOnQuit(() => {
                this._closeDeathMenu();
                this.quitToMenu();
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
        this.leaveLevelTo((navigator, meta) => navigator.startAtWadMenu(meta, this._skill), endReason);
    }

    /**
     * The game ends: so does the session it hosts, the subs told why; a
     * followed session is left.
     *
     * @param {function(MenuNavigator, object)} openMenu  - the menu to open, with the WAD metadata
     * @param {string}                          endReason - DoomNetProtocol.END_*, told to the subs
     */
    leaveLevelTo(openMenu, endReason = DoomNetProtocol.END_STOPPED) {
        this._hosted.stop(endReason);
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
        const stats   = this._role.getLevelStats();
        const outcome = {secret: (secret === true), stats: stats.exportCounts(), players: this._tallyPlayers(stats)};
        this._role.announcePhase(Object.assign({type: DoomNetProtocol.INTERMISSION}, outcome));
        this._showLevelExit(outcome, true);
    }

    /**
     * On a sub: the main's tally, then its story text. A sub joining during
     * the story text opens the tally first, which the text replaces.
     *
     * @param {object} message - the DoomNetProtocol.INTERMISSION or FINALE control message
     */
    showMainPhase(message) {
        if (this._levelExit === null) {
            this._role.getLevelStats().importCounts(message.stats);
            this._showLevelExit(message, false);
        }
        if (message.type === DoomNetProtocol.FINALE) {
            this._showFinale(false);
        }
    }

    /**
     * @param {{secret: boolean, stats: object, players: object[]|null}} outcome     - how the level ended, its counts as the tally shows them
     * @param {boolean}                                                   withButtons - the main presses on; a sub only watches
     */
    _showLevelExit(outcome, withButtons) {
        if (this._transitioning) {
            return;
        }
        this._transitioning = true;
        // A corpse pushed over an exit line: the exit wins over the death menu and the respawn prompt.
        this.closeGameMenu();
        this._localNotice().setRespawnPrompt(false);
        // The next level's bindLevel lifts the freeze.
        doomSound.setPaused(true).playIntermissionMusic();

        // Null at the end of the game.
        const nextLevel = this._mapInfo.nextLevelCode(this._levelCode, outcome.secret);

        // A pointer-locked canvas would swallow the clicks on the tally button.
        this._inputs.releaseMouse().setVirtualPadVisible(false);

        const display = new MenuDisplay('screen').init(true);
        const modal   = new MenuModal(display);
        // Vanilla order: the story text comes after the tally.
        const finaleText = this._finaleText(outcome.secret);
        const buttonCode = ((nextLevel === null) ? 'game.tally.menu' : 'game.tally.next');
        const tallyCode  = ((finaleText !== null) ? 'game.finale.continue' : buttonCode);
        this._levelExit = {
            display:    display,
            modal:      modal,
            outcome:    outcome,
            nextLevel:  nextLevel,
            finaleText: finaleText,
            buttonCode: buttonCode
        };

        modal.tally(this._tallyTitle(nextLevel), this._tallyLines(outcome.players), ((withButtons) ? appTranslator.get(tallyCode) : null), () => {
            if (finaleText === null) {
                this._startNextLevel(display, modal, nextLevel);
                return;
            }
            this._showFinale(true);
        }, this._tallyTable(outcome.players));
    }

    // gameinfo finalemusic (D_VICTOR / D_READ_M / MUS_CPTD).
    _showFinale(withButtons) {
        const exit = this._levelExit;
        if ((exit === null) || (exit.finaleText === null)) {
            return;
        }
        if (withButtons) {
            this._role.announcePhase(Object.assign({type: DoomNetProtocol.FINALE}, exit.outcome));
        }
        doomSound.playFinaleMusic();
        exit.modal.finale(exit.finaleText, ((withButtons) ? appTranslator.get(exit.buttonCode) : null), () => {
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

    // With players of their own, the scores go to the players' table: the time stays common.
    _tallyLines(players) {
        const stats = this._role.getLevelStats();
        const time  = {label: appTranslator.get('game.tally.time'), value: DoomGame.formatDuration(stats.getLevelTimeMs())};
        if (players !== null) {
            return [time];
        }
        const counts = stats.exportCounts();

        return [time, ...DoomGame.TALLY_SCORES.map((score) => ({
            label: appTranslator.get(score.code),
            value: DoomGame._scoreText(counts[score.found], counts[score.total], true)
        }))];
    }

    _tallyTable(players) {
        if (players === null) {
            return null;
        }
        if (this._rules.scoresFrags()) {
            return this._fragTable(players);
        }
        const counts = this._role.getLevelStats().exportCounts();

        return {
            columns: players.map((player) => ({name: player.nickname, color: player.color})),
            rows:    DoomGame.TALLY_SCORES.map((score) => ({
                label:  appTranslator.get(score.code),
                values: players.map((player) => DoomGame._scoreText(player[score.found], counts[score.total], false))
            }))
        };
    }

    // WI_drawDeathmatchStats: each player's frags against each other one, then its score.
    _fragTable(players) {
        const stats = this._role.getLevelStats();

        return {
            columns: [...players.map((player) => ({name: player.nickname, color: player.color})),
                {name: appTranslator.get('game.tally.fragsTotal'), color: null}],
            rows:    players.map((killer) => ({
                label:  killer.nickname,
                color:  killer.color,
                values: [...players.map((victim) => String(stats.fragsAgainst(killer.playerId, victim.playerId))),
                    String(stats.fragScore(killer.playerId))]
            }))
        };
    }

    // The players of a cooperative or deathmatch tally: those in the level, in
    // slot order, named and coloured by the lobby. Null when the subs only watch.
    _tallyPlayers(stats) {
        const session = this._hosted.getSession();
        if (!this._rules.admitsSubPlayers() || (session === null)) {
            return null;
        }
        const lobby = session.getLobby();
        const ids   = this._roster.getInLevel().map((player) => player.getId()).sort((a, b) => (a - b));

        return stats.playerCounts(ids).map((counts) => {
            const entry = lobby.getPlayerInSlot(counts.playerId);

            return Object.assign({
                nickname: ((entry !== null) ? entry.nickname : ''),
                color:    ((entry !== null) ? entry.color : null)
            }, counts);
        });
    }

    // A score with nothing to find reads "none" instead of 0/0; a player's
    // column leaves out the level total, its percentage being of that total.
    static _scoreText(found, total, withTotal) {
        if (total <= 0) {
            return appTranslator.get('game.tally.none');
        }
        const percent = ' (' + DoomGame.formatPercent(found, total) + ')';

        return ((withTotal) ? (found + '/' + total + percent) : (found + percent));
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
            this.teardownLevel();
            modal.close();
            display.destroy();
            this._transitioning = false;
            this._backToMenu(this._rules.endOfGameReason());
            return;
        }

        await this._loadLevel(display, modal, nextLevel);
    }

    // The next level, the same one again or a save's, in this game: a failed
    // build leaves for the menu.
    async _loadLevel(display, modal, levelCode, spawnOverride = null, skill = null) {
        modal.showLoading(appTranslator.get('game.level.loading', {level: levelCode}));
        try {
            await this.startFromWad(this._wadFile, levelCode, null, spawnOverride, skill);
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

DoomGame.LOCAL_PLAYER_ID = DoomPlayer.MAIN_ID;
// Every multiplayer session renders with it, whatever the display setting.
DoomGame.SESSION_RENDERER = 'webgl';
// The tally's score rows: `found` keys the level's and each player's counts, `total` the level's total.
DoomGame.TALLY_SCORES = [
    {code: 'game.tally.kills',   found: 'kills',   total: 'killsTotal'},
    {code: 'game.tally.items',   found: 'items',   total: 'itemsTotal'},
    {code: 'game.tally.secrets', found: 'secrets', total: 'secretsTotal'}
];
