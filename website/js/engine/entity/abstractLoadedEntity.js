class AbstractLoadedEntity {
    constructor(id, url, callback) {
        this._id             = id;
        this._url            = url;
        this._code           = null;
        this._loaded         = false;
        this._loadedCallback = callback;
    }

    getId() {
        return this._id;
    }

    /**
     * Registry name of the entity, set by the loader that registers it (an
     * entity loaded by URL alone keeps a null code).
     *
     * @param {string|null} code
     */
    setCode(code) {
        this._code = code;
        return this;
    }

    getCode() {
        return this._code;
    }

    getUrl() {
        return this._url;
    }

    isLoaded() {
        return this._loaded;
    }

    setLoaded() {
        this._loaded = true;
        this._loadedCallback();
    }

    finalizeInit() {
    }
}
