/**
 * The session of the main: it invites the subs, keeps the lobby — each sub's
 * slot, nickname and ping — and sends it to every sub whenever it changes and
 * with every ping sample, removes a sub, and stops the whole session. A sub
 * that leaves or whose link is lost simply drops out of the lobby.
 */
class DoomNetMainSession {
    /**
     * @param {DoomNetLinks} links
     * @param {string}       wadSha256 - identity of the WAD every sub must hold
     * @param {string}       nickname  - the main's
     * @param {int}          capacity  - players, main included
     */
    constructor(links, wadSha256, nickname, capacity) {
        this._links     = links;
        this._wadSha256 = wadSha256;
        this._lobby     = new DoomNetLobby(capacity).addMain(nickname);
        this._started   = false;
        this._pairing   = null;
        this._onChange  = null;
        this._host      = new NetHostSession(appBootstrap.getVersion(), links.linkFactory())
            .setOnPeerOpen((peer) => this._admit(peer))
            .setOnPeerControl((peer, message) => this._receive(peer, message))
            .setOnPeerLost((peer) => this._drop(peer));
        this._pingTimer = setInterval(() => this._samplePings(), NetConfig.PING_PERIOD_MS);
    }

    getLobby() {
        return this._lobby;
    }

    isStarted() {
        return this._started;
    }

    // Called whenever the lobby changes, pings included.
    setOnChange(callback) {
        this._onChange = callback;

        return this;
    }

    /**
     * Pairs one more sub through the view: the invite shown, its answer read.
     *
     * @param {object} view - see NetPairing
     * @returns {Promise<NetPeer>}
     */
    addPlayer(view) {
        this._pairing = new NetHostPairing(this._host, view);

        return this._pairing.addPeer(DoomNetInvite.encodeInvite(this._wadSha256, DoomNetProtocol.MODE_SCREEN_SHARING));
    }

    cancelPairing() {
        if (this._pairing !== null) {
            this._pairing.cancel();
        }
    }

    getCodeChannel() {
        return this._links.codeChannel();
    }

    start() {
        this._started = true;
        this._host.broadcastControl({type: DoomNetProtocol.START});
    }

    remove(playerId) {
        const peer = this._host.getPeers().find((candidate) => (candidate.getId() === playerId));
        if (peer === undefined) {
            return;
        }
        peer.sendControl({type: DoomNetProtocol.SESSION_END, reason: DoomNetProtocol.END_REMOVED});
        this._lobby.remove(playerId);
        this._changed();
        setTimeout(() => this._host.remove(peer), DoomNetProtocol.END_GRACE_MS);
    }

    stop() {
        clearInterval(this._pingTimer);
        this.cancelPairing();
        this._host.broadcastControl({type: DoomNetProtocol.SESSION_END, reason: DoomNetProtocol.END_STOPPED});
        this._onChange = null;
        setTimeout(() => this._host.close(), DoomNetProtocol.END_GRACE_MS);
    }

    _admit(peer) {
        this._lobby.addPlayer(peer.getId(), DoomNetInvite.decodeAnswer(peer.getPayload()));
        if (this._started) {
            peer.sendControl({type: DoomNetProtocol.START});
        }
        this._changed();
    }

    _receive(peer, message) {
        if (message.type === DoomNetProtocol.SESSION_END) {
            this._host.remove(peer);
            this._drop(peer);
        }
    }

    _drop(peer) {
        this._lobby.remove(peer.getId());
        this._changed();
    }

    _samplePings() {
        for (const peer of this._host.getPeers()) {
            this._lobby.setPing(peer.getId(), peer.getPing());
        }
        this._changed();
    }

    _changed() {
        this._host.broadcastControl({type: DoomNetProtocol.LOBBY, lobby: this._lobby.toData()});
        if (this._onChange !== null) {
            this._onChange();
        }
    }
}
