class Object3d extends AbstractLoader {
    constructor() {
        super();
        this.ptOrigin      = [];
        this.pt3d          = [];
        this.pt2d          = [];
        this.ptCount       = 0;
        this.faceList      = [];
        this.faceCount     = 0;
        this.textureList   = [];
        this.textureCount  = 0;
        this._opaqueFaces  = [];
        this._alphaFaces   = [];
    }

    ptAdd(x, y, z) {
        x = parseFloat(x); y = parseFloat(y); z = parseFloat(z);
        this.ptOrigin.push([x, y, z, 1]);
        this.pt3d.push([x, y, z, 1]);
        this.pt2d.push([0, 0, 0]);
        this.ptCount++;
        return this;
    }

    ptsAdd(lst, center, scale) {
        if (!center) center = [0., 0., 0.];
        if (!scale)  scale  = 1.;
        center[0] = parseFloat(center[0]);
        center[1] = parseFloat(center[1]);
        center[2] = parseFloat(center[2]);

        for (let k = 0; k < lst.length; k++)
            this.ptAdd(scale*(lst[k][0]-center[0]), scale*(lst[k][1]-center[1]), scale*(lst[k][2]-center[2]));

        return this;
    }

    textureAdd(url) {
        this.textureList[this.textureCount] = new Texture(url);
        this.textureCount++;
        return this;
    }

    fcAdd(pt1, pt2, pt3, color, texture, map, clampV = false, passableUser = false, passableEnemy = false, animTextures = null) {
        if (!color)   color   = [255., 255., 255.];
        if (!texture && animTextures) {
            texture = animTextures.ids[0];
        }
        if (!texture) texture = null;
        if (!map)     map     = null;

        if (texture > this.textureCount) texture = null;
        if (texture === null) map = null;
        if (map === null) map = [[0, 0], [1, 0], [1, 1]];

        let alpha;
        if (color[3]) {
            alpha    = parseFloat(color[3]);
            color[3] = null;
        } else {
            alpha = 1.;
        }

        color[0] = parseFloat(color[0]); color[1] = parseFloat(color[1]); color[2] = parseFloat(color[2]);

        map[0][0] = parseFloat(map[0][0]); map[0][1] = 1. - parseFloat(map[0][1]);
        map[1][0] = parseFloat(map[1][0]); map[1][1] = 1. - parseFloat(map[1][1]);
        map[2][0] = parseFloat(map[2][0]); map[2][1] = 1. - parseFloat(map[2][1]);

        if (texture) {
            color[0] = parseFloat(color[0]) / 255.;
            color[1] = parseFloat(color[1]) / 255.;
            color[2] = parseFloat(color[2]) / 255.;
        } else {
            color[0] = parseFloat(color[0]);
            color[1] = parseFloat(color[1]);
            color[2] = parseFloat(color[2]);
        }

        if (this.ptOrigin[pt1-1] === undefined) {
            throw new Error('pt1 ' + pt1 + ' undefined');
        }
        if (this.ptOrigin[pt2-1] === undefined) {
            throw new Error('pt2 ' + pt2 + ' undefined');
        }
        if (this.ptOrigin[pt3-1] === undefined) {
            throw new Error('pt3 ' + pt3 + ' undefined');
        }

        const anim = animTextures ? {ids: animTextures.ids.map(id => id - 1), duration: animTextures.duration} : null;
        this.faceList.push(new Face(pt1-1, pt2-1, pt3-1, color, (texture ? texture-1 : null), map, alpha, clampV, passableUser, passableEnemy, anim));
        this.faceCount++;
        return this;
    }

    getFaceCount() {
        return this.faceCount;
    }

    getVertexCount() {
        return this.ptCount;
    }

    fcsAdd(lst, color) {
        if (!color) color = [255., 255., 255.];

        for (let k = 0; k < lst.length; k++) {
            for (let l = 2; l < lst[k].length; l++) {
                this.fcAdd(lst[k][0], lst[k][l-1], lst[k][l], color);
            }
        }

        return this;
    }

    ready() {
        const n = this.ptCount;
        if (n > 0) {
            let cx = 0, cy = 0, cz = 0;
            for (let i = 0; i < n; i++) { cx += this.ptOrigin[i][0]; cy += this.ptOrigin[i][1]; cz += this.ptOrigin[i][2]; }
            cx /= n; cy /= n; cz /= n;
            this._center = [cx, cy, cz];
            let r = 0;
            for (let i = 0; i < n; i++) {
                const d = (this.ptOrigin[i][0]-cx)**2 + (this.ptOrigin[i][1]-cy)**2 + (this.ptOrigin[i][2]-cz)**2;
                if (d > r) r = d;
            }
            this._boundingRadius = Math.sqrt(r);
        } else {
            this._center = [0, 0, 0];
            this._boundingRadius = 0;
        }
        this._localNormals = new Float32Array(this.faceCount * 3);
        for (let k = 0; k < this.faceCount; k++) {
            const fc = this.faceList[k];
            const A = this.ptOrigin[fc.pts[0]], B = this.ptOrigin[fc.pts[1]], C = this.ptOrigin[fc.pts[2]];
            const abx = B[0]-A[0], aby = B[1]-A[1], abz = B[2]-A[2];
            const acx = C[0]-A[0], acy = C[1]-A[1], acz = C[2]-A[2];
            let nx = aby*acz - abz*acy;
            let ny = abz*acx - abx*acz;
            let nz = abx*acy - aby*acx;
            const len = Math.sqrt(nx*nx + ny*ny + nz*nz);
            if (len > 1e-10) { nx /= len; ny /= len; nz /= len; }
            this._localNormals[k*3]   = nx;
            this._localNormals[k*3+1] = ny;
            this._localNormals[k*3+2] = nz;
        }
        if (this.textureCount === 0) {
            this._onReady();
            return this;
        }
        let pending = this.textureCount;
        const onTextureLoaded = () => { if (--pending === 0) this._onReady(); };
        for (let i = 0; i < this.textureCount; i++) {
            this.textureList[i].setLoadedCallback(onTextureLoaded);
        }
        return this;
    }

    _onReady() {
        this._opaqueFaces = [];
        this._alphaFaces  = [];
        for (let k = 0; k < this.faceCount; k++) {
            const fc = this.faceList[k];
            fc.isAlpha = (fc.alpha < 1) || (fc.textureId !== null && this.textureList[fc.textureId].isAlpha());
            (fc.isAlpha ? this._alphaFaces : this._opaqueFaces).push(k);
        }
        this._executeLoadedCallback();
    }

    getCenter() {
        return this._center;
    }

    getBoundingRadius() {
        return this._boundingRadius;
    }

    ptTransform(m) {
        for (let x = 0; x < this.ptCount; x++) {
            this.pt3d[x][0] = m.v[0][0]*this.ptOrigin[x][0] + m.v[1][0]*this.ptOrigin[x][1] + m.v[2][0]*this.ptOrigin[x][2] + m.v[3][0]*this.ptOrigin[x][3];
            this.pt3d[x][1] = m.v[0][1]*this.ptOrigin[x][0] + m.v[1][1]*this.ptOrigin[x][1] + m.v[2][1]*this.ptOrigin[x][2] + m.v[3][1]*this.ptOrigin[x][3];
            this.pt3d[x][2] = m.v[0][2]*this.ptOrigin[x][0] + m.v[1][2]*this.ptOrigin[x][1] + m.v[2][2]*this.ptOrigin[x][2] + m.v[3][2]*this.ptOrigin[x][3];
            this.pt3d[x][3] = m.v[0][3]*this.ptOrigin[x][0] + m.v[1][3]*this.ptOrigin[x][1] + m.v[2][3]*this.ptOrigin[x][2] + m.v[3][3]*this.ptOrigin[x][3];
        }
        const m00=m.v[0][0], m10=m.v[1][0], m20=m.v[2][0];
        const m01=m.v[0][1], m11=m.v[1][1], m21=m.v[2][1];
        const m02=m.v[0][2], m12=m.v[1][2], m22=m.v[2][2];
        for (let k = 0; k < this.faceCount; k++) {
            const i = k * 3;
            const nx = this._localNormals[i], ny = this._localNormals[i+1], nz = this._localNormals[i+2];
            const n = this.faceList[k].normal;
            n[0] = m00*nx + m10*ny + m20*nz;
            n[1] = m01*nx + m11*ny + m21*nz;
            n[2] = m02*nx + m12*ny + m22*nz;
        }
        return this;
    }

    ptProjection(engine) {
        for (let k = 0; k < this.ptCount; k++) {
            const p = this.pt2d[k];
            p[0] = Math.trunc(engine.projScaleX * this.pt3d[k][0] / this.pt3d[k][2] - engine.projOffsetX);
            p[1] = Math.trunc(-engine.projScaleY * this.pt3d[k][1] / this.pt3d[k][2] - engine.projOffsetY);
            p[2] = this.pt3d[k][2];
        }
        return this;
    }
}
