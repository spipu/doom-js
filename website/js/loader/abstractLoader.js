class AbstractLoader {
    constructor(factoryName, loadedCallback) {
        this._factoryName    = factoryName;
        this._loadedCallback = loadedCallback;
        this.reset();
    }

    reset() {
        this._debug('reset');
        this._loaded       = true;
        this._entities     = [];
        this._codeRegistry = {};
    }

    isLoaded() {
        return this._loaded;
    }

    loadByCode(code, url) {
        if (this._codeRegistry[code] !== undefined) {
            throw this._generateException('Code [' + code + '] is already registered');
        }

        this._codeRegistry[code] = this.load(url);
    }

    getByCode(code) {
        if (this._codeRegistry[code] === undefined) {
            throw this._generateException('Code [' + code + '] is not registered');
        }

        return this.get(this._codeRegistry[code]);
    }

    load(url) {
        const existingId = this._alreadyLoaded(url);
        if (existingId !== null) {
            return existingId;
        }

        this._loaded = false;
        const entity = this._create(
            this._entities.length,
            url,
            () => {this._checkFullyLoaded(); }
        );

        if (url !== null) {
            this._initialiseEntityFromUrl(entity);
        }

        this._entities[entity.getId()] = entity;
        return entity.getId();
    }

    get(id) {
        if (!this._loaded) {
            throw this._generateException('Loader is not ready');
        }

        return this._entities[id];
    }

    getAll() {
        if (!this._loaded) {
            throw this._generateException('Loader is not ready');
        }
        return this._entities;
    }

    _create(id, url, callback) {
        throw this._generateException('Not implemented');
    }

    _initialiseEntityFromUrl(entity) {
        throw this._generateException('Not implemented');
    }

    _alreadyLoaded(url) {
        throw this._generateException('Not implemented');
    }

    _checkFullyLoaded() {
        if (this._entities.every(e => e.isLoaded())) {
            this._debug('loaded');
            this._loaded = true;
            this._loadedCallback();
        }
    }

    finalizeInit() {
        if (!this._loaded) {
            throw this._generateException('Factory is not fully loaded');
        }

        for (let i = 0; i < this._entities.length; i++) {
            this._entities[i].finalizeInit();
        }
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

    _generateException(message) {
        return new Error(this._factoryName + ' - ' + message);
    }

    _debug(message) {
        console.log(this._factoryName + ' - ' + message);
    }
}
