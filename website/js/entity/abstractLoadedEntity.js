class AbstractLoadedEntity {
    constructor(id, url, callback) {
        this._id             = id;
        this._url            = url;
        this._loaded         = false;
        this._loadedCallback = callback;
    }

    getId() {
        return this._id;
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

    _fetchJson(url, callback) {
        fetch(bootstrap.buildUrl(url))
            .then(r => {
                if (!r.ok) {
                    throw new Error('HTTP ' + r.status + ' ' + r.statusText);
                }
                return r.json();
            })
            .then(data => callback(data))
            .catch(e => console.error('Failed to load "' + url + '": ' + e));
    }
}
