class Object3dRendererFull extends Object3dRendererBase {
    constructor() {
        super();
        this._p1 = new Array(10);
        this._p2 = new Array(10);
        this._p3 = new Array(10);
        this._v0 = new Array(10);
        this._v1 = new Array(10);
        this._v2 = new Array(10);
        // Preallocated: the scanline loop must not allocate.
        this._dt12  = new Float64Array(8);
        this._dt23  = new Float64Array(8);
        this._dt13  = new Float64Array(8);
        this._lt0   = new Float64Array(8);
        this._lt1   = new Float64Array(8);
        this._image = null;   // ImageData reused across frames
        this._data  = null;
        this._depth = null;
        this._near  = 0;
        this._far   = 0;
    }

    get code() {
        return 'full';
    }

    // Own projection in _buildVertex, pt2d is not needed.
    needsProjection() {
        return false;
    }

    begin(engine) {
        engine.zBuffer.clear(engine.scrWidth, engine.scrHeight);
        if ((this._image === null) || (this._image.width !== engine.scrWidth) || (this._image.height !== engine.scrHeight)) {
            this._image = engine.scrCtx.createImageData(engine.scrWidth, engine.scrHeight);
        } else {
            this._image.data.fill(0);
        }
        engine.scrData = this._image;
        this._data  = this._image.data;
        this._depth = engine.zBuffer.getDepths();
        this._near  = engine.zBuffer.getNear();
        this._far   = engine.zBuffer.getFar();
    }

    end(engine) {
        engine.scrCtx.putImageData(engine.scrData, 0, 0);
    }

    draw(obj, engine) {
        for (const faceIndices of [obj.opaqueFaces, obj.alphaFaces]) {
            for (const k of faceIndices) {
                const fc = obj.faceList[k];
                if (this._isBackFace(fc.normal, obj.pt3d[fc.pts[0]])) {
                    continue;
                }

                this._buildVertex(this._v0, engine, fc, obj, 0);
                this._buildVertex(this._v1, engine, fc, obj, 1);
                this._buildVertex(this._v2, engine, fc, obj, 2);

                const tris          = this._clipNear(engine, this._v0, this._v1, this._v2);
                const resolvedTexId = this._resolveTexId(fc, engine.sceneMs);
                const texture       = ((resolvedTexId !== null) ? loader.textures().get(resolvedTexId) : null);
                const alpha         = fc.alpha;
                const clampV        = (fc.clampV || false);
                const blendAdd      = (fc.blendAdd === true);

                for (const tri of tris) {
                    const s0 = tri[0], s1 = tri[1], s2 = tri[2];
                    const p1 = this._p1, p2 = this._p2, p3 = this._p3;
                    for (let i = 0; i < 10; i++) {
                        p1[i] = s0[i];
                        p2[i] = s1[i];
                        p3[i] = s2[i];
                    }
                    this._sortVertices();
                    this._rasterize(engine, alpha, texture, clampV, blendAdd);
                }
            }
        }
    }

    // Vertex layout: [sx, sy, cz, r, g, b, u, v, cx, cy]; the camera-space
    // cx, cy only serve the near clip. sx/sy are projected here without the
    // integer rounding of pt2d: rounded, a vertex sitting on a neighbour's
    // edge drifts off it and opens a one-pixel hole.
    _buildVertex(out, engine, fc, obj, idx) {
        const ptIdx       = fc.pts[idx];
        const col         = this._pointColor(engine, fc.color, obj.pt3d[ptIdx], fc.normal);
        const pt3d        = obj.pt3d[ptIdx];
        const scroll      = this._uvOffset(fc, engine.sceneMs);
        const lightFactor = obj.getFaceLightFactor(fc) * engine.instanceLight;
        const z           = Math.max(pt3d[2], Object3dRendererFull.PROJECTION_MIN_Z);
        out[0] = engine.projScaleX * pt3d[0] / z - engine.projOffsetX;
        out[1] = -engine.projScaleY * pt3d[1] / z - engine.projOffsetY;
        out[2] = pt3d[2];
        out[3] = col[0] * lightFactor;  out[4] = col[1] * lightFactor;  out[5] = col[2] * lightFactor;
        out[6] = fc.map[idx][0] + scroll[0]; out[7] = fc.map[idx][1] + scroll[1];
        out[8] = pt3d[0]; out[9] = pt3d[1];
    }

    // Crossing geometry from the base; this only adds the colour and UV channels
    // of the layout above.
    _clipVertex(engine, va, vb) {
        const c     = this._nearCrossing(engine, va[2], va[8], va[9], vb[2], vb[8], vb[9]);
        const t     = c.t;
        const zNear = engine.zBuffer.getNear();
        return [
            engine.projScaleX * c.cx / zNear - engine.projOffsetX,
            -engine.projScaleY * c.cy / zNear - engine.projOffsetY,
            zNear,
            va[3] + t * (vb[3] - va[3]),
            va[4] + t * (vb[4] - va[4]),
            va[5] + t * (vb[5] - va[5]),
            va[6] + t * (vb[6] - va[6]),
            va[7] + t * (vb[7] - va[7]),
            c.cx, c.cy,
        ];
    }

    _sortVertices() {
        if (
            ((this._p1[1] < this._p2[1]) || ((this._p1[1] === this._p2[1]) && (this._p1[0] < this._p2[0]))) &&
            ((this._p1[1] < this._p3[1]) || ((this._p1[1] === this._p3[1]) && (this._p1[0] < this._p3[0])))
        ) {
            if (this._p2[0] > this._p3[0]) {
                let t = this._p2; this._p2 = this._p3; this._p3 = t;
            }
        } else if (
            ((this._p2[1] < this._p3[1]) || ((this._p2[1] === this._p3[1]) && (this._p2[0] < this._p3[0]))) &&
            ((this._p2[1] < this._p1[1]) || ((this._p2[1] === this._p1[1]) && (this._p2[0] < this._p1[0])))
        ) {
            let t = this._p1; this._p1 = this._p2; this._p2 = t;
            if (this._p2[0] > this._p3[0]) {
                t = this._p2; this._p2 = this._p3; this._p3 = t;
            }
        } else {
            let t = this._p1; this._p1 = this._p3; this._p3 = t;
            if (this._p2[0] >= this._p3[0]) {
                t = this._p2; this._p2 = this._p3; this._p3 = t;
            }
        }
    }

    // Point at al along an edge. out[2] is 1/z: 1/z, u/z and v/z are the
    // quantities that interpolate linearly on screen.
    static _edgePoint(out, pa, dt, al, texture) {
        out[2] = (1 - al) / pa[2] + al / dt[2];
        out[0] = pa[0] + dt[0] * al;
        out[3] = pa[3] + dt[3] * al;
        out[4] = pa[4] + dt[4] * al;
        out[5] = pa[5] + dt[5] * al;
        if (texture !== null) {
            out[6] = (pa[6] + dt[6] * al) * texture.width;
            out[7] = (pa[7] + dt[7] * al) * texture.height;
        }
    }

    _rasterize(engine, alpha, texture, clampV = false, blendAdd = false) {
        const p1 = this._p1, p2 = this._p2, p3 = this._p3;
        if (texture) {
            p1[6] /= p1[2]; p1[7] /= p1[2];
            p2[6] /= p2[2]; p2[7] /= p2[2];
            p3[6] /= p3[2]; p3[7] /= p3[2];
        }

        // Sampling at pixel centres, half-open: the last pixel of a span never
        // reaches u = 1 (no wrap onto the first texture column), and two
        // triangles sharing an edge leave no gap and no overlap.
        const ymin = Math.max(0, Math.ceil(p1[1] - 0.5));
        const ymax = Math.min(engine.scrHeight - 1, Math.ceil(Math.max(p2[1], p3[1]) - 0.5) - 1);
        if (ymin > ymax) {
            return;
        }

        // Each edge is walked from its upper vertex, so both triangles sharing
        // it compute the same x.
        const p2Top = ((p2[1] < p3[1]) || ((p2[1] === p3[1]) && (p2[0] <= p3[0])));
        const top23 = ((p2Top) ? p2 : p3);
        const bot23 = ((p2Top) ? p3 : p2);
        // dt[2] is the lower vertex's z, not a delta: _edgePoint needs both z.
        const dt12 = this._dt12, dt23 = this._dt23, dt13 = this._dt13;
        for (let i = 0; i < 8; i++) {
            dt12[i] = p2[i] - p1[i];
            dt23[i] = bot23[i] - top23[i];
            dt13[i] = p3[i] - p1[i];
        }
        dt12[2] = p2[2];
        dt23[2] = bot23[2];
        dt13[2] = p3[2];

        const tex      = ((texture) ? texture : null);
        const texData  = ((tex !== null) ? tex.data : null);
        const texW     = ((tex !== null) ? tex.width : 0);
        const texH     = ((tex !== null) ? tex.height : 0);
        // Opaque texture: depth test first, hidden pixels skip the texel fetch.
        const texAlpha = ((tex !== null) && tex.isAlpha());
        const direct   = (!blendAdd && (alpha >= 1) && !texAlpha);
        const data     = this._data;
        const depth    = this._depth;
        const scrW     = engine.scrWidth;
        // Range and depth are tested on 1/z: the division only runs for the
        // pixels that pass.
        const invNear  = 1 / this._near;
        const invFar   = 1 / this._far;

        for (let ly = ymin; ly <= ymax; ly++) {
            const yc = ly + 0.5;
            let lt0 = this._lt0;
            let lt1 = this._lt1;

            const al23 = ((dt23[1]) ? (yc - top23[1]) / dt23[1] : 0);
            if (yc < p2[1]) {
                Object3dRendererFull._edgePoint(lt0, p1, dt12, ((dt12[1]) ? (yc - p1[1]) / dt12[1] : 0), tex);
            } else {
                Object3dRendererFull._edgePoint(lt0, top23, dt23, al23, tex);
            }
            if (yc < p3[1]) {
                Object3dRendererFull._edgePoint(lt1, p1, dt13, ((dt13[1]) ? (yc - p1[1]) / dt13[1] : 0), tex);
            } else {
                Object3dRendererFull._edgePoint(lt1, top23, dt23, al23, tex);
            }

            if (lt0[0] === lt1[0]) {
                continue;
            }
            if (lt0[0] > lt1[0]) {
                const t = lt0; lt0 = lt1; lt1 = t;
            }

            const lxMin = Math.max(0, Math.ceil(lt0[0] - 0.5));
            const lxMax = Math.min(scrW - 1, Math.ceil(lt1[0] - 0.5) - 1);
            if (lxMin > lxMax) {
                continue;
            }

            // One division per pixel: z = 1 / inv, then u = (u/z) * z.
            const span = lt1[0] - lt0[0];
            const dInv = (lt1[2] - lt0[2]) / span;
            const dr   = (lt1[3] - lt0[3]) / span;
            const dg   = (lt1[4] - lt0[4]) / span;
            const db   = (lt1[5] - lt0[5]) / span;
            const du   = ((tex !== null) ? (lt1[6] - lt0[6]) / span : 0);
            const dv   = ((tex !== null) ? (lt1[7] - lt0[7]) / span : 0);
            const lead = lxMin + 0.5 - lt0[0];
            let inv = lt0[2] + dInv * lead;
            let cr  = lt0[3] + dr * lead;
            let cg  = lt0[4] + dg * lead;
            let cb  = lt0[5] + db * lead;
            let cu  = lt0[6] + du * lead;
            let cv  = lt0[7] + dv * lead;
            let idx = lxMin + ly * scrW;

            for (let lx = lxMin; lx <= lxMax; lx++, idx++, inv += dInv, cr += dr, cg += dg, cb += db, cu += du, cv += dv) {
                if ((inv > invNear) || (inv < invFar)) {
                    continue;
                }
                if (direct && (depth[idx] * inv < 1)) {
                    continue;
                }
                const lz = 1 / inv;

                let texel = -1;
                if (tex !== null) {
                    // | 0 rather than Math.trunc: float % is slow, int % is not.
                    let xt = ((lz * cu) | 0) % texW;
                    if (xt < 0) {
                        xt += texW;
                    }
                    let yt = ((lz * cv) | 0);
                    if (clampV) {
                        yt = ((yt < 0) ? 0 : ((yt >= texH) ? texH - 1 : yt));
                    } else {
                        yt %= texH;
                        if (yt < 0) {
                            yt += texH;
                        }
                    }
                    texel = (xt + yt * texW) << 2;
                    if (texAlpha && (texData[texel + 3] === 0)) {
                        continue;
                    }
                }

                // An additive glow only TESTS the depth: it must not hide what
                // is behind it, and two glows crossing must both accumulate.
                if (!direct) {
                    if (depth[idx] < lz) {
                        continue;
                    }
                }
                if (!blendAdd) {
                    depth[idx] = lz;
                }

                const pixel = idx << 2;
                let r, g, b, a;
                if (tex !== null) {
                    r = (cr * texData[texel]) | 0;
                    g = (cg * texData[texel + 1]) | 0;
                    b = (cb * texData[texel + 2]) | 0;
                    a = ((direct) ? 1 : alpha * texData[texel + 3] / 255);
                } else {
                    r = cr | 0;
                    g = cg | 0;
                    b = cb | 0;
                    a = alpha;
                }

                // Added to the scene instead of replacing it (gzdoom RenderStyle
                // "Add"): the overflow is clamped by the ImageData itself.
                if (blendAdd) {
                    data[pixel]     += a * r;
                    data[pixel + 1] += a * g;
                    data[pixel + 2] += a * b;
                    data[pixel + 3] += a * 255;
                } else if (a < 1) {
                    data[pixel]     = a * r + (1 - a) * data[pixel];
                    data[pixel + 1] = a * g + (1 - a) * data[pixel + 1];
                    data[pixel + 2] = a * b + (1 - a) * data[pixel + 2];
                    data[pixel + 3] = a * 255 + (1 - a) * data[pixel + 3];
                } else {
                    data[pixel]     = r;
                    data[pixel + 1] = g;
                    data[pixel + 2] = b;
                    data[pixel + 3] = 255;
                }
            }
        }
    }
}

// Same floor as Object3d.ptProjection; vertices behind the eye get clipped anyway.
Object3dRendererFull.PROJECTION_MIN_Z = 1e-5;
