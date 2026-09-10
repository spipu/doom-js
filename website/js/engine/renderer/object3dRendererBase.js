class Object3dRendererBase {
    constructor() {
        this._col       = [0, 0, 0];
        this._lightTemp = [0, 0, 0];
        this._uvOff     = [0, 0];
        this._spriteCanvases = new WeakMap();
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

    // flat and fast keep this fixed backdrop and get no sky, by design; full and
    // webgl override it with their own scene background.
    begin(engine) {
        engine.scrCtx.fillStyle = Object3dRendererBase.BACKDROP_COLOR;
        engine.scrCtx.fillRect(0, 0, engine.scrWidth, engine.scrHeight);
    }

    end(engine) {
        // frame-completion hook — nothing to flush by default
    }

    // Draw a textured quad in normalised screen space (x, y top-left, w, h in
    // 0..1; y downward), over the scene without depth, tinted by light (0..1)
    // and faded by alpha (0..1, 1 = opaque). Shared by the canvas-2D
    // renderers; the WebGL one overrides it with its own program.
    drawScreenSprite(engine, texId, x, y, w, h, light, alpha = 1) {
        const ctx = engine.scrCtx;
        const tex = ((texId !== null) ? loader.textures().get(texId) : null);
        if (!ctx || !tex) {
            return;
        }
        // A scene-wide light floor or flash boost must reach the sprite too.
        let lit = Math.max(light, (engine.lightOverride ?? 0));
        if (lit < 1) {
            lit = Math.min(1, lit + engine.lightBoost);
        }
        ctx.save();
        // Never filtered: these renderers sample their texels nearest-neighbour.
        ctx.imageSmoothingEnabled = false;
        ctx.globalAlpha = alpha;
        ctx.filter      = 'brightness(' + lit + ')';
        ctx.drawImage(
            this._spriteCanvas(tex),
            x * engine.scrWidth,
            y * engine.scrHeight,
            w * engine.scrWidth,
            h * engine.scrHeight
        );
        ctx.restore();
    }

    // drawImage needs a canvas, never the ImageData the loader holds. Straight
    // alpha, unlike the WebGL upload: the browser composites it.
    _spriteCanvas(tex) {
        if (this._spriteCanvases.has(tex)) {
            return this._spriteCanvases.get(tex);
        }
        const canvas  = document.createElement('canvas');
        canvas.width  = tex.width;
        canvas.height = tex.height;
        canvas.getContext('2d').putImageData(new ImageData(tex.data, tex.width, tex.height), 0, 0);
        this._spriteCanvases.set(tex, canvas);

        return canvas;
    }

    // Where the segment va→vb crosses the near plane, as {t, cx, cy, sx, sy}:
    // index-free, so every vertex layout can use it.
    _nearCrossing(engine, za, cxa, cya, zb, cxb, cyb) {
        const zNear = engine.zBuffer.getNear();
        const t     = (zNear - za) / (zb - za);
        const cx    = cxa + t * (cxb - cxa);
        const cy    = cya + t * (cyb - cya);

        return {
            t,
            cx,
            cy,
            sx: Math.trunc(engine.projScaleX * cx / zNear - engine.projOffsetX),
            sy: Math.trunc(-engine.projScaleY * cy / zNear - engine.projOffsetY)
        };
    }

    // Position-only layout [sx, sy, cz, cx, cy], enough for the renderers that
    // interpolate nothing else. Overridden by those carrying more channels.
    _clipVertex(engine, va, vb) {
        const c = this._nearCrossing(engine, va[2], va[3], va[4], vb[2], vb[3], vb[4]);

        return [c.sx, c.sy, engine.zBuffer.getNear(), c.cx, c.cy];
    }

    // Sutherland-Hodgman near clip of one triangle, into 0, 1 or 2 triangles:
    // layout-agnostic, the depth sits at index 2 and _clipVertex packs the
    // vertices it creates.
    _clipNear(engine, v0, v1, v2) {
        const zNear  = engine.zBuffer.getNear();
        const verts  = [v0, v1, v2];
        const inside = [(v0[2] >= zNear), (v1[2] >= zNear), (v2[2] >= zNear)];
        const cnt    = inside.filter(Boolean).length;

        if (cnt === 3) {
            return [[v0, v1, v2]];
        }
        if (cnt === 0) {
            return [];
        }

        if (cnt === 1) {
            const i = inside.indexOf(true);
            const j = (i + 1) % 3;
            const k = (i + 2) % 3;
            return [[
                verts[i],
                this._clipVertex(engine, verts[i], verts[j]),
                this._clipVertex(engine, verts[i], verts[k]),
            ]];
        }

        // cnt === 2 : quad → 2 triangles
        const iOut = inside.indexOf(false);
        const iIn1 = (iOut + 1) % 3;
        const iIn2 = (iOut + 2) % 3;
        const a = this._clipVertex(engine, verts[iOut], verts[iIn1]);
        const b = this._clipVertex(engine, verts[iOut], verts[iIn2]);
        return [
            [verts[iIn1], verts[iIn2], a],
            [verts[iIn2], b, a],
        ];
    }

    // Face corner in the position-only layout above.
    _positionVertex(obj, fc, idx) {
        const pt3d = obj.pt3d[fc.pts[idx]];
        const pt2d = obj.pt2d[fc.pts[idx]];

        return [pt2d[0], pt2d[1], pt3d[2], pt3d[0], pt3d[1]];
    }

    // Near-clipped triangles of a face, null when the whole face is in front —
    // the common case, drawn straight from pt2d with nothing allocated — and
    // empty when it is entirely behind.
    _faceScreenTriangles(engine, obj, fc) {
        const zNear = engine.zBuffer.getNear();
        if ((obj.pt3d[fc.pts[0]][2] >= zNear)
            && (obj.pt3d[fc.pts[1]][2] >= zNear)
            && (obj.pt3d[fc.pts[2]][2] >= zNear)) {
            return null;
        }

        return this._clipNear(
            engine,
            this._positionVertex(obj, fc, 0),
            this._positionVertex(obj, fc, 1),
            this._positionVertex(obj, fc, 2)
        );
    }

    // Clipped triangle, its vertices carrying their own screen x/y.
    _traceClipped(ctx, tri) {
        this._tracePath(ctx, tri[0], tri[1], tri[2]);
    }

    _traceTriangle(ctx, obj, fc) {
        this._tracePath(ctx, obj.pt2d[fc.pts[0]], obj.pt2d[fc.pts[1]], obj.pt2d[fc.pts[2]]);
    }

    // Points are read by index, so any [x, y, …] layout fits.
    _tracePath(ctx, p0, p1, p2) {
        ctx.beginPath();
        ctx.moveTo(p0[0], p0[1]);
        ctx.lineTo(p1[0], p1[1]);
        ctx.lineTo(p2[0], p2[1]);
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

    // Per-frame UV offset of a face: the time scroll (wrapped to [0,1) so the
    // texture-repeat wrap downstream keeps full float precision) plus the
    // anchor following a named instance's vertical shift. Shared array.
    _uvOffset(fc, sceneMs) {
        const off = this._uvOff;
        off[0] = 0;
        off[1] = 0;
        if (fc.uvScroll) {
            const t = sceneMs / 1000;
            off[0] = (t * fc.uvScroll.u) % 1;
            off[1] = (t * fc.uvScroll.v) % 1;
        }
        if (fc.uvAnchor !== null) {
            const anchor = fc.uvAnchor;
            if (anchor.instance === null) {
                const id = loader.instances().idByCode(anchor.code);
                anchor.instance = ((id !== null) ? loader.instances().get(id) : null);
            }
            if (anchor.instance !== null) {
                off[1] += anchor.instance.getVerticalShift() * anchor.v;
            }
        }
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

// Backdrop of the canvas-2D renderers that paint no scene background: a fixed
// neutral grey, deliberately not the engine background and no sky.
Object3dRendererBase.BACKDROP_COLOR = '#666666';
