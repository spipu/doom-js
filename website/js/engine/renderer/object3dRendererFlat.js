class Object3dRendererFlat extends Object3dRendererBase {
    constructor() {
        super();
        this._center = [0, 0, 0, 1];
    }

    get code() {
        return 'flat';
    }

    // The lighting of a face is the expensive part here, so a face is culled
    // and clipped BEFORE its colour is resolved.
    draw(obj, engine) {
        const tint = obj.getRenderTint();
        for (const faceIndices of [obj.opaqueFaces, obj.alphaFaces]) {
            for (const k of faceIndices) {
                const fc = obj.faceList[k];
                if (this._isBackFace(fc.normal, obj.pt3d[fc.pts[0]])) {
                    continue;
                }
                const tris = this._faceScreenTriangles(engine, obj, fc);
                if ((tris !== null) && (tris.length === 0)) {
                    continue;
                }
                this._pushTriangles(obj, fc, tris, this._faceStyleId(engine, obj, fc, tint));
            }
        }
    }

    // Flat shading: one colour for the whole face, lit from its centre. Faces
    // that end up the same colour share a style slot, which keeps the runs of
    // the sorted draw pass long.
    _faceStyleId(engine, obj, fc, tint) {
        const baseColor = (tint ?? ((fc.textureId !== null) ? [255, 255, 255] : fc.color));
        const col = this._pointColor(engine, baseColor, this._faceCenter(obj, fc), fc.normal);
        const r   = Math.trunc(col[0]);
        const g   = Math.trunc(col[1]);
        const b   = Math.trunc(col[2]);
        const key = (r << 16) | (g << 8) | b;
        const id  = this._styleSlot(key);
        if (id !== -1) {
            return id;
        }
        const css = 'rgb(' + r + ',' + g + ',' + b + ')';

        return this._addStyle(key, css, css);
    }

    _faceCenter(obj, fc) {
        const center = this._center;
        for (let i = 0; i < 3; i++) {
            center[i] = (obj.pt3d[fc.pts[0]][i] + obj.pt3d[fc.pts[1]][i] + obj.pt3d[fc.pts[2]][i]) / 3;
        }

        return center;
    }
}
