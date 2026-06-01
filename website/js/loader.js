class Loader {
    constructor() {
        this._loaders = {
            instance: new InstanceFactory(),
            object3d: new Object3dLoader(),
            texture:  new TextureLoader(),
        };

        this._loaded     = false;
        this._callback  = null;
    }

    reset() {
        Object.values(this._loaders).forEach(e => e.reset());
    }

    _checkFullyLoaded() {
        if (this._entities.every(e => e.isLoaded())) {
            this._loaded = true;
            this._loadedCallback();
        }
    }

    get(code) {
        return this.loaders[code];
    }

    setCallback(fn) {
        this._finalCallback = fn;
        if (this.fullyLoaded) {
            fn();
        }
    }

    reset() {
        this.loaded         = {};
        this.fullyLoaded    = false;
        this._callbacks     = [];
        this._finalCallback = null;
    }

    loadingStarted(key) {
        this.loaded[key] = false;
        this.fullyLoaded = false;
    }

    loadingReset(key) {
        delete this.loaded[key];
        this._checkFullyLoaded();
    }

    loadingFinished(key) {
        this.loaded[key] = true;
        this._checkFullyLoaded();
    }

    _checkFullyLoaded() {
        if (this.fullyLoaded) {
            return;
        }
        if (Object.keys(this.loaded).length > 0 && Object.values(this.loaded).every(v => v)) {
            this.fullyLoaded = true;
            this._callbacks.forEach(fn => fn());
            if (this._finalCallback) {
                this._finalCallback();
            }
        }
    }
}

var loader = new Loader();
