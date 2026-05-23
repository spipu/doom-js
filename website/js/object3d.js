class Object3d extends AbstractLoader {
    constructor() {
        super();
        this.pt_ori   = [];
        this.pt_3d    = [];
        this.pt_2d    = [];
        this.pt_nb    = 0;
        this.fc_lst   = [];
        this.fc_inf   = [];
        this.fc_nb    = 0;
        this.tx_lst   = [];
        this.tx_nb    = 0;
    }

    ptAdd(x, y, z) {
        x = parseFloat(x); y = parseFloat(y); z = parseFloat(z);
        this.pt_ori.push([x, y, z, 1]);
        this.pt_3d.push([x, y, z, 1]);
        this.pt_2d.push([0, 0, 0]);
        this.pt_nb++;
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

    textureAdd(nom_img) {
        const tx_nb = this.tx_nb;
        const obj   = this;
        const img   = new Image();

        img.onload = function() {
            const myCanvas        = document.createElement('canvas');
            const myCanvasContext = myCanvas.getContext('2d');
            myCanvas.width        = img.width;
            myCanvas.height       = img.height;
            myCanvasContext.drawImage(img, 0, 0);
            obj.tx_lst[tx_nb] = myCanvasContext.getImageData(0, 0, img.width, img.height);
        };

        this.tx_lst[tx_nb] = null;
        this.tx_nb++;
        img.src = loader.buildUrl(nom_img);

        return this;
    }

    fcAdd(pt1, pt2, pt3, color, texture, map) {
        if (!color)   color   = [255., 255., 255.];
        if (!texture) texture = null;
        if (!map)     map     = null;

        if (texture > this.tx_nb) texture = null;
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

        if (this.pt_ori[pt1-1] === undefined) throw new Error('pt1 ' + pt1 + ' undefined');
        if (this.pt_ori[pt2-1] === undefined) throw new Error('pt2 ' + pt2 + ' undefined');
        if (this.pt_ori[pt3-1] === undefined) throw new Error('pt3 ' + pt3 + ' undefined');

        this.fc_lst.push([pt1-1, pt2-1, pt3-1, color, (texture ? texture-1 : null), map, alpha]);
        this.fc_inf.push([[0, 0, 0], null]);
        this.fc_nb++;
        return this;
    }

    getFaceCount() {
        return this.fc_nb;
    }

    getVertexCount() {
        return this.pt_nb;
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
        const n = this.pt_nb;
        if (n > 0) {
            let cx = 0, cy = 0, cz = 0;
            for (let i = 0; i < n; i++) { cx += this.pt_ori[i][0]; cy += this.pt_ori[i][1]; cz += this.pt_ori[i][2]; }
            cx /= n; cy /= n; cz /= n;
            this._center = [cx, cy, cz];
            let r = 0;
            for (let i = 0; i < n; i++) {
                const d = (this.pt_ori[i][0]-cx)**2 + (this.pt_ori[i][1]-cy)**2 + (this.pt_ori[i][2]-cz)**2;
                if (d > r) r = d;
            }
            this._boundingRadius = Math.sqrt(r);
        } else {
            this._center = [0, 0, 0];
            this._boundingRadius = 0;
        }
        this._localNormals = new Float32Array(this.fc_nb * 3);
        for (let k = 0; k < this.fc_nb; k++) {
            const fc = this.fc_lst[k];
            const A = this.pt_ori[fc[0]], B = this.pt_ori[fc[1]], C = this.pt_ori[fc[2]];
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
        this._executeLoadedCallback();
        return this;
    }

    getCenter() {
        return this._center;
    }

    getBoundingRadius() {
        return this._boundingRadius;
    }

    ptTransform(m) {
        for (let x = 0; x < this.pt_nb; x++) {
            this.pt_3d[x][0] = m.v[0][0]*this.pt_ori[x][0] + m.v[1][0]*this.pt_ori[x][1] + m.v[2][0]*this.pt_ori[x][2] + m.v[3][0]*this.pt_ori[x][3];
            this.pt_3d[x][1] = m.v[0][1]*this.pt_ori[x][0] + m.v[1][1]*this.pt_ori[x][1] + m.v[2][1]*this.pt_ori[x][2] + m.v[3][1]*this.pt_ori[x][3];
            this.pt_3d[x][2] = m.v[0][2]*this.pt_ori[x][0] + m.v[1][2]*this.pt_ori[x][1] + m.v[2][2]*this.pt_ori[x][2] + m.v[3][2]*this.pt_ori[x][3];
            this.pt_3d[x][3] = m.v[0][3]*this.pt_ori[x][0] + m.v[1][3]*this.pt_ori[x][1] + m.v[2][3]*this.pt_ori[x][2] + m.v[3][3]*this.pt_ori[x][3];
        }
        const m00=m.v[0][0], m10=m.v[1][0], m20=m.v[2][0];
        const m01=m.v[0][1], m11=m.v[1][1], m21=m.v[2][1];
        const m02=m.v[0][2], m12=m.v[1][2], m22=m.v[2][2];
        for (let k = 0; k < this.fc_nb; k++) {
            const i = k * 3;
            const nx = this._localNormals[i], ny = this._localNormals[i+1], nz = this._localNormals[i+2];
            const n = this.fc_inf[k][0];
            n[0] = m00*nx + m10*ny + m20*nz;
            n[1] = m01*nx + m11*ny + m21*nz;
            n[2] = m02*nx + m12*ny + m22*nz;
        }
        return this;
    }

    ptProjection(engine) {
        for (let k = 0; k < this.pt_nb; k++) {
            const p = this.pt_2d[k];
            p[0] = Math.trunc(engine.proj_scaleX * this.pt_3d[k][0] / this.pt_3d[k][2] - engine.proj_offsetX);
            p[1] = Math.trunc(-engine.proj_scaleY * this.pt_3d[k][1] / this.pt_3d[k][2] - engine.proj_offsetY);
            p[2] = this.pt_3d[k][2];
        }
        return this;
    }
}
