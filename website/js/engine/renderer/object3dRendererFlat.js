class Object3dRendererFlat extends Object3dRendererBase {
    constructor() {
        super();
        this._center    = [0, 0, 0, 1];
        this._baseColor = [0, 0, 0];
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
        const baseColor = this._faceBaseColor(fc, tint, engine.sceneMs);
        const col = this._pointColor(engine, baseColor, this._faceCenter(obj, fc), fc.normal);
        // Same two multipliers as full and webgl: the live factor of the face's
        // light group, and the light of the instance being drawn. A tinted body
        // dims with the room like everything else.
        const light = obj.getFaceLightFactor(fc) * engine.instanceLight;
        const r     = Math.trunc(col[0] * light);
        const g     = Math.trunc(col[1] * light);
        const b     = Math.trunc(col[2] * light);
        const key = (r << 16) | (g << 8) | b;
        const id  = this._styleSlot(key);
        if (id !== -1) {
            return id;
        }
        const css = 'rgb(' + r + ',' + g + ',' + b + ')';

        return this._addStyle(key, css, css);
    }

    // No texture is drawn here, so a face wears its tint, or the average colour
    // of the texture it carries — dimmed either way by its own light
    // multiplier, which fcAdd normalised to 0..1 for a textured face and left
    // in 0..255 for the others. That multiplier is where a map thing keeps the
    // brightness of the sector it stands in.
    _faceBaseColor(fc, tint, sceneMs) {
        const texId = this._resolveTexId(fc, sceneMs);
        const tex   = ((texId !== null) ? loader.textures().get(texId) : undefined);
        if (tex === undefined) {
            return (tint ?? fc.color);
        }
        const source = (tint ?? tex.getAverageColor());
        const base   = this._baseColor;
        base[0] = source[0] * fc.color[0];
        base[1] = source[1] * fc.color[1];
        base[2] = source[2] * fc.color[2];

        return base;
    }

    _faceCenter(obj, fc) {
        const center = this._center;
        for (let i = 0; i < 3; i++) {
            center[i] = (obj.pt3d[fc.pts[0]][i] + obj.pt3d[fc.pts[1]][i] + obj.pt3d[fc.pts[2]][i]) / 3;
        }

        return center;
    }
}
