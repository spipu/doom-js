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
