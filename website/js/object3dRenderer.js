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
        if (!this._renderers[code].isAvailable()) {
            if (!this._renderers['full']) {
                throw new Error('Renderer "' + code + '" is not available and fallback "full" is not registered');
            }
            console.warn('Renderer "' + code + '" is not available, falling back to "full"');
            code = 'full';
        }
        this._currentCode = code;
        return this;
    }

    initCanvas(canvas) {
        return this._renderers[this._currentCode].initCanvas(canvas);
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
