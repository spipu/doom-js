class Object3dRendererWebGL extends Object3dRendererBase {
    get code() { return 'webgl'; }

    initCanvas(canvas) {
        return canvas.getContext('webgl');
    }

    begin(engine) {
        // TODO
    }

    draw(obj, engine) {
        // TODO
    }

    end(engine) {
        // TODO
    }
}
