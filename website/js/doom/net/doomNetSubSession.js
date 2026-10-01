/**
 * The session of a sub: it answers the main's invite — refused for another
 * WAD —, says hello once linked and keeps what the main's welcome tells (its
 * player id, the mode and its options), mirrors the main's lobby, knows when
 * the game runs, and ends on leaving, on the main's word (stopped, removed)
 * or on a lost link. It tells the main when its page goes to the background
 * and comes back, and keeps its own liveness timeout off meanwhile: a
 * suspended page hears nothing, and must not take the link for lost on waking.
 */
class DoomNetSubSession {
    /**
     * @param {DoomNetLinks} links
     * @param {string}       wadSha256 - identity of the sub's WAD
     * @param {string}       nickname
     */
    constructor(links, wadSha256, nickname) {
        this._links        = links;
        this._wadSha256    = wadSha256;
        this._nickname     = nickname;
        this._lobby        = new DoomNetLobby(0);
        this._started      = false;
        this._ended        = false;
        this._playerId     = null;
        this._mode         = DoomNetProtocol.MODE_SCREEN_SHARING;
        this._options      = {};
        this._pairing      = null;
        this._onChange     = null;
        this._onEnd        = null;
        this._cycle        = null;
        this._building     = false;   // this device builds a level: its liveness timeout is off
        this._away         = false;   // this page is in the background
        this._onVisibility = () => this._visibilityChanged();
        this._guest        = new NetGuestSession(appBootstrap.getVersion(), links.linkFactory())
            .setOnControl((message) => this._receive(message))
            .setOnBinary((buffer) => this._cycleCall('state', buffer))
            .setOnLost(() => this._end(DoomNetProtocol.END_LOST));
    }

    getLobby() {
        return this._lobby;
    }

    isStarted() {
        return this._started;
    }

    getMode() {
        return this._mode;
    }

    getOptions() {
        return this._options;
    }

    /**
     * @returns {int} the player this device views: its own when the subs play, the main's in screen sharing
     */
    getViewedPlayerId() {
        return ((DoomNetProtocol.subsPlayOwnPlayers(this._mode) && (this._playerId !== null)) ? this._playerId : DoomPlayer.MAIN_ID);
    }

    setOnChange(callback) {
        this._onChange = callback;

        return this;
    }

    /**
     * Who follows the main's game: {levelLoad(message), state(buffer),
     * waiting(nicknames), phase(message), modeChanged(), playerRemoved(message), playerAway(message)},
     * each method optional — the lobby screen until the game runs, then the game's role.
     */
    setCycle(cycle) {
        this._cycle = cycle;

        return this;
    }

    sendControl(message) {
        this._guest.sendControl(message);
    }

    sendBinary(buffer) {
        this._guest.sendBinary(buffer);
    }

    // Left, or ended by the main or a lost link: nothing goes through any more.
    isEnded() {
        return this._ended;
    }

    // Suspended while this device builds a level: it may not answer a ping for seconds.
    setLivenessSuspended(suspended) {
        this._building = suspended;
        this._applyLiveness();
    }

    _applyLiveness() {
        const host = this._guest.getHost();
        if (host !== null) {
            host.setLivenessSuspended(this._building || this._away);
        }
    }

    _visibilityChanged() {
        const away = (document.visibilityState === 'hidden');
        if (this._ended || (away === this._away)) {
            return;
        }
        this._away = away;
        this._applyLiveness();
        this._guest.sendControl({type: DoomNetProtocol.AWAY, away: away});
    }

    // A message from the main this device could not decode: the main is told
    // why, and the session ends here as it would at the main's word.
    endInvalid() {
        if (this._ended) {
            return;
        }
        this._guest.sendControl({type: DoomNetProtocol.SESSION_END, reason: DoomNetProtocol.END_INVALID});
        setTimeout(() => this._guest.close(), DoomNetProtocol.END_GRACE_MS);
        this._end(DoomNetProtocol.END_INVALID);
    }

    /**
     * @returns {number|null} the round trip to the main in ms, null before the first pong or once the link is gone
     */
    getHostPing() {
        const host = this._guest.getHost();

        return ((host !== null) ? host.getPing() : null);
    }

    getHostNickname() {
        const main = this._lobby.getPlayer(DoomNetLobby.MAIN_ID);

        return ((main !== null) ? main.nickname : '');
    }

    /**
     * @param {function(string)} callback - receives the DoomNetProtocol.END_* reason
     */
    setOnEnd(callback) {
        this._onEnd = callback;

        return this;
    }

    /**
     * Answers the main's invite through the view: its code read, the answer shown.
     *
     * @param {object} view - see NetPairing
     * @returns {Promise<object>} once the link is open
     */
    join(view) {
        this._pairing = new NetGuestPairing(this._guest, view);

        return this._pairing.join((invite) => DoomNetInvite.answerFor(invite, this._wadSha256, this._nickname))
            .then((result) => {
                this._guest.sendControl({type: DoomNetProtocol.HELLO});
                this._watchVisibility();
                return result;
            });
    }

    cancelPairing() {
        if (this._pairing !== null) {
            this._pairing.cancel();
        }
    }

    getCodeChannel() {
        return this._links.codeChannel();
    }

    leave() {
        if (this._ended) {
            return;
        }
        this._ended = true;
        this._unwatchVisibility();
        this._guest.sendControl({type: DoomNetProtocol.SESSION_END, reason: DoomNetProtocol.END_LEFT});
        setTimeout(() => this._guest.close(), DoomNetProtocol.END_GRACE_MS);
    }

    // A session whose pairing failed or was cancelled: nothing of it may stay alive.
    dispose() {
        if (this._ended) {
            return;
        }
        this._ended = true;
        this._unwatchVisibility();
        this._guest.close();
    }

    // Watched once linked: a page already in the background says so at once.
    _watchVisibility() {
        document.addEventListener('visibilitychange', this._onVisibility);
        this._visibilityChanged();
    }

    _unwatchVisibility() {
        document.removeEventListener('visibilitychange', this._onVisibility);
    }

    _receive(message) {
        if (message.type === DoomNetProtocol.WELCOME) {
            this._playerId = message.playerId;
            this._setMode(message.mode, message.options);
            return;
        }
        if (message.type === DoomNetProtocol.LOBBY) {
            this._lobby.load(message.lobby);
            this._changed();
            return;
        }
        if (message.type === DoomNetProtocol.START) {
            this._started = true;
            this._changed();
            return;
        }
        if (message.type === DoomNetProtocol.SESSION_END) {
            this._guest.close();
            this._end(message.reason);
            return;
        }
        if (message.type === DoomNetProtocol.LEVEL_LOAD) {
            this._setMode(message.mode, message.options);
            this._cycleCall('levelLoad', message);
            return;
        }
        if (message.type === DoomNetProtocol.WAITING) {
            this._cycleCall('waiting', message.nicknames);
            return;
        }
        if (message.type === DoomNetProtocol.PLAYER_REMOVED) {
            this._cycleCall('playerRemoved', message);
            return;
        }
        if (message.type === DoomNetProtocol.PLAYER_AWAY) {
            this._cycleCall('playerAway', message);
            return;
        }
        if (DoomNetSubSession.PHASES.includes(message.type)) {
            this._cycleCall('phase', message);
        }
    }

    _setMode(mode, options) {
        const changed = (mode !== this._mode);
        this._mode    = mode;
        this._options = options;
        if (changed) {
            this._cycleCall('modeChanged', null);
        }
    }

    _end(reason) {
        if (this._ended) {
            return;
        }
        this._ended = true;
        this._unwatchVisibility();
        if (this._onEnd !== null) {
            this._onEnd(reason);
        }
    }

    _cycleCall(event, payload) {
        this._cycle?.[event]?.(payload);
    }

    _changed() {
        if (this._onChange !== null) {
            this._onChange();
        }
    }
}

// The phases without turns the main announces.
DoomNetSubSession.PHASES = [DoomNetProtocol.PAUSE, DoomNetProtocol.INTERMISSION, DoomNetProtocol.FINALE];
