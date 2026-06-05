class Loader {
    constructor() {
        this._callback = null;
        this._loaded   = false;
        this._textureLoader      = new TextureLoader(() => {this._checkFullyLoaded(); });
        this._object3dLoader     = new Object3dLoader(() => {this._checkFullyLoaded(); });
        this._instanceLoader     = new InstanceLoader(() => {this._checkFullyLoaded(); });
        this._interactionLoader  = new InteractionLoader(() => {this._checkFullyLoaded(); });
        this._worldLoader        = new WorldLoader(() => {this._checkFullyLoaded(); });
    }

    reset() {
        this._loaded   = false;
        this._callback = null;
        this._worldLoader.reset();
        this._interactionLoader.reset();
        this._instanceLoader.reset();
        this._object3dLoader.reset();
        this._textureLoader.reset();
    }

    setCallback(callback) {
        this._callback = callback;
        if (this._loaded) {
            callback();
        }
    }

    instances() {
        return this._instanceLoader;
    }

    interactions() {
        return this._interactionLoader;
    }

    objects() {
        return this._object3dLoader;
    }

    textures() {
        return this._textureLoader;
    }

    world() {
        return this._worldLoader;
    }

    _checkFullyLoaded() {
        if (!this._instanceLoader.isLoaded()) {
            return false;
        }
        if (!this._interactionLoader.isLoaded()) {
            return false;
        }
        if (!this._object3dLoader.isLoaded()) {
            return false;
        }
        if (!this._textureLoader.isLoaded()) {
            return false;
        }
        if (!this._worldLoader.isLoaded()) {
            return false;
        }

        this._textureLoader.finalizeInit();
        this._object3dLoader.finalizeInit();
        this._instanceLoader.finalizeInit();
        this._interactionLoader.finalizeInit();
        this._worldLoader.finalizeInit();

        this._loaded = true;

        if (this._callback) {
            this._callback();
        }
    }
}

var loader = new Loader();
