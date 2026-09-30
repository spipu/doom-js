/**
 * The session of a sub: it answers the main's invite — refused for another
 * WAD —, says hello once linked and keeps what the main's welcome tells (its
 * player id, the mode and its options), mirrors the main's lobby, knows when
 * the game runs, and ends on leaving, on the main's word (stopped, removed)
 * or on a lost link.
 */
class DoomNetSubSession {
    /**
     * @param {DoomNetLinks} links
     * @param {string}       wadSha256 - identity of the sub's WAD
     * @param {string}       nickname
     */
    constructor(links, wadSha256, nickname) {
        this._links     = links;
        this._wadSha256 = wadSha256;
        this._nickname  = nickname;
        this._lobby     = new DoomNetLobby(0);
        this._started   = false;
        this._ended     = false;
        this._playerId  = null;
        this._mode      = DoomNetProtocol.MODE_SCREEN_SHARING;
        this._options   = {};
        this._pairing   = null;
        this._onChange  = null;
        this._onEnd     = null;
        this._cycle     = null;
        this._guest     = new NetGuestSession(appBootstrap.getVersion(), links.linkFactory())
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
     * @returns {int} the player this device views: its own in cooperative, the main's in screen sharing
     */
    getViewedPlayerId() {
        return (((this._mode === DoomNetProtocol.MODE_COOPERATIVE) && (this._playerId !== null)) ? this._playerId : DoomPlayer.MAIN_ID);
    }

    setOnChange(callback) {
        this._onChange = callback;

        return this;
    }

    /**
     * Who follows the main's game: {levelLoad(message), state(buffer),
     * waiting(nicknames), phase(message), modeChanged(), playerRemoved(message)}
     * — the lobby screen until the game runs, then the game's role.
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
        const host = this._guest.getHost();
        if (host !== null) {
            host.setLivenessSuspended(suspended);
        }
    }

    // An invalid message from the main ends the session like a lost link.
    reportInvalid(error) {
        const host = this._guest.getHost();
        if (host !== null) {
            host.reportInvalid(error);
        }
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
        this._guest.sendControl({type: DoomNetProtocol.SESSION_END, reason: DoomNetProtocol.END_LEFT});
        setTimeout(() => this._guest.close(), DoomNetProtocol.END_GRACE_MS);
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
        if (this._onEnd !== null) {
            this._onEnd(reason);
        }
    }

    _cycleCall(event, payload) {
        if (this._cycle !== null) {
            this._cycle[event](payload);
        }
    }

    _changed() {
        if (this._onChange !== null) {
            this._onChange();
        }
    }
}

// The phases without turns the main announces.
DoomNetSubSession.PHASES = [DoomNetProtocol.PAUSE, DoomNetProtocol.INTERMISSION, DoomNetProtocol.FINALE];
