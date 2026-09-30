/**
 * The session of the main: it invites the subs, admits each one on its hello
 * and welcomes it with its player id, its slot and how the session plays (the
 * mode and its options), keeps the lobby — each sub's slot, nickname and
 * ping — and sends it to every sub whenever it changes and with every ping
 * sample, changes the mode, removes a sub, and stops the whole session. A sub
 * that leaves or whose link is lost simply drops out of the lobby.
 */
class DoomNetMainSession {
    /**
     * @param {DoomNetLinks} links
     * @param {string}       wadSha256 - identity of the WAD every sub must hold
     * @param {string}       nickname  - the main's
     * @param {int}          capacity  - players, main included
     * @param {int}          mode      - DoomNetProtocol.MODE_*
     * @param {object}       options   - the mode's game settings, as the subs get them
     */
    constructor(links, wadSha256, nickname, capacity, mode, options) {
        this._links     = links;
        this._wadSha256 = wadSha256;
        this._lobby     = new DoomNetLobby(capacity).addMain(nickname);
        this._mode      = mode;
        this._options   = options;
        this._started   = false;
        this._pairing   = null;
        this._onChange  = null;
        this._cycle     = null;
        this._pending   = new Map();   // peer id → nickname of a sub paired but not yet heard
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

    getMode() {
        return this._mode;
    }

    getOptions() {
        return this._options;
    }

    /**
     * Every sub is welcomed again under the new mode; the next invites carry it.
     *
     * @param {int}    mode    - DoomNetProtocol.MODE_*
     * @param {object} options
     */
    setMode(mode, options) {
        this._mode    = mode;
        this._options = options;
        for (const peer of this._host.getPeers()) {
            if (this._lobby.getPlayer(peer.getId()) !== null) {
                this._welcome(peer);
            }
        }

        return this;
    }

    /**
     * @returns {int|null} the player id of a sub in the lobby — its slot —, null for any other peer
     */
    playerIdOf(peer) {
        const player = this._lobby.getPlayer(peer.getId());

        return ((player !== null) ? player.slot : null);
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

        return this._pairing.addPeer(DoomNetInvite.encodeInvite(this._wadSha256, this._mode));
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
     * @param {int}    peerId - the sub's id in the lobby
     * @param {string} reason - the DoomNetProtocol.END_* told to that sub
     */
    remove(peerId, reason = DoomNetProtocol.END_REMOVED) {
        const peer = this._host.getPeers().find((candidate) => (candidate.getId() === peerId));
        if (peer === undefined) {
            return;
        }
        peer.sendControl({type: DoomNetProtocol.SESSION_END, reason: reason});
        this._cycleCall('gone', peer);
        this._lobby.remove(peerId);
        this._changed();
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

    // The answer payload comes from the scanned code: a malformed one loses the
    // peer as an invalid message would. The sub enters the lobby on its hello.
    _admit(peer) {
        let nickname = null;
        try {
            nickname = DoomNetInvite.decodeAnswer(peer.getPayload());
        } catch (error) {
            peer.reportInvalid(error);
            return;
        }
        this._pending.set(peer.getId(), nickname);
    }

    // The welcome precedes anything else the sub gets from the session: the
    // lobby, the start, the level to build.
    _join(peer) {
        const nickname = this._pending.get(peer.getId());
        if (nickname === undefined) {
            return;
        }
        this._pending.delete(peer.getId());
        this._lobby.addPlayer(peer.getId(), nickname);
        this._welcome(peer);
        if (this._started) {
            peer.sendControl({type: DoomNetProtocol.START});
        }
        this._changed();
        this._cycleCall('admitted', peer);
    }

    _welcome(peer) {
        const playerId = this.playerIdOf(peer);
        peer.sendControl({type: DoomNetProtocol.WELCOME, playerId: playerId, slot: playerId, mode: this._mode, options: this._options});
    }

    _receive(peer, message) {
        if (message.type === DoomNetProtocol.SESSION_END) {
            this._host.remove(peer);
            this._drop(peer);
            return;
        }
        if (message.type === DoomNetProtocol.HELLO) {
            this._join(peer);
            return;
        }
        this._cycleCall('control', peer, message);
    }

    // The turn cycle hears of the departure before the lobby forgets the sub's slot.
    _drop(peer) {
        this._pending.delete(peer.getId());
        if (this._lobby.getPlayer(peer.getId()) === null) {
            return;
        }
        this._cycleCall('gone', peer);
        this._lobby.remove(peer.getId());
        this._changed();
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
