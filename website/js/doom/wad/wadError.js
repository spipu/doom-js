class WadError extends Error {
    /**
     * @param {string} code - 'storage-unavailable' | 'fetch-failed' | 'invalid-format' | 'quota-exceeded' | 'not-found'
     * @param {string} message
     */
    constructor(code, message) {
        super(message);

        this.name = 'WadError';
        this._code = code;
    }

    getCode() {
        return this._code;
    }
}
