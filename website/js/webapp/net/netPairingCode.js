/**
 * Envelope of a pairing code, the bytes a QR code carries: application version first — so
 * that a version mismatch is always readable whatever changed in the rest of the format —,
 * then the kind (invite or answer), the invite id that pairs an answer with its invite,
 * the link signal and the opaque application payload.
 */
class NetPairingCode {
    /**
     * @param {string}     version
     * @param {int}        kind     - NetPairingCode.KIND_INVITE | KIND_ANSWER
     * @param {int}        inviteId
     * @param {Uint8Array} signal
     * @param {Uint8Array} payload
     * @returns {Uint8Array}
     */
    static encode(version, kind, inviteId, signal, payload) {
        return new NetByteWriter()
            .ascii(version)
            .u8(kind)
            .u16(inviteId)
            .u16(signal.length)
            .bytes(signal)
            .bytes(payload)
            .toBytes();
    }

    /**
     * @param {Uint8Array} bytes
     * @param {string}     version      - the local application version
     * @param {int}        expectedKind
     * @returns {{inviteId: int, signal: Uint8Array, payload: Uint8Array}}
     */
    static decode(bytes, version, expectedKind) {
        const reader = new NetByteReader(bytes);
        let codeVersion;
        let kind;
        try {
            codeVersion = reader.ascii();
            kind        = reader.u8();
        } catch (error) {
            throw new NetError(NetError.INVALID_CODE, 'Not a pairing code');
        }
        if (codeVersion !== version) {
            throw new NetError(NetError.VERSION_MISMATCH, 'Pairing code of version ' + codeVersion + ', expected ' + version);
        }
        if (kind !== expectedKind) {
            throw new NetError(NetError.WRONG_KIND, 'Pairing code of kind ' + kind + ', expected ' + expectedKind);
        }
        try {
            const inviteId = reader.u16();
            const signal   = reader.bytes(reader.u16());
            return {inviteId, signal, payload: reader.rest()};
        } catch (error) {
            throw new NetError(NetError.INVALID_CODE, 'Truncated pairing code');
        }
    }
}

NetPairingCode.KIND_INVITE = 1;
NetPairingCode.KIND_ANSWER = 2;
