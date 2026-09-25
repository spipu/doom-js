/**
 * Abstract bidirectional link carrying strings and ArrayBuffers in order.
 *
 * Pairing is a three-call exchange whose signals are opaque bytes:
 * the inviting side calls createOffer(), the joining side acceptOffer(offer) and gets its
 * answer, the inviting side ends with acceptAnswer(answer).
 */
class NetLink {
    /** @type {function|null} */ _onOpen;
    /** @type {function|null} */ _onMessage;
    /** @type {function|null} */ _onClose;
    /** @type {boolean}       */ _open;
    /** @type {boolean}       */ _closed;

    constructor() {
        this._onOpen    = null;
        this._onMessage = null;
        this._onClose   = null;
        this._open      = false;
        this._closed    = false;
    }

    /**
     * @returns {Promise<Uint8Array>}
     */
    async createOffer() {
        throw new Error('NetLink.createOffer is abstract');
    }

    /**
     * @param {Uint8Array} offer
     * @returns {Promise<Uint8Array>} the answer signal
     */
    async acceptOffer(offer) {
        throw new Error('NetLink.acceptOffer is abstract');
    }

    /**
     * @param {Uint8Array} answer
     */
    async acceptAnswer(answer) {
        throw new Error('NetLink.acceptAnswer is abstract');
    }

    /**
     * Sends while the link is open; a message sent to a link that is not (yet, or any more)
     * is dropped, the open or close event telling the caller what happened.
     *
     * @param {string|ArrayBuffer} message
     * @returns {boolean} false when dropped
     */
    send(message) {
        if (!this._open) {
            return false;
        }
        this._send(message);
        return true;
    }

    /**
     * Closes the link on purpose; idempotent. The close event fires with NetLink.CLOSED.
     */
    close() {
        this._notifyClose(NetLink.CLOSED);
    }

    /**
     * @returns {Promise<string>} a human-readable description of the route in use
     */
    async describeRoute() {
        return '';
    }

    isOpen() {
        return this._open;
    }

    isClosed() {
        return this._closed;
    }

    setOnOpen(callback) {
        this._onOpen = callback;
        return this;
    }

    /**
     * @param {function(string|ArrayBuffer)} callback
     */
    setOnMessage(callback) {
        this._onMessage = callback;
        return this;
    }

    /**
     * @param {function(string)} callback - receives the reason: NetLink.CLOSED | NetLink.FAILED
     */
    setOnClose(callback) {
        this._onClose = callback;
        return this;
    }

    /**
     * Hands a message to the transport; called only while open.
     */
    _send(message) {
        throw new Error('NetLink._send is abstract');
    }

    /**
     * Releases the transport; called once, whether the closing is local or remote.
     */
    _closeTransport() {
        throw new Error('NetLink._closeTransport is abstract');
    }

    _notifyOpen() {
        if (this._open || this._closed) {
            return;
        }
        this._open = true;
        this._onOpen?.();
    }

    _notifyMessage(message) {
        this._onMessage?.(message);
    }

    _notifyClose(reason) {
        if (this._closed) {
            return;
        }
        this._closed = true;
        this._open   = false;
        try {
            this._closeTransport();
        } finally {
            this._onClose?.(reason);
        }
    }
}

NetLink.CLOSED = 'closed';
NetLink.FAILED = 'failed';
