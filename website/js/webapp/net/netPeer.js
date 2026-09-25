/**
 * One connection seen from a session: its link, message codec and ping meter, and the
 * single place that decides the link is lost (closed, failed, silent, or invalid).
 */
class NetPeer {
    /** @type {int}              */ _id;
    /** @type {Uint8Array}       */ _payload;
    /** @type {NetMessageCodec}  */ _codec;
    /** @type {NetPingMeter}     */ _pingMeter;
    /** @type {Promise<NetPeer>} */ _opened;
    /** @type {function}         */ _resolveOpened;
    /** @type {function}         */ _rejectOpened;
    /** @type {function|null}    */ _onOpen;
    /** @type {function|null}    */ _onControl;
    /** @type {function|null}    */ _onBinary;
    /** @type {function|null}    */ _onLost;
    /** @type {boolean}          */ _ended;

    /**
     * @param {int}        id
     * @param {NetLink}    link
     * @param {Uint8Array} payload - the application payload of the other side's pairing code
     */
    constructor(id, link, payload) {
        this._id        = id;
        this._payload   = payload;
        this._onOpen    = null;
        this._onControl = null;
        this._onBinary  = null;
        this._onLost    = null;
        this._ended     = false;
        this._opened    = new Promise((resolve, reject) => {
            this._resolveOpened = resolve;
            this._rejectOpened  = reject;
        });
        // Nobody may ever wait for the opening: its rejection must not surface as unhandled.
        this._opened.catch(() => {});
        this._codec     = new NetMessageCodec(link)
            .setOnControl((message) => this._receiveControl(message))
            .setOnBinary((buffer) => this._receiveBinary(buffer))
            .setOnInvalid((error) => this._lose(NetPeer.LOST_INVALID, error));
        this._pingMeter = new NetPingMeter(this._codec)
            .setOnLost(() => this._lose(NetPeer.LOST_TIMEOUT, null));
        link.setOnOpen(() => this._open());
        link.setOnClose((reason) => this._lose(reason, null));
    }

    getId() {
        return this._id;
    }

    getPayload() {
        return this._payload;
    }

    getLink() {
        return this._codec.getLink();
    }

    isOpen() {
        return this.getLink().isOpen();
    }

    /**
     * @returns {Promise<NetPeer>} settles once: open, or rejected (NetError.LINK_LOST) if the link ends first
     */
    whenOpen() {
        return this._opened;
    }

    /**
     * @returns {number|null} rolling average round trip in ms
     */
    getPing() {
        return this._pingMeter.getPing();
    }

    sendControl(message) {
        this._codec.sendControl(message);
    }

    sendBinary(buffer) {
        this._codec.sendBinary(buffer);
    }

    /**
     * Suspends the liveness timeout, for a phase where the other side may not answer (a level build).
     */
    setLivenessSuspended(suspended) {
        this._pingMeter.setSuspended(suspended);
        return this;
    }

    /**
     * Ends the link because the application could not decode one of its messages.
     *
     * @param {Error} error
     */
    reportInvalid(error) {
        this._lose(NetPeer.LOST_INVALID, error);
    }

    /**
     * Closes the link on purpose: no lost notification follows.
     */
    close() {
        this._end(NetLink.CLOSED);
    }

    setOnOpen(callback) {
        this._onOpen = callback;
        return this;
    }

    /**
     * @param {function(NetPeer, {type: string})} callback - every control message but the pings
     */
    setOnControl(callback) {
        this._onControl = callback;
        return this;
    }

    /**
     * @param {function(NetPeer, ArrayBuffer)} callback
     */
    setOnBinary(callback) {
        this._onBinary = callback;
        return this;
    }

    /**
     * @param {function(NetPeer, string, Error|null)} callback - reason: NetLink.CLOSED | NetLink.FAILED
     *                                                            | NetPeer.LOST_TIMEOUT | NetPeer.LOST_INVALID
     */
    setOnLost(callback) {
        this._onLost = callback;
        return this;
    }

    _open() {
        this._pingMeter.start();
        this._resolveOpened(this);
        this._onOpen?.(this);
    }

    _receiveControl(message) {
        this._pingMeter.noteReceived();
        if (this._pingMeter.handle(message)) {
            return;
        }
        this._onControl?.(this, message);
    }

    _receiveBinary(buffer) {
        this._pingMeter.noteReceived();
        this._onBinary?.(this, buffer);
    }

    _lose(reason, error) {
        if (this._ended) {
            return;
        }
        this._end(reason);
        this._onLost?.(this, reason, error);
    }

    _end(reason) {
        if (this._ended) {
            return;
        }
        this._ended = true;
        this._pingMeter.stop();
        this._rejectOpened(new NetError(NetError.LINK_LOST, 'Link of peer ' + this._id + ' ended: ' + reason));
        this.getLink().close();
    }
}

NetPeer.LOST_TIMEOUT = 'timeout';
NetPeer.LOST_INVALID = 'invalid';
