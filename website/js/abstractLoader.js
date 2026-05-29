class AbstractLoader {
    constructor() {
        this._loadedCallback = null;
        this._loaded = false;
    }

    setLoadedCallback(callback) {
        this._loadedCallback = callback;
        if (this._loaded) {
            this._executeLoadedCallback();
        }
    }

    isLoaded() {
        return this._loaded;
    }

    _resetIsLoaded() {
        this._loaded = false;
    }

    _executeLoadedCallback() {
        this._loaded = true;
        if (this._loadedCallback) {
            this._loadedCallback();
            this._loadedCallback = null;
        }
    }

    _fetchJson(url, callback) {
        fetch(loader.buildUrl(url))
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
