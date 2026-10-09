/**
 * A game that follows another device's session (a sub), seen from that game:
 * it builds each level the main sends — one build at a time, the last level
 * sent winning —, hands the main's phases to the game, switches the viewed
 * player when the main changes the session's mode, and takes the game back to
 * the WAD menu when the session ends — once the build is over, when the end
 * comes during one, or at once otherwise. DoomGame holds one when it was
 * created for a session, and reaches the game through its public surface alone.
 */
class DoomFollowedSession {
    /**
     * @param {DoomGame}          game
     * @param {DoomNetSubSession} session
     */
    constructor(game, session) {
        this._game         = game;
        this._session      = session;
        this._joining      = false;  // a level the main sent is being built
        this._pendingLevel = null;   // the level the main sent meanwhile, built next
        this._endReason    = null;   // DoomNetProtocol.END_* once the session ended
        game.getRole().follow((event) => game.getPresentation().playTurnEvent(event), (level) => this._followLevel(level),
            (notice) => game.getPresentation().setNotice(notice), (message) => game.showMainPhase(message),
            (reason) => this._onEnd(reason), () => this._onModeChange());
        game.getPresentation().setForcedRenderer(DoomGame.SESSION_RENDERER)
            .setPingSource(() => session.getHostPing());
    }

    // The session ended: no level of it starts any more.
    hasEnded() {
        return (this._endReason !== null);
    }

    /**
     * The game joins the main's on the level the main sent. The decoded images
     * come first: the effect and decal templates are only built with them.
     *
     * @param {WadFile}     wadFile
     * @param {object|null} wadMeta - null keeps the game's, on a level change
     * @param {object}      level   - {seq, levelCode, skill, thingFilter, waterEffects}
     */
    async join(wadFile, wadMeta, level) {
        this._joining = true;
        try {
            await doomImageAssets.whenReady();
            this._game.getRole().prepareLevel(level);
            await this._game.startFromWad(wadFile, level.levelCode, wadMeta, null, level.skill);
        } finally {
            this._joining = false;
        }
        // What the session told meanwhile, handled once the build is over.
        if (this._endReason !== null) {
            this._leaveEndedSession();
            return;
        }
        if (this._pendingLevel !== null) {
            const pending = this._pendingLevel;
            this._pendingLevel = null;
            await this._followLevel(pending);
        }
    }

    // The main started another level: the game builds it and joins again. A
    // level sent while one is being built waits for that build; the last one
    // sent wins. A failed build leaves the session for the menu.
    async _followLevel(level) {
        if (this._joining) {
            this._pendingLevel = level;
            return;
        }
        const game = this._game;
        game.setTransitioning(true);
        game.closeGameMenu();
        const display = new MenuDisplay('screen').init(true);
        const modal   = new MenuModal(display).showLoading(appTranslator.get('game.level.loading', {level: level.levelCode}));
        try {
            await this.join(game.getWadFile(), null, level);
            modal.close();
            display.destroy();
            game.setTransitioning(false);
        } catch (error) {
            console.error(error);
            modal.close();
            display.destroy();
            game.setTransitioning(false);
            this._leaveFailedBuild(error);
        }
    }

    // The session may have ended during the failed build: that end wins.
    _leaveFailedBuild(error) {
        this._pendingLevel = null;
        if (this._endReason !== null) {
            this._leaveEndedSession();
            return;
        }
        this._game.teardownLevel();
        this._game.leaveLevelTo((navigator, meta) => navigator.startAtWadMenuAfterBuildError(meta, error));
    }

    // The main stopped, removed this sub, or the link is lost. During a level
    // build, the build's end handles it: a teardown now would leave the build
    // starting a game over the menu.
    _onEnd(reason) {
        this._endReason = reason;
        if (!this._joining) {
            this._leaveEndedSession();
        }
    }

    // A viewer becomes a player: it views its own player from now on, on the
    // same body, and plays with the full pad.
    _onModeChange() {
        const game = this._game;
        game.setRules(DoomGameRules.forMode(this._session.getMode(), this._session.getOptions()));
        const viewedId = this._session.getViewedPlayerId();
        const current  = game.getRoster().getLocal();
        if (current.getId() !== viewedId) {
            const player = new DoomPlayer(viewedId);
            if (current.getUser() !== null) {
                player.enterLevel(current.getUser());
            }
            game.getRoster().replaceLocal(player);
            game.getPresentation().setViewedPlayer(player);
        }
        game.getPresentation().changePadControls(game.getRole().padControls());
    }

    _leaveEndedSession() {
        this._game.closeGameMenu();
        this._game.teardownLevel();
        new MenuNavigator().startAtWadMenuAfterSession(this._game.getWadMeta(), this._endReason);
    }
}
