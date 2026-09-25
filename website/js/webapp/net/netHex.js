/**
 * Hexadecimal text ↔ bytes, for the textual fields of the compact signal and the loopback channel names.
 */
class NetHex {
    /**
     * @param {Uint8Array|number[]} bytes
     * @returns {string} lowercase, two digits per byte
     */
    static fromBytes(bytes) {
        return Array.from(bytes, byte => byte.toString(NetHex.RADIX).padStart(NetHex.DIGITS, '0')).join('');
    }

    /**
     * @param {string} hex - an even number of hexadecimal digits
     * @returns {number[]}
     */
    static toBytes(hex) {
        const bytes = [];
        for (let i = 0; i < hex.length; i += NetHex.DIGITS) {
            bytes.push(parseInt(hex.substring(i, i + NetHex.DIGITS), NetHex.RADIX));
        }
        return bytes;
    }
}

NetHex.RADIX  = 16;
NetHex.DIGITS = 2;
