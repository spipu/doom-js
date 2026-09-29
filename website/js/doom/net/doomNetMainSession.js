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
        this._cycle     = null;
        this._host      = new NetHostSession(appBootstrap.getVersion(), links.linkFactory())
            .setOnPeerOpen((peer) => this._admit(peer))
            .setOnPeerControl((peer, message) => this._receive(peer, message))
            .setOnPeerBinary((peer, buffer) => this._cycleCall('binary', peer, buffer))
            .setOnPeerLost((peer) => this._drop(peer));
        this._pingTimer = setInterval(() => this._samplePings(), NetConfig.PING_PERIOD_MS);
    }

    getLobby() {
        return this._lobby;
    }

    isStarted() {
        return this._started;
    }

    /**
     * The turn cycle of the running game, told about every sub in the lobby:
     * {admitted(peer), gone(peer), control(peer, message), binary(peer, buffer)}.
     * Null detaches it.
     */
    setCycle(cycle) {
        this._cycle = cycle;
        if (cycle !== null) {
            for (const peer of this._host.getPeers()) {
                if (this._lobby.getPlayer(peer.getId()) !== null) {
                    cycle.admitted(peer);
                }
            }
        }

        return this;
    }

    // The nickname a sub joined with, the waiting message's.
    nicknameOf(peer) {
        const player = this._lobby.getPlayer(peer.getId());

        return ((player !== null) ? player.nickname : '');
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

    /**
     * @param {int}    playerId
     * @param {string} reason - the DoomNetProtocol.END_* told to that sub
     */
    remove(playerId, reason = DoomNetProtocol.END_REMOVED) {
        const peer = this._host.getPeers().find((candidate) => (candidate.getId() === playerId));
        if (peer === undefined) {
            return;
        }
        peer.sendControl({type: DoomNetProtocol.SESSION_END, reason: reason});
        this._lobby.remove(playerId);
        this._changed();
        this._cycleCall('gone', peer);
        setTimeout(() => this._host.remove(peer), DoomNetProtocol.END_GRACE_MS);
    }

    /**
     * @param {string} reason - the DoomNetProtocol.END_* told to every sub
     */
    stop(reason = DoomNetProtocol.END_STOPPED) {
        clearInterval(this._pingTimer);
        this._cycle = null;
        this.cancelPairing();
        this._host.broadcastControl({type: DoomNetProtocol.SESSION_END, reason: reason});
        this._onChange = null;
        setTimeout(() => this._host.close(), DoomNetProtocol.END_GRACE_MS);
    }

    // The answer payload comes from the scanned code: a malformed one loses the peer as an invalid message would.
    _admit(peer) {
        let nickname = null;
        try {
            nickname = DoomNetInvite.decodeAnswer(peer.getPayload());
        } catch (error) {
            peer.reportInvalid(error);
            return;
        }
        this._lobby.addPlayer(peer.getId(), nickname);
        if (this._started) {
            peer.sendControl({type: DoomNetProtocol.START});
        }
        this._changed();
        this._cycleCall('admitted', peer);
    }

    _receive(peer, message) {
        if (message.type === DoomNetProtocol.SESSION_END) {
            this._host.remove(peer);
            this._drop(peer);
            return;
        }
        this._cycleCall('control', peer, message);
    }

    _drop(peer) {
        this._lobby.remove(peer.getId());
        this._changed();
        this._cycleCall('gone', peer);
    }

    _cycleCall(event, peer, payload = null) {
        if (this._cycle !== null) {
            this._cycle[event](peer, payload);
        }
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
