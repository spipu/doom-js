class Object3dRendererFast extends Object3dRendererBase {
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

        engine.scrCtx.fillStyle   = Object3dRendererFast.FILL_COLOR;
        engine.scrCtx.strokeStyle = Object3dRendererFast.LINE_COLOR;

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
}

Object3dRendererFast.FILL_COLOR = 'rgba(250,250,250,0.7)';
Object3dRendererFast.LINE_COLOR = '#222222';
