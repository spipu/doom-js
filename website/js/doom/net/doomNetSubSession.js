/**
 * The session of a sub: it answers the main's invite — refused for another
 * WAD —, mirrors the main's lobby, knows when the game runs, and ends on
 * leaving, on the main's word (stopped, removed) or on a lost link.
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
        this._pairing   = null;
        this._onChange  = null;
        this._onEnd     = null;
        this._guest     = new NetGuestSession(appBootstrap.getVersion(), links.linkFactory())
            .setOnControl((message) => this._receive(message))
            .setOnLost(() => this._end(DoomNetProtocol.END_LOST));
    }

    getLobby() {
        return this._lobby;
    }

    isStarted() {
        return this._started;
    }

    setOnChange(callback) {
        this._onChange = callback;

        return this;
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

        return this._pairing.join((invite) => DoomNetInvite.answerFor(invite, this._wadSha256, this._nickname));
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

    _changed() {
        if (this._onChange !== null) {
            this._onChange();
        }
    }
}
