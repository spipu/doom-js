/**
 * Content hashes: SHA-256 and SHA-1 through Web Crypto, which only exists in a secure
 * context (HTTPS, or localhost) and is null elsewhere; FNV-1a, synchronous and
 * always available, for seeds that are not a security matter.
 */
class AppHash {
    /**
     * @param {ArrayBuffer|Uint8Array} bytes
     * @returns {Promise<string|null>} lowercase hexadecimal SHA-256, null without Web Crypto
     */
    static async sha256Hex(bytes) {
        return AppHash._digestHex('SHA-256', bytes);
    }

    /**
     * @param {ArrayBuffer|Uint8Array} bytes
     * @returns {Promise<string|null>} lowercase hexadecimal SHA-1, null without Web Crypto
     */
    static async sha1Hex(bytes) {
        return AppHash._digestHex('SHA-1', bytes);
    }

    static async _digestHex(algorithm, bytes) {
        if ((typeof crypto === 'undefined') || (crypto.subtle === undefined)) {
            return null;
        }
        const digest = await crypto.subtle.digest(algorithm, bytes);

        return Array.from(new Uint8Array(digest), (byte) => byte.toString(AppHash.RADIX).padStart(AppHash.DIGITS, '0')).join('');
    }

    /**
     * @param {Uint8Array} bytes
     * @returns {int} 32-bit FNV-1a, unsigned
     */
    static fnv1a32(bytes) {
        let hash = AppHash.FNV_OFFSET_BASIS;
        for (const byte of bytes) {
            hash = Math.imul(hash ^ byte, AppHash.FNV_PRIME);
        }

        return (hash >>> 0);
    }
}

AppHash.RADIX  = 16;
AppHash.DIGITS = 2;

// FNV-1a 32-bit parameters (www.isthe.com/chongo/tech/comp/fnv).
AppHash.FNV_OFFSET_BASIS = 0x811c9dc5;
AppHash.FNV_PRIME        = 0x01000193;
