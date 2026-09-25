/**
 * Session of the joining side (a sub): one invite accepted, one link to the inviting side.
 */
class NetGuestSession extends NetSession {
    /** @type {NetPeer|null}  */ _host;
    /** @type {function|null} */ _onOpen;
    /** @type {function|null} */ _onControl;
    /** @type {function|null} */ _onBinary;
    /** @type {function|null} */ _onLost;

    /**
     * @param {string}             version
     * @param {function():NetLink} linkFactory
     */
    constructor(version, linkFactory) {
        super(version, linkFactory);

        this._host      = null;
        this._onOpen    = null;
        this._onControl = null;
        this._onBinary  = null;
        this._onLost    = null;
    }

    /**
     * Accepts an invite, closing the link of any previous one.
     *
     * @param {Uint8Array}                       code       - the invite code read from the inviting side
     * @param {function(Uint8Array): Uint8Array} payloadFor - the application payload the inviting side
     *                                           receives, built from the invite's own; it throws to refuse the invite
     * @returns {Promise<{code: Uint8Array, invitePayload: Uint8Array, link: NetLink}>} the answer code to show
     */
    async acceptInvite(code, payloadFor) {
        const invite  = NetPairingCode.decode(code, this._version, NetPairingCode.KIND_INVITE);
        const payload = payloadFor(invite.payload);
        const link    = this._linkFactory();
        this.close();
        this._host = this._newPeer(NetGuestSession.HOST_ID, link, invite.payload);
        let signal;
        try {
            signal = await link.acceptOffer(invite.signal);
        } catch (error) {
            this.close();
            throw error;
        }
        return {
            code:          NetPairingCode.encode(this._version, NetPairingCode.KIND_ANSWER, invite.inviteId, signal, payload),
            invitePayload: invite.payload,
            link
        };
    }

    /**
     * @returns {NetPeer|null} the inviting side
     */
    getHost() {
        return this._host;
    }

    sendControl(message) {
        this._host.sendControl(message);
    }

    sendBinary(buffer) {
        this._host.sendBinary(buffer);
    }

    /**
     * Closes the link on purpose: no lost notification follows.
     */
    close() {
        this._host?.close();
        this._host = null;
    }

    /**
     * @param {function()} callback
     */
    setOnOpen(callback) {
        this._onOpen = callback;
        return this;
    }

    /**
     * @param {function({type: string})} callback
     */
    setOnControl(callback) {
        this._onControl = callback;
        return this;
    }

    /**
     * @param {function(ArrayBuffer)} callback
     */
    setOnBinary(callback) {
        this._onBinary = callback;
        return this;
    }

    /**
     * @param {function(string, Error|null)} callback - see NetPeer.setOnLost
     */
    setOnLost(callback) {
        this._onLost = callback;
        return this;
    }

    _peerOpened(peer) {
        this._onOpen?.();
    }

    _peerControl(peer, message) {
        this._onControl?.(message);
    }

    _peerBinary(peer, buffer) {
        this._onBinary?.(buffer);
    }

    _peerLost(peer, reason, error) {
        this._host = null;
        this._onLost?.(reason, error);
    }
}

NetGuestSession.HOST_ID = 0;
