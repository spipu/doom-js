class Object3dRendererFlat extends Object3dRendererBase {
    get code() {
        return 'flat';
    }

    begin(engine) {
        engine.scrCtx.clearRect(0, 0, engine.scrWidth, engine.scrHeight);
    }

    end(engine) {
    }

    _collectFaces(obj, engine, faceIndices) {
        const result = [];
        for (const k of faceIndices) {
            const fc     = obj.faceList[k];
            const normal = fc.normal;
            const p      = obj.pt3d[fc.pts[0]];
            if (normal[0]*p[0] + normal[1]*p[1] + normal[2]*p[2] >= 0) continue;
            const center = [
                (obj.pt3d[fc.pts[0]][0] + obj.pt3d[fc.pts[1]][0] + obj.pt3d[fc.pts[2]][0]) / 3,
                (obj.pt3d[fc.pts[0]][1] + obj.pt3d[fc.pts[1]][1] + obj.pt3d[fc.pts[2]][1]) / 3,
                (obj.pt3d[fc.pts[0]][2] + obj.pt3d[fc.pts[1]][2] + obj.pt3d[fc.pts[2]][2]) / 3,
                1,
            ];
            const baseColor = (fc.textureId !== null) ? [255, 255, 255] : fc.color;
            const col = this._pointColor(engine, baseColor, center, normal);
            const depth = (obj.pt3d[fc.pts[0]][2] + obj.pt3d[fc.pts[1]][2] + obj.pt3d[fc.pts[2]][2]) / 3;
            result.push({ k, r: Math.trunc(col[0]), g: Math.trunc(col[1]), b: Math.trunc(col[2]), depth });
        }
        result.sort((a, b) => b.depth - a.depth);
        return result;
    }

    _drawFaces(obj, engine, faces) {
        for (const face of faces) {
            const fc = obj.faceList[face.k];
            const color = 'rgb(' + face.r + ',' + face.g + ',' + face.b + ')';
            engine.scrCtx.fillStyle   = color;
            engine.scrCtx.strokeStyle = color;
            engine.scrCtx.beginPath();
            engine.scrCtx.moveTo(obj.pt2d[fc.pts[0]][0], obj.pt2d[fc.pts[0]][1]);
            engine.scrCtx.lineTo(obj.pt2d[fc.pts[1]][0], obj.pt2d[fc.pts[1]][1]);
            engine.scrCtx.lineTo(obj.pt2d[fc.pts[2]][0], obj.pt2d[fc.pts[2]][1]);
            engine.scrCtx.closePath();
            engine.scrCtx.fill();
            engine.scrCtx.stroke();
        }
    }

    draw(obj, engine) {
        this._drawFaces(obj, engine, this._collectFaces(obj, engine, obj._opaqueFaces));
        this._drawFaces(obj, engine, this._collectFaces(obj, engine, obj._alphaFaces));
    }
}
