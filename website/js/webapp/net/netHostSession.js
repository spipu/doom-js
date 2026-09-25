/**
 * Star session of the inviting side (the main): every invite opens a new link, each
 * answer is paired with its invite by id, and each joined side becomes a NetPeer. An
 * invite serves one peer only: its answer is refused a second time.
 */
class NetHostSession extends NetSession {
    /** @type {Map}           */ _invites;
    /** @type {Map}           */ _peers;
    /** @type {Set}           */ _usedInvites;
    /** @type {int}           */ _nextInviteId;
    /** @type {int}           */ _nextPeerId;
    /** @type {function|null} */ _onPeerOpen;
    /** @type {function|null} */ _onPeerControl;
    /** @type {function|null} */ _onPeerBinary;
    /** @type {function|null} */ _onPeerLost;

    /**
     * @param {string}             version
     * @param {function():NetLink} linkFactory
     */
    constructor(version, linkFactory) {
        super(version, linkFactory);

        this._invites       = new Map();
        this._peers         = new Map();
        this._usedInvites   = new Set();
        this._nextInviteId  = 1;
        this._nextPeerId    = 1;
        this._onPeerOpen    = null;
        this._onPeerControl = null;
        this._onPeerBinary  = null;
        this._onPeerLost    = null;
    }

    /**
     * @param {Uint8Array} payload - application payload the joining side receives
     * @returns {Promise<{inviteId: int, code: Uint8Array, link: NetLink}>}
     */
    async createInvite(payload) {
        const inviteId = this._nextInviteId;
        const link     = this._linkFactory();
        this._nextInviteId = (this._nextInviteId % NetHostSession.MAX_INVITE_ID) + 1;
        // Registered before its offer exists, so that cancelInvite() reaches a link still gathering.
        this._usedInvites.delete(inviteId);
        this._invites.set(inviteId, link);
        let signal;
        try {
            signal = await link.createOffer();
        } catch (error) {
            this.cancelInvite(inviteId);
            throw error;
        }
        return {inviteId, code: NetPairingCode.encode(this._version, NetPairingCode.KIND_INVITE, inviteId, signal, payload), link};
    }

    /**
     * @param {Uint8Array} code - the answer code read from the joining side
     * @returns {Promise<NetPeer>} the peer, open once its link is (NetPeer.whenOpen)
     */
    async acceptAnswer(code) {
        const answer = NetPairingCode.decode(code, this._version, NetPairingCode.KIND_ANSWER);
        if (this._usedInvites.has(answer.inviteId)) {
            throw new NetError(NetError.INVITE_USED, 'Invite ' + answer.inviteId + ' already answered');
        }
        const link = this._invites.get(answer.inviteId);
        if (link === undefined) {
            throw new NetError(NetError.UNKNOWN_INVITE, 'No pending invite ' + answer.inviteId);
        }
        this._invites.delete(answer.inviteId);
        this._usedInvites.add(answer.inviteId);
        const peer = this._newPeer(this._nextPeerId, link, answer.payload);
        this._nextPeerId += 1;
        this._peers.set(peer.getId(), peer);
        try {
            await link.acceptAnswer(answer.signal);
        } catch (error) {
            this.remove(peer);
            throw error;
        }
        return peer;
    }

    cancelInvite(inviteId) {
        const link = this._invites.get(inviteId);
        if (link === undefined) {
            return;
        }
        this._invites.delete(inviteId);
        link.close();
    }

    /**
     * Closes a peer on purpose (removed by the main): no lost notification follows.
     */
    remove(peer) {
        this._peers.delete(peer.getId());
        peer.close();
    }

    /**
     * @returns {NetPeer[]} in joining order
     */
    getPeers() {
        return Array.from(this._peers.values());
    }

    broadcastControl(message) {
        for (const peer of this._openPeers()) {
            peer.sendControl(message);
        }
    }

    broadcastBinary(buffer) {
        for (const peer of this._openPeers()) {
            peer.sendBinary(buffer);
        }
    }

    close() {
        for (const inviteId of Array.from(this._invites.keys())) {
            this.cancelInvite(inviteId);
        }
        for (const peer of this.getPeers()) {
            this.remove(peer);
        }
    }

    /**
     * @param {function(NetPeer)} callback
     */
    setOnPeerOpen(callback) {
        this._onPeerOpen = callback;
        return this;
    }

    /**
     * @param {function(NetPeer, {type: string})} callback
     */
    setOnPeerControl(callback) {
        this._onPeerControl = callback;
        return this;
    }

    /**
     * @param {function(NetPeer, ArrayBuffer)} callback
     */
    setOnPeerBinary(callback) {
        this._onPeerBinary = callback;
        return this;
    }

    /**
     * @param {function(NetPeer, string, Error|null)} callback - see NetPeer.setOnLost
     */
    setOnPeerLost(callback) {
        this._onPeerLost = callback;
        return this;
    }

    _openPeers() {
        return this.getPeers().filter(peer => peer.isOpen());
    }

    _peerOpened(peer) {
        this._onPeerOpen?.(peer);
    }

    _peerControl(peer, message) {
        this._onPeerControl?.(peer, message);
    }

    _peerBinary(peer, buffer) {
        this._onPeerBinary?.(peer, buffer);
    }

    _peerLost(peer, reason, error) {
        this._peers.delete(peer.getId());
        this._onPeerLost?.(peer, reason, error);
    }
}

NetHostSession.MAX_INVITE_ID = 0xFFFF;
