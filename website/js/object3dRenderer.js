class Object3dRenderer {
    constructor() {
        this._renderers   = {};
        this._currentCode = null;
    }

    addRenderer(renderer) {
        this._renderers[renderer.code] = renderer;
        if (!this._currentCode) this._currentCode = renderer.code;
        return this;
    }

    setRenderer(code) {
        if (!this._renderers[code]) {
            throw new Error('Unknown renderer: "' + code + '"');
        }
        this._currentCode = code;
        return this;
    }

    get currentCode() {
        return this._currentCode;
    }

    begin(engine) {
        this._renderers[this._currentCode].begin(engine);
    }

    end(engine) {
        this._renderers[this._currentCode].end(engine);
    }

    draw(obj, engine) {
        this._renderers[this._currentCode].draw(obj, engine);
    }
}
