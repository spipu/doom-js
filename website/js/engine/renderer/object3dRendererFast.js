class Object3dRendererFast extends Object3dRendererBase {
    constructor() {
        super();
        this._defaultFill = this._fillStyle(Object3dRendererFast.FILL_COLOR);
    }

    get code() {
        return 'fast';
    }

    draw(obj, engine) {
        const pairs = [];
        for (let k = 0; k < obj.faceCount; k++) {
            const fc    = obj.faceList[k];
            if (fc.collisionOnly === true) {
                continue;
            }
            const tris = this._faceScreenTriangles(engine, obj, fc);
            if ((tris !== null) && (tris.length === 0)) {
                continue;
            }
            const depth = (obj.pt3d[fc.pts[0]][2] + obj.pt3d[fc.pts[1]][2] + obj.pt3d[fc.pts[2]][2]) / 3;
            pairs.push([k, depth, tris]);
        }
        pairs.sort((a, b) => b[1] - a[1]);

        const tint = obj.getRenderTint();
        engine.scrCtx.fillStyle   = ((tint === null) ? this._defaultFill : this._fillStyle(tint));
        engine.scrCtx.strokeStyle = ((tint === null) ? Object3dRendererFast.LINE_COLOR : this._edgeStyle(tint));

        for (let i = 0; i < pairs.length; i++) {
            const tris = pairs[i][2];
            if (tris === null) {
                this._traceTriangle(engine.scrCtx, obj, obj.faceList[pairs[i][0]]);
                continue;
            }
            for (let t = 0; t < tris.length; t++) {
                this._traceClipped(engine.scrCtx, tris[t]);
            }
        }
    }

    _fillStyle(color) {
        return 'rgba(' + color[0] + ',' + color[1] + ',' + color[2] + ',' + Object3dRendererFast.FILL_ALPHA + ')';
    }

    // The hue of the fill, darkened: a tinted body keeps its edges readable.
    _edgeStyle(color) {
        const factor = Object3dRendererFast.TINT_EDGE_FACTOR;
        return 'rgb(' + Math.trunc(color[0] * factor) + ',' + Math.trunc(color[1] * factor) + ',' + Math.trunc(color[2] * factor) + ')';
    }
}

Object3dRendererFast.FILL_COLOR       = [250, 250, 250];
Object3dRendererFast.FILL_ALPHA       = 0.7;
Object3dRendererFast.LINE_COLOR       = '#222222';
Object3dRendererFast.TINT_EDGE_FACTOR = 0.4;
