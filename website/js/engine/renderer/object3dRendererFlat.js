class Object3dRendererFlat extends Object3dRendererBase {
    get code() {
        return 'flat';
    }

    _collectFaces(obj, engine, faceIndices) {
        const result = [];
        const tint   = obj.getRenderTint();
        for (const k of faceIndices) {
            const fc     = obj.faceList[k];
            const normal = fc.normal;
            const p      = obj.pt3d[fc.pts[0]];
            if (this._isBackFace(normal, p)) {
                continue;
            }
            const tris = this._faceScreenTriangles(engine, obj, fc);
            if ((tris !== null) && (tris.length === 0)) {
                continue;
            }
            const center = [
                (obj.pt3d[fc.pts[0]][0] + obj.pt3d[fc.pts[1]][0] + obj.pt3d[fc.pts[2]][0]) / 3,
                (obj.pt3d[fc.pts[0]][1] + obj.pt3d[fc.pts[1]][1] + obj.pt3d[fc.pts[2]][1]) / 3,
                (obj.pt3d[fc.pts[0]][2] + obj.pt3d[fc.pts[1]][2] + obj.pt3d[fc.pts[2]][2]) / 3,
                1,
            ];
            const baseColor = (tint ?? ((fc.textureId !== null) ? [255, 255, 255] : fc.color));
            const col = this._pointColor(engine, baseColor, center, normal);
            const depth = (obj.pt3d[fc.pts[0]][2] + obj.pt3d[fc.pts[1]][2] + obj.pt3d[fc.pts[2]][2]) / 3;
            result.push({ k, r: Math.trunc(col[0]), g: Math.trunc(col[1]), b: Math.trunc(col[2]), depth, tris });
        }
        result.sort((a, b) => b.depth - a.depth);
        return result;
    }

    _drawFaces(obj, engine, faces) {
        for (const face of faces) {
            const color = 'rgb(' + face.r + ',' + face.g + ',' + face.b + ')';
            engine.scrCtx.fillStyle   = color;
            engine.scrCtx.strokeStyle = color;
            if (face.tris === null) {
                this._traceTriangle(engine.scrCtx, obj, obj.faceList[face.k]);
                continue;
            }
            for (let t = 0; t < face.tris.length; t++) {
                this._traceClipped(engine.scrCtx, face.tris[t]);
            }
        }
    }

    draw(obj, engine) {
        this._drawFaces(obj, engine, this._collectFaces(obj, engine, obj.opaqueFaces));
        this._drawFaces(obj, engine, this._collectFaces(obj, engine, obj.alphaFaces));
    }
}
