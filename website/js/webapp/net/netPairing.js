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
 *   finish()              : the pairing is over, whatever its outcome: code hidden, camera released
 *
 * so the same flow runs with a camera and a QR code, or through a loopback channel. One
 * pairing runs at a time per flow; cancel() ends it with NetError.CANCELLED. A code of
 * another application version ends it with NetError.VERSION_MISMATCH (the caller shows it),
 * any other unexpected code is ignored and the reading goes on.
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
