/**
 * The application payload of the pairing codes: the WAD identity and the mode
 * from the main to a sub, the nickname from the sub back to the main. A sub
 * refuses an invite for another WAD before any answer exists.
 */
class DoomNetInvite {
    /**
     * @param {string} wadSha256 - hexadecimal SHA-256 of the WAD
     * @param {int}    mode      - DoomNetProtocol.MODE_*
     * @returns {Uint8Array}
     */
    static encodeInvite(wadSha256, mode) {
        return new NetByteWriter().bytes(NetHex.toBytes(wadSha256)).u8(mode).toBytes();
    }

    /**
     * @returns {{wadSha256: string, mode: int}}
     */
    static decodeInvite(bytes) {
        const reader = new NetByteReader(bytes);
        const invite = {wadSha256: NetHex.fromBytes(reader.bytes(DoomNetInvite.SHA256_BYTES)), mode: reader.u8()};
        DoomNetInvite._checkEnd(reader);

        return invite;
    }

    static encodeAnswer(nickname) {
        return new NetByteWriter().ascii(nickname).toBytes();
    }

    static decodeAnswer(bytes) {
        const reader   = new NetByteReader(bytes);
        const nickname = reader.ascii();
        DoomNetInvite._checkEnd(reader);

        return nickname;
    }

    /**
     * The answer to an invite, built by the sub: refused (thrown) for another WAD.
     *
     * @param {Uint8Array} inviteBytes
     * @param {string}     wadSha256   - the sub's own WAD
     * @param {string}     nickname
     * @returns {Uint8Array}
     */
    static answerFor(inviteBytes, wadSha256, nickname) {
        if (DoomNetInvite.decodeInvite(inviteBytes).wadSha256 !== wadSha256) {
            throw new NetError(DoomNetInvite.WAD_MISMATCH, 'The invite is for another WAD');
        }

        return DoomNetInvite.encodeAnswer(nickname);
    }

    static _checkEnd(reader) {
        if (!reader.isAtEnd()) {
            throw new NetError(NetError.INVALID_CODE, 'Unexpected bytes after the pairing payload');
        }
    }
}

DoomNetInvite.SHA256_BYTES = 32;
DoomNetInvite.WAD_MISMATCH = 'wad-mismatch';
