class AbstractLoader {
    constructor(factoryName, loadedCallback) {
        this._factoryName    = factoryName;
        this._loadedCallback = loadedCallback;
        this.reset();
    }

    reset() {
        this._loaded       = true;
        this._entities     = [];
        this._codeRegistry = {};
        this._loadedFiles  = {};
    }

    isLoaded() {
        return this._loaded;
    }

    loadByCode(code, url) {
        if (this._codeRegistry[code] !== undefined) {
            throw this._generateException('Code [' + code + '] is already registered');
        }

        const id = this.load(url);
        if ((this._entities[id]._code !== null) && (this._entities[id]._code !== code)) {
            throw this._generateException('Url [' + url + '] is already registered as [' + this._entities[id]._code + ']');
        }
        this._codeRegistry[code] = id;
        this._entities[id]._code = code;
    }

    getByCode(code) {
        if (this._codeRegistry[code] === undefined) {
            throw this._generateException('Code [' + code + '] is not registered');
        }

        return this.get(this._codeRegistry[code]);
    }

    // null instead of getByCode's throw, to deduplicate before loading
    idByCode(code) {
        return (this._codeRegistry[code] ?? null);
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
            () => this._checkFullyLoaded()
        );

        if (url !== null) {
            this._initialiseEntityFromUrl(entity);
        }

        this._entities[entity.getId()] = entity;
        this._loadedFiles[url] = entity.getId();
        return entity.getId();
    }

    loadFromData(code, data) {
        const entity = this._create(this._entities.length, null, () => this._checkFullyLoaded());
        this._registerNewEntity(code, entity);
        this._populateFromData(entity, data);
        entity.setLoaded();

        return entity.getId();
    }

    // Runtime spawn finalising only this entity: the global load check would
    // re-run finalizeInit everywhere and rebuild the world collision.
    spawnFromData(code, data) {
        const entity = this._create(this._entities.length, null, () => {});
        this._registerNewEntity(code, entity);
        this._populateFromData(entity, data);
        entity.setLoaded();
        this._loaded = true;
        entity.finalizeInit();
        return entity.getId();
    }

    _registerNewEntity(code, entity) {
        if ((code !== null) && (this._codeRegistry[code] !== undefined)) {
            throw this._generateException('Code [' + code + '] is already registered');
        }
        this._loaded = false;
        this._entities[entity.getId()] = entity;
        if (code !== null) {
            this._codeRegistry[code] = entity.getId();
            entity.setCode(code);
        }
        return entity;
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
        appBootstrap.fetchJson(
            entity.getUrl(),
            (data) => {
                this._populateFromData(entity, data);
                entity.setLoaded();
            }
        );
    }

    _populateFromData(entity, data) {
        throw this._generateException('Not implemented');
    }

    // Id already loaded from this URL, or null
    _alreadyLoaded(url) {
        return (((url !== null) && (this._loadedFiles[url] !== undefined)) ? this._loadedFiles[url] : null);
    }

    _checkFullyLoaded() {
        if (this._entities.every((e) => e.isLoaded())) {
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

    _generateException(message) {
        return new Error(this._factoryName + ' - ' + message);
    }
}
