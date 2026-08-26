class Object3dRendererBase {
    constructor() {
        this._col       = [0, 0, 0];
        this._lightTemp = [0, 0, 0];
        this._uvOff     = [0, 0];
    }

    isAvailable() {
        return true;
    }

    // Whether this renderer reads the screen-space projection (Object3d.pt2d):
    // the CPU rasterizers do, a GPU renderer projects in its own shader and the
    // engine then skips the per-vertex pass entirely.
    needsProjection() {
        return true;
    }

    initCanvas(canvas) {
        return canvas.getContext('2d');
    }

    begin(engine) {
        engine.scrCtx.clearRect(0, 0, engine.scrWidth, engine.scrHeight);
    }

    end(engine) {
        // frame-completion hook — nothing to flush by default
    }

    // Draw a textured quad in normalised screen space (x, y top-left, w, h in
    // 0..1; y downward), over the scene without depth, tinted by light (0..1)
    // and faded by alpha (0..1, 1 = opaque). Generic 2D overlay primitive;
    // only the WebGL renderer implements it (the CPU renderers skip it, like
    // the sky).
    drawScreenSprite(engine, texId, x, y, w, h, light, alpha = 1) {
        // no-op by default
    }

    _traceTriangle(ctx, obj, fc) {
        ctx.beginPath();
        ctx.moveTo(obj.pt2d[fc.pts[0]][0], obj.pt2d[fc.pts[0]][1]);
        ctx.lineTo(obj.pt2d[fc.pts[1]][0], obj.pt2d[fc.pts[1]][1]);
        ctx.lineTo(obj.pt2d[fc.pts[2]][0], obj.pt2d[fc.pts[2]][1]);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }

    // Back-face culling: a face whose normal points away from the camera is
    // skipped. Vertices are in camera space, so the test is normal·firstVertex
    // (>= 0 means the face turns away from the eye at the origin).
    _isBackFace(normal, pt) {
        return ((normal[0] * pt[0] + normal[1] * pt[1] + normal[2] * pt[2]) >= 0);
    }

    _resolveTexId(fc, sceneMs) {
        if (fc.animTextures === null) {
            return fc.textureId;
        }
        const frameIdx = Math.floor(sceneMs / fc.animTextures.durationMs) % fc.animTextures.ids.length;
        return fc.animTextures.ids[frameIdx];
    }

    // Current UV offset of a scrolling face (uvScroll = UV fraction per second),
    // wrapped to [0,1) so the texture-repeat wrap downstream keeps full float
    // precision even after hours of scene time. Shared array, consume immediately.
    _uvScrollOffset(fc, sceneMs) {
        const off = this._uvOff;
        if (!fc.uvScroll) {
            off[0] = 0;
            off[1] = 0;
            return off;
        }
        const t = sceneMs / 1000;
        off[0] = (t * fc.uvScroll.u) % 1;
        off[1] = (t * fc.uvScroll.v) % 1;
        return off;
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

        if (col[0] < 0.) {
            col[0] = 0.;
        }
        if (col[0] > 255.) {
            col[0] = 255.;
        }
        if (col[1] < 0.) {
            col[1] = 0.;
        }
        if (col[1] > 255.) {
            col[1] = 255.;
        }
        if (col[2] < 0.) {
            col[2] = 0.;
        }
        if (col[2] > 255.) {
            col[2] = 255.;
        }

        col[0] = color[0] * col[0] / 255.;
        col[1] = color[1] * col[1] / 255.;
        col[2] = color[2] * col[2] / 255.;

        return col;
    }
}
