/**
 * Pairing flow of the joining side: invite read, answer shown, link open once the inviting
 * side has read the answer.
 */
class NetGuestPairing extends NetPairing {
    /**
     * @param {function(Uint8Array): Uint8Array} payloadFor - the application payload the inviting side
     *                                           receives, built from the invite's own; it throws to refuse the invite
     * @returns {Promise<{code: Uint8Array, invitePayload: Uint8Array, link: NetLink}>} the answer, once the link is open
     */
    join(payloadFor) {
        return this._run(async () => {
            try {
                await this._view.prepare();
                const invite = await this._readCode(NetPairingCode.KIND_INVITE);
                const answer = await this._session.acceptInvite(invite, payloadFor);
                this._throwIfCancelled();
                await this._view.showCode(answer.code, answer.link);
                await this._session.getHost().whenOpen();
                return answer;
            } catch (error) {
                this._session.close();
                throw error;
            }
        });
    }

    _abort() {
        this._session.close();
    }
}
