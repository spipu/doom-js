/**
 * The session a game hosts for other devices — screen sharing, cooperative,
 * deathmatch — seen from the main: opened from the pause menu, or from the
 * Multiplayer screen over the frozen first level in its lobby; its mode
 * changes, its stop, the seats kept for lost players, the message shown over
 * the game, and the end of a game the rules finish once the main is alone.
 * DoomGame holds one for its whole length — a single-player game hosts no
 * session until asked — and reaches it at the right moments of its flow; it
 * reaches the game back through its public surface alone.
 */
class DoomHostedSession {
    /**
     * @param {DoomGame} game
     */
    constructor(game) {
        this._game         = game;
        this._links        = new DoomNetLinks();
        this._availability = new DoomNetAvailability(this._links);
        this._session      = null;   // DoomNetMainSession while a session is open
        this._notice       = new DoomSessionNotice().setOnNotice((text) => game.getPresentation().setNotice(text));
        this._start        = null;   // {nickname, mode, onCancel} of a game started from the Multiplayer screen
        this._startDisplay = null;
        this._startLobby   = null;   // its lobby, over the frozen first level until Start
        this._aloneOver    = false;  // every opponent gone: the game leaves on its next frame
    }

    /**
     * @returns {DoomNetMainSession|null}
     */
    getSession() {
        return this._session;
    }

    // The main's own message over the game (who it waits for, the players' news).
    getNotice() {
        return this._notice;
    }

    // Called every frame: the news of a player runs out.
    update(now) {
        this._notice.update(now);
    }

    // --- Pause menu ---

    /**
     * @returns {object|null} what the pause's Multiplayer entry drives; null without
     *          WAD metadata (the subs check the WAD identity) or on a device that only follows the game
     */
    pauseContext() {
        const game = this._game;
        if ((game.getWadMeta() === null) || !game.getRole().hostsSessions()) {
            return null;
        }

        return {
            getSession:          () => this._session,
            offersScreenSharing: () => game.getRules().allowsScreenSharing(),
            offersCooperative:   () => game.getRules().allowsCooperative(),
            admitsSubPlayers:    () => game.getRules().admitsSubPlayers(),
            openScreenSharing:   (nickname) => this._open(nickname, DoomNetProtocol.MODE_SCREEN_SHARING, {}),
            openCooperative:     (nickname) => this._openCooperative(nickname),
            switchToCooperative: () => this._switchToCooperative(),
            stop:                () => this._stopFromPause(),
            stopCodes:           () => game.getRules().sessionStopCodes(),
            unavailableReason:   () => this._availability.unavailableReason()
        };
    }

    // The identity is computed by the WAD menu in the background: a WAD whose
    // hash this browser could not compute cannot be shared.
    _open(nickname, mode, options) {
        const game    = this._game;
        const wadMeta = game.getWadMeta();
        if (typeof wadMeta.sha256 !== 'string') {
            return null;
        }
        const session = new DoomNetMainSession({
            links:     this._links,
            wadSha256: wadMeta.sha256,
            wadLabel:  WadRegistry.displayLabel(wadMeta),
            wadTitle:  (wadMeta.title ?? ''),
            nickname:  nickname,
            capacity:  game.getProfile().maxPlayers(),
            mode:      mode,
            options:   options,
            colors:    game.getBuiltLevel().getPlayerColors()
        })
            .setOnPlayerRemoved((removedNickname) => this._onPlayerRemoved(removedNickname))
            .setOnPlayerAway((awayNickname, away) => this._notice.awayChanged(awayNickname, away, performance.now()))
            .setOnSeatReleased((slot) => game.getRole().releaseSeat(slot));
        this._session = session;
        game.getPresentation().setForcedRenderer(DoomGame.SESSION_RENDERER)
            .setPingSource(() => session.getLobby().getWorstPing());

        return session;
    }

    _openCooperative(nickname) {
        const rules   = DoomCoopRules.fromSettings();
        const session = this._open(nickname, DoomCoopRules.MODE, rules.getOptions());
        if (session !== null) {
            this._game.setRules(rules);
        }

        return session;
    }

    // The viewers already linked become players: their commands give them one from the next turn.
    _switchToCooperative() {
        const rules = DoomCoopRules.fromSettings();
        this._game.setRules(rules);
        this._session.setMode(DoomCoopRules.MODE, rules.getOptions());
    }

    // A session the rules end once alone takes the main's game with it: the
    // match is over for everyone. Otherwise the main plays on alone.
    _stopFromPause() {
        if (!this._game.getRules().endsWhenAlone()) {
            this.stop();
            return true;
        }
        this._game.closeGameMenu();
        this._game.quitToMenu();

        return false;
    }

    /**
     * Ends the session, the subs told why; the game goes on alone under the
     * single-player rules. Nothing happens without a session.
     *
     * @param {string} endReason - DoomNetProtocol.END_*
     */
    stop(endReason = DoomNetProtocol.END_STOPPED) {
        if (this._session === null) {
            return;
        }
        this._game.getRole().stopHosting();
        this._session.stop(endReason);
        this._session = null;
        this._game.setRules(new DoomSinglePlayerRules());
        this._notice.clear();
        this._game.getPresentation().setForcedRenderer(null).setPingSource(null);
    }

    // --- Players coming and going ---

    _onPlayerRemoved(nickname) {
        this._notice.departed(nickname, performance.now());
        this._checkAlone();
    }

    // A game the rules end once alone leaves on the next frame: the departure
    // may be heard in the middle of one (a sub dropped for its silence). A
    // seat kept for a lost player keeps the game going until it is released.
    _checkAlone() {
        const lobby = this._session.getLobby();
        if (this._game.getRules().endsWhenAlone() && this._session.isStarted() && (lobby.getPlayers().length <= 1) && !lobby.hasReservations()) {
            this._aloneOver = true;
        }
    }

    // The seats kept for lost players last the level they were left in.
    releaseSeats() {
        if (this._session === null) {
            return;
        }
        this._session.releaseSeats();
        this._checkAlone();
    }

    // Whether every opponent is gone and the game must leave.
    isOver() {
        return this._aloneOver;
    }

    // The game leaves for the WAD menu: the match is over.
    leaveAlone() {
        this._aloneOver = false;
        this._game.closeGameMenu();
        this._game.teardownLevel();
        this._game.leaveLevelTo((navigator, meta) => navigator.startAtWadMenuAfterSession(meta, DoomNetProtocol.END_MATCH_OVER),
            DoomNetProtocol.END_MATCH_OVER);
    }

    // --- A game started from the Multiplayer screen ---

    /**
     * The game starts as a multiplayer one: its first level is built under the
     * rules of its mode, on the game settings as stored now, then shows frozen
     * under the lobby until Start. Back there cancels the start.
     *
     * @param {function} rules    - the DoomGameRules class of the mode (DoomCoopRules, DoomDeathmatchRules)
     * @param {string}   nickname
     * @param {function} onCancel - (navigator, wadMeta, skill, noIdentity), the menu to go back to
     */
    requestStart(rules, nickname, onCancel) {
        this._game.setRules(rules.fromSettings());
        this._start = {nickname: nickname, mode: rules.MODE, onCancel: onCancel};
    }

    hasStartPending() {
        return (this._start !== null);
    }

    // The start lobby covers the game like a pause menu.
    isStartLobbyOpen() {
        return (this._startDisplay !== null);
    }

    // Once the first level is shown.
    showStartLobby() {
        const session = this._open(this._start.nickname, this._start.mode, this._game.getRules().getOptions());
        if (session === null) {
            this._cancelStart(true);
            return;
        }
        this._game.freeze();
        this._startDisplay = new MenuDisplay('screen').init(true);
        this._startLobby   = new MenuLobbyModal(this._startDisplay).openMain(session, {
            start: () => this._startFromLobby(),
            back:  () => this._backFromStartLobby()
        });
    }

    _startFromLobby() {
        this._closeStartLobby();
        this._game.unfreeze(true);
    }

    // Players already there are disconnected: they are asked for first.
    _backFromStartLobby() {
        if (this._session.getLobby().getPlayers().length <= 1) {
            this._cancelStart();
            return;
        }
        new MenuModal(this._startDisplay).confirm(appTranslator.get(this._game.getRules().sessionStopCodes().confirm), () => this._cancelStart());
    }

    // Without the WAD's identity no session opens: the menu says why.
    _cancelStart(noIdentity = false) {
        const start = this._start;
        this._closeStartLobby();
        doomSound.setPaused(false);
        this._game.teardownLevel();
        this._game.leaveLevelTo((navigator, meta) => start.onCancel(navigator, meta, this._game.getSkill(), noIdentity));
    }

    _closeStartLobby() {
        if (this._startLobby !== null) {
            this._startLobby.setOnClose(null).close();
            this._startDisplay.destroy();
        }
        this._startLobby   = null;
        this._startDisplay = null;
        this._start        = null;
    }

    // A session opened and never started begins with the game: on Start, or
    // with the next level shown (a save loaded from the pause, a restart).
    startPending() {
        if ((this._session === null) || this._session.isStarted()) {
            return;
        }
        this._session.start();
        this._game.getRole().startHosting(this._session, (nicknames) => this._notice.setWaiting(nicknames));
    }
}
