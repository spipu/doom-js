class WorldLoader {
    constructor(loadedCallback) {
        this._loadedCallback = loadedCallback;
        this.reset();
    }

    reset() {
        this._loaded = true;
        this._world  = null;
    }

    isLoaded() {
        return this._loaded;
    }

    load(url) {
        if (this._world !== null) {
            throw new Error('World is already loaded');
        }

        this._loaded = false;
        this._world = new World(0, url, () => {this._checkFullyLoaded(); });
    }

    get() {
        if (this._world === null || !this._loaded) {
            throw new Error('World is not yet loaded');
        }

        return this._world;
    }

    _checkFullyLoaded() {
        if (this._world.isLoaded()) {
            this._loaded = true;
            this._loadedCallback();
        }
    }

    finalizeInit() {
        if (!this._loaded) {
            throw new Error('Factory is not fully loaded');
        }

        if (this._world !== null) {
            this._world.finalizeInit();
        }
    }
}
