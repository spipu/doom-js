/**
 * Base of the two pairing flows. The flow owns the order of the steps, from the first code
 * to the open link; showing and reading codes belong to the caller, through a view:
 *
 *   prepare()             : Promise — before any offer or answer (opens the camera: RFC 8828)
 *   showCode(bytes, link) : Promise — displays a code for the other side (link: for diagnostics)
 *   readCode(accept)      : Promise<Uint8Array|null> — reads codes until one passes `accept`
 *                           (false: ignored, a throw: the read ends with that error),
 *                           null once cancelRead() is called
 *   cancelRead()          : ends the reading in progress
 *   hideCode()            : hides the code shown
 *   connecting(payload)   : the codes are exchanged, the link is being opened (payload: the other
 *                           side's application payload, for a status line naming it)
 *   finish()              : the pairing is over, whatever its outcome: code hidden, camera released
 *
 * so the same flow runs with a camera and a QR code, or through a loopback channel. One
 * pairing runs at a time per flow; cancel() ends it with NetError.CANCELLED. A code of
 * another application version ends it with NetError.VERSION_MISMATCH (the caller shows it),
 * any other unexpected code is ignored and the reading goes on. Once both sides' addresses
 * are known, a pairing with no possible route ends with NetError.UNREACHABLE at once; a link
 * that then fails or stays silent too long ends it with NetError.LINK_LOST or
 * NetError.CONNECT_TIMEOUT, the network verdict (NetReachability) as detail.
 */
class NetPairing {
    /** @type {NetSession} */ _session;
    /** @type {object}     */ _view;
    /** @type {boolean}    */ _running;
    /** @type {boolean}    */ _cancelled;

    /**
     * @param {NetSession} session
     * @param {{prepare: function, showCode: function, readCode: function, cancelRead: function, hideCode: function, finish: function}} view
     */
    constructor(session, view) {
        this._session   = session;
        this._view      = view;
        this._running   = false;
        this._cancelled = false;
    }

    isRunning() {
        return this._running;
    }

    cancel() {
        if (!this._running) {
            return;
        }
        this._cancelled = true;
        this._view.cancelRead();
        this._abort();
    }

    /**
     * Runs one pairing: the view is always finished, and a cancelled one always ends with
     * NetError.CANCELLED whatever the step it stopped.
     *
     * @param {function(): Promise<*>} steps
     */
    async _run(steps) {
        if (this._running) {
            throw new Error('A pairing is already running');
        }
        this._running   = true;
        this._cancelled = false;
        try {
            return await steps();
        } catch (error) {
            throw (this._cancelled ? NetPairing._cancelledError() : error);
        } finally {
            this._running = false;
            this._view.finish();
        }
    }

    /**
     * @param {int}      kind     - NetPairingCode.KIND_INVITE | KIND_ANSWER
     * @param {int|null} inviteId - the only invite an answer is taken for
     * @returns {Promise<Uint8Array>} the first code of this version and kind read by the view
     */
    async _readCode(kind, inviteId = null) {
        this._throwIfCancelled();
        const code = await this._view.readCode(NetPairing._accepting(this._session.getVersion(), kind, inviteId));
        this._throwIfCancelled();
        if (code === null) {
            throw NetPairing._cancelledError();
        }
        return code;
    }

    _throwIfCancelled() {
        if (this._cancelled) {
            throw NetPairing._cancelledError();
        }
    }

    /**
     * @param {NetLink} link - with both sides' addresses
     * @returns {string} the NetReachability verdict; a pairing without any route stops here
     */
    _verdictOf(link) {
        const verdict = NetReachability.verdict(link.getLocalCandidates(), link.getRemoteCandidates());
        if (verdict === NetReachability.UNREACHABLE) {
            throw new NetError(NetError.UNREACHABLE, 'No route between the two sides', verdict);
        }
        return verdict;
    }

    /**
     * @param {NetPeer} peer
     * @param {int}     timeoutMs
     * @param {string}  verdict   - carried by the error of a link that fails or stays silent
     * @returns {Promise<NetPeer>} the peer, once its link is open
     */
    async _awaitOpen(peer, timeoutMs, verdict) {
        let timer = null;
        const expiry = new Promise((resolve, reject) => {
            timer = setTimeout(() => reject(new NetError(NetError.CONNECT_TIMEOUT, 'Link of peer ' + peer.getId() + ' not open after ' + timeoutMs + ' ms', verdict)), timeoutMs);
        });
        try {
            return await Promise.race([peer.whenOpen(), expiry]);
        } catch (error) {
            throw NetPairing._withVerdict(error, verdict);
        } finally {
            clearTimeout(timer);
        }
    }

    static _withVerdict(error, verdict) {
        if ((error instanceof NetError) && (error.getCode() === NetError.LINK_LOST)) {
            return new NetError(NetError.LINK_LOST, error.message, verdict);
        }
        return error;
    }

    /**
     * Stops what the flow waits for besides a code (a link being opened); called by cancel().
     */
    _abort() {
        throw new Error('NetPairing._abort is abstract');
    }

    static _cancelledError() {
        return new NetError(NetError.CANCELLED, 'Pairing cancelled');
    }

    static _accepting(version, kind, inviteId) {
        return (bytes) => {
            try {
                const code = NetPairingCode.decode(bytes, version, kind);
                return ((inviteId === null) || (code.inviteId === inviteId));
            } catch (error) {
                if ((error instanceof NetError) && (error.getCode() === NetError.VERSION_MISMATCH)) {
                    throw error;
                }
                return false;
            }
        };
    }
}
