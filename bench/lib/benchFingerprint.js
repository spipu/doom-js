/**
 * Stable fingerprints of plain values: Maps and Sets become arrays, typed
 * arrays plain ones, -0 becomes 0, and the JSON is hashed with SHA-256.
 */
const crypto = require('crypto');

class BenchFingerprint {
    static normalize(value) {
        if ((value === null) || (typeof value !== 'object')) {
            return ((typeof value === 'number') ? BenchFingerprint._number(value) : value);
        }
        if (Array.isArray(value)) {
            return value.map((v) => BenchFingerprint.normalize(v));
        }
        if (ArrayBuffer.isView(value)) {
            return Array.from(value, (v) => BenchFingerprint._number(v));
        }
        if (value instanceof Map) {
            return [...value.entries()].map(([k, v]) => [BenchFingerprint.normalize(k), BenchFingerprint.normalize(v)]);
        }
        if (value instanceof Set) {
            return [...value].map((v) => BenchFingerprint.normalize(v));
        }
        const out = {};
        for (const key of Object.keys(value)) {
            out[key] = BenchFingerprint.normalize(value[key]);
        }

        return out;
    }

    static json(value) {
        return JSON.stringify(BenchFingerprint.normalize(value));
    }

    static sha(value) {
        return crypto.createHash(BenchFingerprint.HASH).update(BenchFingerprint.json(value)).digest('hex');
    }

    /**
     * @param {Uint8Array[]} arrays
     * @returns {string}
     */
    static shaOfBytes(arrays) {
        const hash = crypto.createHash(BenchFingerprint.HASH);
        arrays.forEach((a) => hash.update(a));

        return hash.digest('hex');
    }

    static _number(v) {
        if (Object.is(v, -0)) {
            return 0;
        }
        if (!Number.isFinite(v)) {
            return String(v);
        }

        return v;
    }
}

BenchFingerprint.HASH = 'sha256';

module.exports = {BenchFingerprint};
