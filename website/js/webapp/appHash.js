/**
 * Content hashes through Web Crypto, which only exists in a secure context
 * (HTTPS, or localhost): elsewhere every hash is null and the caller decides.
 */
class AppHash {
    /**
     * @param {ArrayBuffer|Uint8Array} bytes
     * @returns {Promise<string|null>} lowercase hexadecimal SHA-256, null without Web Crypto
     */
    static async sha256Hex(bytes) {
        if ((typeof crypto === 'undefined') || (crypto.subtle === undefined)) {
            return null;
        }
        const digest = await crypto.subtle.digest('SHA-256', bytes);

        return Array.from(new Uint8Array(digest), (byte) => byte.toString(AppHash.RADIX).padStart(AppHash.DIGITS, '0')).join('');
    }
}

AppHash.RADIX  = 16;
AppHash.DIGITS = 2;
