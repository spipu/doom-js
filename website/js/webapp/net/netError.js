/**
 * Typed error of the network layer: its code tells the caller which explicit message to show.
 */
class NetError extends Error {
    /**
     * @param {string} code    - one of the NetError constants
     * @param {string} message - English, console-bound
     */
    constructor(code, message) {
        super(message);

        this.name  = 'NetError';
        this._code = code;
    }

    getCode() {
        return this._code;
    }
}

NetError.VERSION_MISMATCH = 'version-mismatch';
NetError.WRONG_KIND       = 'wrong-kind';
NetError.INVALID_CODE     = 'invalid-code';
NetError.UNKNOWN_INVITE   = 'unknown-invite';
NetError.INVITE_USED      = 'invite-used';
NetError.INVALID_SIGNAL   = 'invalid-signal';
NetError.INVALID_MESSAGE  = 'invalid-message';
NetError.LINK_LOST        = 'link-lost';
NetError.CANCELLED        = 'cancelled';
