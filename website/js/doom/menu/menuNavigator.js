/**
 * Entry point of the menu: instantiates the display, the storage and the
 * screens, handles the navigation between them, and launches the game.
 */
class MenuNavigator {
    constructor() {
        this._display  = new MenuDisplay('screen');
        this._storage  = new WadStorage();
        this._registry = new WadRegistry(this._storage);

        this._wadListScreen    = new WadListScreen(this, this._display, this._registry);
        this._wadMenuScreen    = new WadMenuScreen(this, this._display);
        this._episodeScreen    = new EpisodeScreen(this, this._display, this._registry);
        this._difficultyScreen = new DifficultyScreen(this, this._display);
        this._fallbackScreen   = new FallbackScreen(this, this._display);

        this._currentScreen      = null;
        this._selectedDifficulty = MenuNavigator.DEFAULT_SKILL;
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
     * @param {string|null} wadName       WAD name or id (case-insensitive, with or without ".wad")
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

        this._registry.init()
            .then(() => doomSettings.init(this._storage.getDatabase()))
            .then(() => doomSaveStore.init(this._storage.getDatabase()))
            .then(() => doomSettings.applyToTranslator(appTranslator))
            .then(() => doomSound.boot())
            .then(onReady)
            .catch(() => {
                this._showFallback();
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
     * WAD selected → its menu (new game, options, about, quit).
     * @param {object} meta
     */
    openWadMenu(meta) {
        this._playWadMusic(meta);
        this._switchTo(this._wadMenuScreen.setWad(meta));
    }

    // Selecting a WAD loads its sound library in the background — no modal,
    // the menu sounds become audible as decoding lands and the title music
    // starts then (the request waits for the load).
    _playWadMusic(meta) {
        doomSound.loadFromRegistry(this._registry, meta).playMenuMusic();
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
        this._launchFromWad(meta, levelCode);
    }

    /**
     * Load a saved game slot: rebuild its level deterministically, then let
     * the game restore the snapshot on top (DoomGameSnapshot). Reached from
     * the WAD menu and from the pause menu (whose level is torn down first).
     * @param {object} meta     WAD metadata
     * @param {object} saveMeta save slot metadata {wadId, slot, levelCode, …}
     */
    startFromSave(meta, saveMeta) {
        return this._boot(() => {
            this._launchFromSave(meta, saveMeta);
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
            .showLoading(appTranslator.get('menu.level.loading', {level: levelCode, wad: meta.name}));
        await this._launchGame(meta, levelCode, spawnOverride, modal, false);
    }

    // Saved-game counterpart of _launchGame. The spawn override only places the
    // player safely: the exact saved Y is re-applied after the movers.
    async _launchFromSave(meta, saveMeta) {
        const modal = new MenuModal(this._display)
            .showLoading(appTranslator.get('menu.level.loading', {level: saveMeta.levelCode, wad: meta.name}));
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
            await game.startFromWad(wadFile, snapshot.levelCode, meta, {
                position: [snapshot.player.x, snapshot.player.y + DoomGameSnapshot.SPAWN_Y_MARGIN, snapshot.player.z],
                yaw:      snapshot.player.yaw,
                pitch:    snapshot.player.pitch
            }, snapshot.skill);
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

        const message = ((error && error.message) ? error.message : String(error));
        const detail = ((error && error.stack)
            ? error.stack.split('\n').slice(0, 4).join('\n')
            : null);

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
            .showLoading(appTranslator.get('menu.wad.loading', {wad: meta.name}));
        await this._launchGame(meta, levelCode, spawnOverride, modal, true);
    }

    _findWad(wads, wadName) {
        const target = wadName.toLowerCase().replace(/\.wad$/, '');
        for (const meta of wads) {
            if ((meta.id === target) || (meta.name.toLowerCase() === wadName.toLowerCase())) {
                return meta;
            }
        }
        return null;
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

    _showFallback() {
        this._switchTo(this._fallbackScreen);
    }
}

// Hurt me plenty — the skill preselected before any player choice.
MenuNavigator.DEFAULT_SKILL = 3;
