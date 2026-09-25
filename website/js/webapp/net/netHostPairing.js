/**
 * Pairing flow of the inviting side: one call adds one peer — invite shown, answer read,
 * link open. Called again for every further peer.
 */
class NetHostPairing extends NetPairing {
    /** @type {NetPeer|null} */ _pendingPeer;

    /**
     * @param {NetHostSession} session
     * @param {object}         view    - see NetPairing
     */
    constructor(session, view) {
        super(session, view);

        this._pendingPeer = null;
    }

    /**
     * @param {Uint8Array} payload - application payload the joining side receives
     * @returns {Promise<NetPeer>} the peer, once its link is open
     */
    addPeer(payload) {
        return this._run(async () => {
            await this._view.prepare();
            this._throwIfCancelled();
            const invite = await this._session.createInvite(payload);
            try {
                this._throwIfCancelled();
                await this._view.showCode(invite.code, invite.link);
                const answer = await this._readCode(NetPairingCode.KIND_ANSWER, invite.inviteId);
                this._view.hideCode();
                this._pendingPeer = await this._session.acceptAnswer(answer);
                this._throwIfCancelled();
                return await this._pendingPeer.whenOpen();
            } catch (error) {
                this._session.cancelInvite(invite.inviteId);
                this._abort();
                throw error;
            } finally {
                this._pendingPeer = null;
            }
        });
    }

    _abort() {
        if (this._pendingPeer !== null) {
            this._session.remove(this._pendingPeer);
        }
    }
}
