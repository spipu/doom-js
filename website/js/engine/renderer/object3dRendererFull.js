class Object3dRendererFull extends Object3dRendererBase {
    constructor() {
        super();
        this._p1 = new Array(10);
        this._p2 = new Array(10);
        this._p3 = new Array(10);
        this._v0 = new Array(10);
        this._v1 = new Array(10);
        this._v2 = new Array(10);
    }

    get code() {
        return 'full';
    }

    begin(engine) {
        engine.zBuffer.clear(engine.scrWidth, engine.scrHeight);
        engine.scrData = engine.scrCtx.createImageData(engine.scrWidth, engine.scrHeight);
    }

    end(engine) {
        engine.scrCtx.putImageData(engine.scrData, 0, 0);
    }

    draw(obj, engine) {
        for (const faceIndices of [obj._opaqueFaces, obj._alphaFaces]) {
            for (const k of faceIndices) {
                const fc = obj.faceList[k];
                if (this._isBackFace(fc.normal, obj.pt3d[fc.pts[0]])) {
                    continue;
                }

                this._buildVertex(this._v0, engine, fc, obj, 0);
                this._buildVertex(this._v1, engine, fc, obj, 1);
                this._buildVertex(this._v2, engine, fc, obj, 2);

                const tris    = this._clipNear(engine, this._v0, this._v1, this._v2);
                const resolvedTexId = this._resolveTexId(fc, engine._sceneMs);
                const texture  = ((resolvedTexId !== null) ? loader.textures().get(resolvedTexId) : null);
                const alpha    = fc.alpha;
                const clampV  = fc.clampV || false;

                for (const tri of tris) {
                    const s0 = tri[0], s1 = tri[1], s2 = tri[2];
                    const p1 = this._p1, p2 = this._p2, p3 = this._p3;
                    for (let i = 0; i < 10; i++) { p1[i] = s0[i]; p2[i] = s1[i]; p3[i] = s2[i]; }
                    this._sortVertices();
                    this._rasterize(engine, alpha, texture, clampV);
                }
            }
        }
    }

    // Vertex layout: [sx, sy, cz, r, g, b, u, v, cx, cy]
    // Indices 0-7 used by rasterizer, 8-9 (3D camera XY) used for clipping only
    _buildVertex(out, engine, fc, obj, idx) {
        const ptIdx = fc.pts[idx];
        const col  = this._pointColor(engine, fc.color, obj.pt3d[ptIdx], fc.normal);
        const pt3d = obj.pt3d[ptIdx];
        const pt2d = obj.pt2d[ptIdx];
        out[0] = pt2d[0]; out[1] = pt2d[1]; out[2] = pt3d[2];
        out[3] = col[0];  out[4] = col[1];  out[5] = col[2];
        out[6] = fc.map[idx][0]; out[7] = fc.map[idx][1];
        out[8] = pt3d[0]; out[9] = pt3d[1];
    }

    _clipVertex(engine, va, vb) {
        const zNear = engine.zBuffer._z_near;
        const t  = (zNear - va[2]) / (vb[2] - va[2]);
        const cx = va[8] + t * (vb[8] - va[8]);
        const cy = va[9] + t * (vb[9] - va[9]);
        return [
            Math.trunc(engine.projScaleX * cx / zNear - engine.projOffsetX),
            Math.trunc(-engine.projScaleY * cy / zNear - engine.projOffsetY),
            zNear,
            va[3] + t * (vb[3] - va[3]),
            va[4] + t * (vb[4] - va[4]),
            va[5] + t * (vb[5] - va[5]),
            va[6] + t * (vb[6] - va[6]),
            va[7] + t * (vb[7] - va[7]),
            cx, cy,
        ];
    }

    _clipNear(engine, v0, v1, v2) {
        const zNear  = engine.zBuffer._z_near;
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
        const i_out = inside.indexOf(false);
        const i_in1 = (i_out + 1) % 3;
        const i_in2 = (i_out + 2) % 3;
        const a = this._clipVertex(engine, verts[i_out], verts[i_in1]);
        const b = this._clipVertex(engine, verts[i_out], verts[i_in2]);
        return [
            [verts[i_in1], verts[i_in2], a],
            [verts[i_in2], b, a],
        ];
    }

    _sortVertices() {
        if (
            (this._p1[1] < this._p2[1] || (this._p1[1] === this._p2[1] && this._p1[0] < this._p2[0])) &&
            (this._p1[1] < this._p3[1] || (this._p1[1] === this._p3[1] && this._p1[0] < this._p3[0]))
        ) {
            if (this._p2[0] > this._p3[0]) {
                let t = this._p2; this._p2 = this._p3; this._p3 = t;
            }
        } else if (
            (this._p2[1] < this._p3[1] || (this._p2[1] === this._p3[1] && this._p2[0] < this._p3[0])) &&
            (this._p2[1] < this._p1[1] || (this._p2[1] === this._p1[1] && this._p2[0] < this._p1[0]))
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

    _rasterize(engine, alpha, text, clampV = false) {
        if (text) {
            this._p1[6] /= this._p1[2]; this._p1[7] /= this._p1[2];
            this._p2[6] /= this._p2[2]; this._p2[7] /= this._p2[2];
            this._p3[6] /= this._p3[2]; this._p3[7] /= this._p3[2];
        }

        const ymin = Math.max(0, Math.ceil(this._p1[1]));
        const ymax = Math.min(engine.scrHeight - 1, Math.max(this._p2[1], this._p3[1]));
        if (ymin > ymax) {
            return;
        }

        const dt12 = []; const dt23 = []; const dt13 = [];
        for (const i of [0, 1, 3, 4, 5]) {
            dt12[i] = this._p2[i] - this._p1[i];
            dt23[i] = this._p3[i] - this._p2[i];
            dt13[i] = this._p3[i] - this._p1[i];
        }
        if (text) {
            for (const i of [6, 7]) {
                dt12[i] = this._p2[i] - this._p1[i];
                dt23[i] = this._p3[i] - this._p2[i];
                dt13[i] = this._p3[i] - this._p1[i];
            }
        }

        for (let ly = ymin; ly <= ymax; ly++) {
            let lt0 = [];
            let lt1 = [];

            if (ly <= this._p2[1]) {
                const al = ((dt12[1]) ? (ly - this._p1[1]) / dt12[1] : 0);
                lt0[2] = 1. / ((1.-al)/this._p1[2] + al/this._p2[2]);
                lt0[0] = this._p1[0] + dt12[0]*al;
                lt0[3] = this._p1[3] + dt12[3]*al;
                lt0[4] = this._p1[4] + dt12[4]*al;
                lt0[5] = this._p1[5] + dt12[5]*al;
                if (text) {
                    lt0[6] = (this._p1[6] + dt12[6]*al) * text.width;
                    lt0[7] = (this._p1[7] + dt12[7]*al) * text.height;
                }
            } else {
                const al = ((dt23[1]) ? (ly - this._p2[1]) / dt23[1] : 0);
                lt0[2] = 1. / ((1.-al)/this._p2[2] + al/this._p3[2]);
                lt0[0] = this._p2[0] + dt23[0]*al;
                lt0[3] = this._p2[3] + dt23[3]*al;
                lt0[4] = this._p2[4] + dt23[4]*al;
                lt0[5] = this._p2[5] + dt23[5]*al;
                if (text) {
                    lt0[6] = (this._p2[6] + dt23[6]*al) * text.width;
                    lt0[7] = (this._p2[7] + dt23[7]*al) * text.height;
                }
            }

            if (ly < this._p3[1]) {
                const al = ((dt13[1]) ? (ly - this._p1[1]) / dt13[1] : 0);
                lt1[2] = 1. / ((1.-al)/this._p1[2] + al/this._p3[2]);
                lt1[0] = this._p1[0] + dt13[0]*al;
                lt1[3] = this._p1[3] + dt13[3]*al;
                lt1[4] = this._p1[4] + dt13[4]*al;
                lt1[5] = this._p1[5] + dt13[5]*al;
                if (text) {
                    lt1[6] = (this._p1[6] + dt13[6]*al) * text.width;
                    lt1[7] = (this._p1[7] + dt13[7]*al) * text.height;
                }
            } else {
                const al = ((dt23[1]) ? (this._p3[1] - ly) / dt23[1] : 0);
                lt1[2] = 1. / ((1.-al)/this._p3[2] + al/this._p2[2]);
                lt1[0] = this._p3[0] - dt23[0]*al;
                lt1[3] = this._p3[3] - dt23[3]*al;
                lt1[4] = this._p3[4] - dt23[4]*al;
                lt1[5] = this._p3[5] - dt23[5]*al;
                if (text) {
                    lt1[6] = (this._p3[6] - dt23[6]*al) * text.width;
                    lt1[7] = (this._p3[7] - dt23[7]*al) * text.height;
                }
            }

            if (lt0[0] === lt1[0]) {
                continue;
            }
            if (lt0[0] > lt1[0]) {
                const t = lt0; lt0 = lt1; lt1 = t;
            }

            const xMin  = Math.ceil(lt0[0]);
            const xMax  = Math.ceil(lt1[0]) - 1;
            const lxMin = Math.max(0, xMin);
            const lxMax = Math.min(engine.scrWidth - 1, xMax);
            if (lxMin > lxMax) {
                continue;
            }

            const dt = [];
            dt[3] = lt1[3] - lt0[3];
            dt[4] = lt1[4] - lt0[4];
            dt[5] = lt1[5] - lt0[5];
            if (text) {
                dt[6] = lt1[6] - lt0[6];
                dt[7] = lt1[7] - lt0[7];
            }

            for (let lx = lxMin; lx <= lxMax; lx++) {
                const al = ((xMin < xMax) ? (lx - xMin) / (xMax - xMin) : 0.);
                const lz = 1. / ((1.-al)/lt0[2] + al/lt1[2]);

                let post = -1;
                if (text) {
                    let xt = Math.trunc(lz * (lt0[6] + dt[6]*al)) % text.width;
                    if (xt < 0) {
                        xt += text.width;
                    }
                    let yt_raw = lz * (lt0[7] + dt[7]*al);
                    let yt = ((clampV)
                        ? Math.min(text.height - 1, Math.max(0, Math.trunc(yt_raw)))
                        : (Math.trunc(yt_raw) % text.height + text.height) % text.height);
                    post = 4 * (xt + yt * text.width);
                    if (text.data[post+3] === 0) {
                        continue;
                    }
                }

                if (!engine.zBuffer.set(lx, ly, lz)) {
                    continue;
                }

                const posi = 4 * (lx + ly * engine.scrWidth);
                let r, g, b, a;

                if (text) {
                    r = Math.trunc((lt0[3] + dt[3]*al) * text.data[post+0]);
                    g = Math.trunc((lt0[4] + dt[4]*al) * text.data[post+1]);
                    b = Math.trunc((lt0[5] + dt[5]*al) * text.data[post+2]);
                    a = alpha * text.data[post+3] / 255.;
                } else {
                    r = Math.trunc(lt0[3] + dt[3]*al);
                    g = Math.trunc(lt0[4] + dt[4]*al);
                    b = Math.trunc(lt0[5] + dt[5]*al);
                    a = alpha;
                }

                if (a < 1.) {
                    engine.scrData.data[posi+0] = a*r + (1-a)*engine.scrData.data[posi+0];
                    engine.scrData.data[posi+1] = a*g + (1-a)*engine.scrData.data[posi+1];
                    engine.scrData.data[posi+2] = a*b + (1-a)*engine.scrData.data[posi+2];
                    engine.scrData.data[posi+3] = a*255 + (1-a)*engine.scrData.data[posi+3];
                } else {
                    engine.scrData.data[posi+0] = r;
                    engine.scrData.data[posi+1] = g;
                    engine.scrData.data[posi+2] = b;
                    engine.scrData.data[posi+3] = 255;
                }
            }
        }
    }
}
