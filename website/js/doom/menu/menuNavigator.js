/**
 * Entry point of the menu: instantiates the display, the storage and the
 * screens, handles the navigation between them, and launches the game.
 */
class MenuNavigator {
    constructor() {
        this._display  = new MenuDisplay('screen');
        this._storage  = new WadStorage();
        this._registry = new WadRegistry(this._storage);

        this._wadListScreen     = new WadListScreen(this, this._display, this._registry);
        this._wadMenuScreen     = new WadMenuScreen(this, this._display);
        this._episodeScreen     = new EpisodeScreen(this, this._display, this._registry);
        this._difficultyScreen  = new DifficultyScreen(this, this._display);
        this._multiplayerScreen = new MultiplayerScreen(this, this._display);
        this._fallbackScreen    = new FallbackScreen(this, this._display);

        this._currentScreen      = null;
        this._selectedDifficulty = MenuNavigator.DEFAULT_SKILL;
        this._launch             = null;   // {nickname, episode, rules: the DoomGameRules class} of the multiplayer game being launched, null for single player
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
     * @param {string|null} wadName       WAD file name or title (case-insensitive, with or without ".wad")
     * @param {string|null} levelCode     level code, e.g. "E1M1" (case-insensitive)
     * @param {{position: number[], yaw: number, pitch: number}|null} spawnOverride
     * @param {number} skill   difficulty 0..5 for the direct shortcut
     */
    start(wadName = null, levelCode = null, spawnOverride = null, skill = MenuNavigator.DEFAULT_SKILL) {
        return this._boot(() => {
            if (wadName !== null) {
                this._startDirect(wadName, levelCode, spawnOverride, skill);
                return;
            }
            this.showWadList();
        });
    }

    /**
     * Starts the menu directly on the given WAD's menu (used when the pause
     * button leaves a level and when the game ends). The skill of the
     * interrupted game is carried over, so the difficulty screen of the next
     * new game preselects it.
     * @param {object} meta
     * @param {number|null} skill
     */
    startAtWadMenu(meta, skill = null) {
        this._selectedDifficulty = (skill ?? MenuNavigator.DEFAULT_SKILL);

        return this._boot(() => {
            this.openWadMenu(meta);
        });
    }

    /**
     * Starts the menu directly on the given WAD's episode screen (new game
     * from the death menu), the interrupted game's skill preselected.
     * @param {object} meta
     * @param {number|null} skill
     */
    startAtEpisodes(meta, skill = null) {
        this._selectedDifficulty = (skill ?? MenuNavigator.DEFAULT_SKILL);

        return this._boot(() => {
            this._playWadMusic(meta);
            this.openEpisodes(meta);
        });
    }

    // Shared boot: display + registry init, then the persisted settings (same
    // database) whose language reaches the translator before the first screen
    // is built, then the entry action; a storage failure falls back to the
    // degraded screen.
    _boot(onReady) {
        this._display.init();

        this._storage.getDatabase().setOnBlocked(() => this._showFallback(FallbackScreen.BLOCKED));
        this._registry.init()
            .then(() => doomSettings.init(this._storage.getDatabase()))
            .then(() => doomSaveStore.init(this._storage.getDatabase()))
            .then(() => doomSettings.applyToTranslator(appTranslator))
            .then(() => doomSound.boot())
            .then(onReady)
            .catch((error) => {
                const full = ((error instanceof WadError) && (error.getCode() === 'quota-exceeded'));
                this._showFallback(((full) ? FallbackScreen.FULL : FallbackScreen.UNAVAILABLE));
            });

        return this;
    }

    showWadList() {
        // Back to the WAD list = no WAD selected any more: its sounds go away.
        doomSound.reset();
        this._switchTo(this._wadListScreen);
    }

    // Difficulty kept for this session, preselected by the difficulty screen.
    getSelectedDifficulty() {
        return this._selectedDifficulty;
    }

    /**
     * WAD selected → its menu (new game, options, about, quit). A WAD imported
     * before the identities existed gets its own here, in the background:
     * nothing on screen waits for it.
     * @param {object} meta
     */
    openWadMenu(meta) {
        this._launch = null;
        this._playWadMusic(meta);
        this._switchTo(this._wadMenuScreen.setWad(meta));
        this._registry.ensureIdentity(meta).catch((error) => {
            console.warn('MenuNavigator - unable to compute the identity of [' + meta.name + ']: ' + error.message);
        });
    }

    // Selecting a WAD loads its sound library in the background — no modal,
    // the menu sounds become audible as decoding lands and the title music
    // starts then (the request waits for the load).
    _playWadMusic(meta) {
        doomSound.loadFromRegistry(this._registry, meta).playMenuMusic();
    }

    openMultiplayer(meta) {
        this._launch = null;
        this._switchTo(this._multiplayerScreen.setWad(meta));
    }

    /**
     * A new multiplayer game chosen on the Multiplayer screen, its checks
     * passed: the episode, the difficulty and the game settings of its mode,
     * then the first level built under the mode's rules with the lobby over it.
     *
     * @param {object}   meta
     * @param {string}   nickname
     * @param {function} rules    - the DoomGameRules class of the mode (DoomCoopRules, DoomDeathmatchRules)
     */
    openSessionEpisodes(meta, nickname, rules) {
        this._launch = {nickname: nickname, episode: null, rules: rules};
        this.openEpisodes(meta);
    }

    /**
     * The launch was cancelled from the lobby, or could not open its session:
     * back to the difficulty of the same episode, the launch still in its mode.
     *
     * @param {object}      meta
     * @param {object}      launch     - {nickname, episode, rules}
     * @param {number|null} skill
     * @param {boolean}     noIdentity - the session failed for want of the WAD's identity
     */
    startSessionAtDifficulty(meta, launch, skill, noIdentity) {
        this._selectedDifficulty = (skill ?? MenuNavigator.DEFAULT_SKILL);
        this._launch             = launch;

        return this._boot(() => {
            this._playWadMusic(meta);
            this.openDifficulty(meta, launch.episode);
            if (noIdentity) {
                MenuNetMessages.showNoIdentity(this._display);
            }
        });
    }

    // Back from the episodes: to where the launch came from.
    leaveEpisodes(meta) {
        if (this._launch !== null) {
            this.openMultiplayer(meta);
            return;
        }
        this.openWadMenu(meta);
    }

    /**
     * The WAD's SHA-256 a session checks both sides against, computed now if
     * the background pass of the WAD menu has not done it yet.
     *
     * @returns {Promise<string|null>} null when this browser cannot hash (no crypto.subtle)
     */
    async ensureWadIdentity(meta) {
        try {
            return await this._registry.ensureIdentity(meta);
        } catch (error) {
            console.warn('MenuNavigator - unable to compute the identity of [' + meta.name + ']: ' + error.message);
            return null;
        }
    }

    /**
     * New game requested → pick the episode.
     * @param {object} meta
     */
    openEpisodes(meta) {
        this._switchTo(this._episodeScreen.setWad(meta));
    }

    /**
     * Episode chosen → pick the difficulty for a new game starting on the
     * episode's first level.
     * @param {object} meta
     * @param {object} episode {episode, firstLevel, name} entry of getEpisodes
     */
    openDifficulty(meta, episode) {
        if (this._launch !== null) {
            this._launch.episode = episode;
        }
        this._switchTo(this._difficultyScreen.setWad(meta, episode));
    }

    /**
     * Difficulty chosen → convert the episode's first level and start playing.
     * @param {object} meta
     * @param {string} levelCode
     * @param {number} skill
     */
    startNewGame(meta, levelCode, skill) {
        this._selectedDifficulty = skill;
        if (this._launch === null) {
            this._launchFromWad(meta, levelCode);
            return;
        }
        // Over the difficulty screen: its Back gives up and stays there.
        new MenuOptionsModal(this._display)
            .showGameSettings(this._launch.rules.SETTING_KEYS, () => this._launchFromWad(meta, levelCode));
    }

    /**
     * Load a saved game slot: rebuild its level deterministically, then let
     * the game restore the snapshot on top (DoomGameSnapshot). Reached from
     * the WAD menu; a running game loads in place (DoomGame._loadFromSave).
     * @param {object} meta     WAD metadata
     * @param {object} saveMeta save slot metadata {wadId, slot, levelCode, …}
     */
    startFromSave(meta, saveMeta) {
        return this._boot(() => {
            this._launchFromSave(meta, saveMeta);
        });
    }

    /**
     * A sub joins the main's game on the level the main sent (levelLoad).
     *
     * @param {object}            meta
     * @param {DoomNetSubSession} session
     * @param {object}            level   - {levelCode, skill, thingFilter}
     */
    async joinSharedGame(meta, session, level) {
        const modal = new MenuModal(this._display)
            .showLoading(appTranslator.get('menu.level.loading', {level: level.levelCode, wad: WadRegistry.displayTitle(meta)}));
        try {
            const wadFile = await this._registry.getWadFile(meta.id);
            // Ended while the WAD was read: the lobby already said why.
            if (session.isEnded()) {
                modal.close();
                return;
            }
            doomSound.loadForWad(wadFile, meta.id);
            await new DoomGame(session).joinSharedGame(wadFile, meta, level);
            modal.close();
            this._closeMenus();
        } catch (error) {
            session.leave();
            this._showBuildError(error, modal, meta);
        }
    }

    // Back from a session that ended on the main's side or with the link.
    startAtWadMenuAfterSession(meta, reason) {
        return this._boot(() => {
            this.openWadMenu(meta);
            MenuNetMessages.showEnd(this._display, reason);
        });
    }

    // Back from a followed game whose level could not be built.
    startAtWadMenuAfterBuildError(meta, error) {
        return this._boot(() => {
            this.openWadMenu(meta);
            const {message, detail} = MenuNavigator._describeError(error);
            new MenuModal(this._display).showError(message, detail, () => {});
        });
    }

    // --- Internal ---

    _switchTo(screen) {
        if (this._currentScreen !== null) {
            this._currentScreen.hide();
        }
        this._currentScreen = screen;
        screen.show();
    }

    async _launchFromWad(meta, levelCode, spawnOverride = null) {
        const modal = new MenuModal(this._display)
            .showLoading(appTranslator.get('menu.level.loading', {level: levelCode, wad: WadRegistry.displayTitle(meta)}));
        await this._launchGame(meta, levelCode, spawnOverride, modal, false);
    }

    // Saved-game counterpart of _launchGame.
    async _launchFromSave(meta, saveMeta) {
        const modal = new MenuModal(this._display)
            .showLoading(appTranslator.get('menu.level.loading', {level: saveMeta.levelCode, wad: WadRegistry.displayTitle(meta)}));
        try {
            const {snapshot} = await doomSaveStore.read(saveMeta.wadId, saveMeta.slot);
            if (snapshot.formatVersion !== DoomSaveStore.FORMAT_VERSION) {
                modal.showError(appTranslator.get('menu.save.incompatible'), null, () => {
                    this.openWadMenu(meta);
                });
                return;
            }
            this._selectedDifficulty = snapshot.skill;

            const wadFile = await this._registry.getWadFile(meta.id);
            doomSound.loadForWad(wadFile, meta.id);
            const game = new DoomGame().setRestoreSnapshot(snapshot);
            await game.startFromWad(wadFile, snapshot.levelCode, meta, DoomGameSnapshot.spawnOverrideOf(snapshot), snapshot.skill);
            modal.close();
            this._closeMenus();
        } catch (error) {
            this._showBuildError(error, modal, meta);
        }
    }

    // fallbackToFirst is for the direct test shortcut only: the menu path stays
    // strict so a stale level code surfaces as an error, not the wrong level.
    async _launchGame(meta, levelCode, spawnOverride, modal, fallbackToFirst) {
        try {
            const wadFile   = await this._registry.getWadFile(meta.id);
            doomSound.loadForWad(wadFile, meta.id);
            const startCode = ((fallbackToFirst) ? this._resolveLevel(wadFile, levelCode) : levelCode);
            const game = new DoomGame();
            if (this._launch !== null) {
                const launch = this._launch;
                game.openSessionOnStart(launch.rules, launch.nickname,
                    (navigator, wadMeta, skill, noIdentity) => navigator.startSessionAtDifficulty(wadMeta, launch, skill, noIdentity));
            }
            await game.startFromWad(wadFile, startCode, meta, spawnOverride, this._selectedDifficulty);
            modal.close();
            this._closeMenus();
        } catch (error) {
            this._showBuildError(error, modal, meta);
        }
    }

    // Drops back to the WAD's menu, or to the WAD list when no WAD is known.
    _showBuildError(error, modal, meta = null) {
        console.error(error);
        loader.reset();

        const {message, detail} = MenuNavigator._describeError(error);

        // Reuse the loading modal instance (showError() closes its own overlay
        // first) instead of closing it and spawning a second one.
        modal.showError(message, detail, () => {
            if (meta !== null) {
                this.openWadMenu(meta);
                return;
            }
            this.showWadList();
        });
    }

    /**
     * @returns {{message: string, detail: string|null}} what an error modal shows of a build failure
     */
    static _describeError(error) {
        return {
            message: ((error && error.message) ? error.message : String(error)),
            detail:  ((error && error.stack) ? error.stack.split('\n').slice(0, MenuNavigator.ERROR_STACK_LINES).join('\n') : null)
        };
    }

    /**
     * Test shortcut: resolve the WAD and level from start()'s arguments and
     * launch straight into the game. An unknown WAD drops back to the WAD list;
     * the level falls back to the first one of the WAD when levelCode is unknown.
     *
     * @param {string} wadName
     * @param {string|null} levelCode
     * @param {object|null} spawnOverride
     * @param {number} skill   difficulty 0..5
     */
    async _startDirect(wadName, levelCode, spawnOverride, skill = MenuNavigator.DEFAULT_SKILL) {
        this._selectedDifficulty = skill;

        const wads = await this._registry.getList();
        const meta = this._findWad(wads, wadName);
        if (meta === null) {
            console.warn('Spipu-Doom: unknown WAD "' + wadName + '", showing the WAD list.');
            this.showWadList();
            return;
        }

        const modal = new MenuModal(this._display)
            .showLoading(appTranslator.get('menu.wad.loading', {wad: WadRegistry.displayTitle(meta)}));
        await this._launchGame(meta, levelCode, spawnOverride, modal, true);
    }

    _findWad(wads, wadName) {
        const target = MenuNavigator._withoutExtension(wadName);

        return (wads.find((meta) => ((MenuNavigator._withoutExtension(meta.name) === target)
            || (MenuNavigator._withoutExtension(WadRegistry.displayTitle(meta)) === target))) ?? null);
    }

    static _withoutExtension(name) {
        return name.toLowerCase().replace(/\.wad$/, '');
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

    _showFallback(messageCode) {
        this._switchTo(this._fallbackScreen.setMessageCode(messageCode));
    }
}

// Hurt me plenty — the skill preselected before any player choice.
MenuNavigator.DEFAULT_SKILL = 3;
// Lines of a build failure's stack shown in its error modal.
MenuNavigator.ERROR_STACK_LINES = 4;
