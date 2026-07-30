class WadError extends Error {
    /**
     * @param {string}      code    - 'storage-unavailable' | 'fetch-failed' | 'fetch-offline'
     *                        | 'fetch-blocked' | 'fetch-http' | 'invalid-format'
     *                        | 'quota-exceeded' | 'not-found'
     * @param {string}      message - English, console-bound
     * @param {string|null} detail  - factual fragment the UI appends to its own
     *                        translated message (an HTTP status, the refusing host)
     */
    constructor(code, message, detail = null) {
        super(message);

        this.name = 'WadError';
        this._code = code;
        this._detail = detail;
    }

    getCode() {
        return this._code;
    }

    getDetail() {
        return this._detail;
    }
}
