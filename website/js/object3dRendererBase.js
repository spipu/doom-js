class Object3dRendererBase {
    constructor() {
        this._col       = [0, 0, 0];
        this._lightTemp = [0, 0, 0];
    }

    isAvailable() {
        return true;
    }

    initCanvas(canvas) {
        return canvas.getContext('2d');
    }

    _pointColor(engine, color, pt, normal) {
        const col = this._col;
        col[0] = engine.ambientLight[0];
        col[1] = engine.ambientLight[1];
        col[2] = engine.ambientLight[2];

        const tmp = this._lightTemp;
        for (let k = 0; k < engine.lightList.length; k++) {
            engine.lightList[k].getColorFor(pt, normal, tmp);
            col[0] += tmp[0];
            col[1] += tmp[1];
            col[2] += tmp[2];
        }

        if (col[0] < 0.) col[0] = 0.; if (col[0] > 255.) col[0] = 255.;
        if (col[1] < 0.) col[1] = 0.; if (col[1] > 255.) col[1] = 255.;
        if (col[2] < 0.) col[2] = 0.; if (col[2] > 255.) col[2] = 255.;

        col[0] = color[0] * col[0] / 255.;
        col[1] = color[1] * col[1] / 255.;
        col[2] = color[2] * col[2] / 255.;

        return col;
    }
}
