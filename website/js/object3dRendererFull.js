class Object3dRendererFull {
    constructor() {
        this._p1 = [];
        this._p2 = [];
        this._p3 = [];
    }

    get code() {
        return 'full';
    }

    begin(engine) {
        engine.zBuffer.clear(engine.scr_width, engine.scr_height);
        engine.scr_data = engine.scr_ctx.createImageData(engine.scr_width, engine.scr_height);
    }

    end(engine) {
        engine.scr_ctx.putImageData(engine.scr_data, 0, 0);
    }

    draw(obj, engine) {
        for (let k = 0; k < obj.fc_nb; k++) {
            const fc = obj.fc_lst[k];
            obj.fc_inf[k][0] = this._faceNormal(obj.pt_3d[fc[0]], obj.pt_3d[fc[1]], obj.pt_3d[fc[2]]);
            obj.fc_inf[k][1] = this._faceNormal2d(obj.pt_2d[fc[0]], obj.pt_2d[fc[1]], obj.pt_2d[fc[2]]);
        }

        this._p1 = [];
        this._p2 = [];
        this._p3 = [];

        for (let k = 0; k < obj.fc_nb; k++) {
            if (!this._prepare(obj, engine, obj.fc_lst[k], obj.fc_inf[k])) continue;

            if (obj.fc_lst[k][4] !== null)
                this._renderTexture(engine, obj.fc_lst[k][6], obj.tx_lst[obj.fc_lst[k][4]]);
            else
                this._renderNoTexture(engine, obj.fc_lst[k][6]);
        }
    }

    _norm(v) {
        return Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
    }

    _faceNormal2d(pt1, pt2, pt3) {
        return (pt2[0]-pt1[0])*(pt3[1]-pt1[1]) - (pt2[1]-pt1[1])*(pt3[0]-pt1[0]);
    }

    _faceNormal(pt1, pt2, pt3) {
        const v1 = [pt2[0]-pt1[0], pt2[1]-pt1[1], pt2[2]-pt1[2]];
        const v2 = [pt3[0]-pt1[0], pt3[1]-pt1[1], pt3[2]-pt1[2]];
        const v  = [v1[1]*v2[2] - v1[2]*v2[1], v1[2]*v2[0] - v1[0]*v2[2], v1[0]*v2[1] - v1[1]*v2[0]];
        const n  = this._norm(v);
        if (n > 0) { v[0] /= n; v[1] /= n; v[2] /= n; }
        return v;
    }

    _pointColor(engine, color, pt, normal) {
        const col = [engine.light_ambient[0], engine.light_ambient[1], engine.light_ambient[2]];

        for (let k = 0; k < engine.light_lst.length; k++) {
            const temp = engine.light_lst[k].getColorFor(pt, normal);
            col[0] += temp[0];
            col[1] += temp[1];
            col[2] += temp[2];
        }

        if (col[0] < 0.) col[0] = 0.; if (col[0] > 255.) col[0] = 255.;
        if (col[1] < 0.) col[1] = 0.; if (col[1] > 255.) col[1] = 255.;
        if (col[2] < 0.) col[2] = 0.; if (col[2] > 255.) col[2] = 255.;

        col[0] = color[0] * col[0] / 255.;
        col[1] = color[1] * col[1] / 255.;
        col[2] = color[2] * col[2] / 255.;

        return col;
    }

    _prepare(obj, engine, fc, fc_inf) {
        if (fc_inf[1] > 0) return false;

        let col = this._pointColor(engine, fc[3], obj.pt_3d[fc[0]], fc_inf[0]);
        this._p1[0] = obj.pt_2d[fc[0]][0]; this._p1[1] = obj.pt_2d[fc[0]][1]; this._p1[2] = obj.pt_2d[fc[0]][2];
        this._p1[3] = col[0]; this._p1[4] = col[1]; this._p1[5] = col[2];
        this._p1[6] = fc[5][0][0]; this._p1[7] = fc[5][0][1];

        col = this._pointColor(engine, fc[3], obj.pt_3d[fc[1]], fc_inf[0]);
        this._p2[0] = obj.pt_2d[fc[1]][0]; this._p2[1] = obj.pt_2d[fc[1]][1]; this._p2[2] = obj.pt_2d[fc[1]][2];
        this._p2[3] = col[0]; this._p2[4] = col[1]; this._p2[5] = col[2];
        this._p2[6] = fc[5][1][0]; this._p2[7] = fc[5][1][1];

        col = this._pointColor(engine, fc[3], obj.pt_3d[fc[2]], fc_inf[0]);
        this._p3[0] = obj.pt_2d[fc[2]][0]; this._p3[1] = obj.pt_2d[fc[2]][1]; this._p3[2] = obj.pt_2d[fc[2]][2];
        this._p3[3] = col[0]; this._p3[4] = col[1]; this._p3[5] = col[2];
        this._p3[6] = fc[5][2][0]; this._p3[7] = fc[5][2][1];

        if (this._p1[2] < 1 && this._p2[2] < 1 && this._p3[2] < 1) return false;

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

        return true;
    }

    _subPixel(y) {
        return (1. + y - Math.ceil(y));
    }

    _renderNoTexture(engine, alpha) {
        const ymin = this._p1[1];
        const ymax = Math.max(this._p2[1], this._p3[1]);

        const dt12 = []; const dt23 = []; const dt13 = [];
        dt12[0] = this._p2[0]-this._p1[0]; dt23[0] = this._p3[0]-this._p2[0]; dt13[0] = this._p3[0]-this._p1[0];
        dt12[1] = this._p2[1]-this._p1[1]; dt23[1] = this._p3[1]-this._p2[1]; dt13[1] = this._p3[1]-this._p1[1];
        dt12[3] = this._p2[3]-this._p1[3]; dt23[3] = this._p3[3]-this._p2[3]; dt13[3] = this._p3[3]-this._p1[3];
        dt12[4] = this._p2[4]-this._p1[4]; dt23[4] = this._p3[4]-this._p2[4]; dt13[4] = this._p3[4]-this._p1[4];
        dt12[5] = this._p2[5]-this._p1[5]; dt23[5] = this._p3[5]-this._p2[5]; dt13[5] = this._p3[5]-this._p1[5];

        for (let ly = ymin; ly <= ymax; ly++) {
            let lt0 = [];
            let lt1 = [];

            if (ly <= this._p2[1]) {
                const al = dt12[1] ? (ly - this._p1[1]) / dt12[1] : 0;
                lt0[1] = ly;
                lt0[2] = 1. / ((1.-al)/this._p1[2] + al/this._p2[2]);
                lt0[0] = this._p1[0] + dt12[0]*al;
                lt0[3] = this._p1[3] + dt12[3]*al;
                lt0[4] = this._p1[4] + dt12[4]*al;
                lt0[5] = this._p1[5] + dt12[5]*al;
            } else {
                const al = dt23[1] ? (ly - this._p2[1]) / dt23[1] : 0;
                lt0[1] = ly;
                lt0[2] = 1. / ((1.-al)/this._p2[2] + al/this._p3[2]);
                lt0[0] = this._p2[0] + dt23[0]*al;
                lt0[3] = this._p2[3] + dt23[3]*al;
                lt0[4] = this._p2[4] + dt23[4]*al;
                lt0[5] = this._p2[5] + dt23[5]*al;
            }

            if (ly < this._p3[1]) {
                const al = dt13[1] ? (ly - this._p1[1]) / dt13[1] : 0;
                lt1[1] = ly;
                lt1[2] = 1. / ((1.-al)/this._p1[2] + al/this._p3[2]);
                lt1[0] = this._p1[0] + dt13[0]*al;
                lt1[3] = this._p1[3] + dt13[3]*al;
                lt1[4] = this._p1[4] + dt13[4]*al;
                lt1[5] = this._p1[5] + dt13[5]*al;
            } else {
                const al = dt23[1] ? (this._p3[1] - ly) / dt23[1] : 0;
                lt1[1] = ly;
                lt1[2] = 1. / ((1.-al)/this._p3[2] + al/this._p2[2]);
                lt1[0] = this._p3[0] - dt23[0]*al;
                lt1[3] = this._p3[3] - dt23[3]*al;
                lt1[4] = this._p3[4] - dt23[4]*al;
                lt1[5] = this._p3[5] - dt23[5]*al;
            }

            if (lt0[0] === lt1[0]) continue;
            if (lt0[0] > lt1[0]) { const t = lt0; lt0 = lt1; lt1 = t; }

            let xMin = Math.trunc(lt0[0]);
            let xMax = Math.trunc(lt1[0] + 0.5);
            xMin += this._subPixel(lt1[1]);

            const dt = [];
            dt[3] = lt1[3] - lt0[3];
            dt[4] = lt1[4] - lt0[4];
            dt[5] = lt1[5] - lt0[5];

            for (let lx = xMin; lx <= xMax; lx++) {
                const al = (xMin < xMax) ? (lx - xMin) / (xMax - xMin) : 0.;
                const lz = 1. / ((1.-al)/lt0[2] + al/lt1[2]);

                if (engine.zBuffer.set(lx, ly, lz)) {
                    const r = Math.trunc(lt0[3] + dt[3]*al);
                    const g = Math.trunc(lt0[4] + dt[4]*al);
                    const b = Math.trunc(lt0[5] + dt[5]*al);
                    const p = 4 * (lx + ly * engine.scr_width);

                    if (alpha < 1.) {
                        engine.scr_data.data[p+0] = alpha*r + (1-alpha)*engine.scr_data.data[p+0];
                        engine.scr_data.data[p+1] = alpha*g + (1-alpha)*engine.scr_data.data[p+1];
                        engine.scr_data.data[p+2] = alpha*b + (1-alpha)*engine.scr_data.data[p+2];
                        engine.scr_data.data[p+3] = 255;
                    } else {
                        engine.scr_data.data[p+0] = r;
                        engine.scr_data.data[p+1] = g;
                        engine.scr_data.data[p+2] = b;
                        engine.scr_data.data[p+3] = 255;
                    }
                }
            }
        }
    }

    _renderTexture(engine, alpha, text) {
        if (!text) return this._renderNoTexture(engine, alpha);

        this._p1[6] /= this._p1[2]; this._p1[7] /= this._p1[2];
        this._p2[6] /= this._p2[2]; this._p2[7] /= this._p2[2];
        this._p3[6] /= this._p3[2]; this._p3[7] /= this._p3[2];

        const ymin = this._p1[1];
        const ymax = Math.max(this._p2[1], this._p3[1]);

        const dt12 = []; const dt23 = []; const dt13 = [];
        dt12[0] = this._p2[0]-this._p1[0]; dt23[0] = this._p3[0]-this._p2[0]; dt13[0] = this._p3[0]-this._p1[0];
        dt12[1] = this._p2[1]-this._p1[1]; dt23[1] = this._p3[1]-this._p2[1]; dt13[1] = this._p3[1]-this._p1[1];
        dt12[3] = this._p2[3]-this._p1[3]; dt23[3] = this._p3[3]-this._p2[3]; dt13[3] = this._p3[3]-this._p1[3];
        dt12[4] = this._p2[4]-this._p1[4]; dt23[4] = this._p3[4]-this._p2[4]; dt13[4] = this._p3[4]-this._p1[4];
        dt12[5] = this._p2[5]-this._p1[5]; dt23[5] = this._p3[5]-this._p2[5]; dt13[5] = this._p3[5]-this._p1[5];
        dt12[6] = this._p2[6]-this._p1[6]; dt23[6] = this._p3[6]-this._p2[6]; dt13[6] = this._p3[6]-this._p1[6];
        dt12[7] = this._p2[7]-this._p1[7]; dt23[7] = this._p3[7]-this._p2[7]; dt13[7] = this._p3[7]-this._p1[7];

        for (let ly = ymin; ly <= ymax; ly++) {
            let lt0 = [];
            let lt1 = [];

            if (ly <= this._p2[1]) {
                const al = dt12[1] ? (ly - this._p1[1]) / dt12[1] : 0;
                lt0[1] = ly;
                lt0[2] = 1. / ((1.-al)/this._p1[2] + al/this._p2[2]);
                lt0[0] = this._p1[0] + dt12[0]*al;
                lt0[3] = this._p1[3] + dt12[3]*al;
                lt0[4] = this._p1[4] + dt12[4]*al;
                lt0[5] = this._p1[5] + dt12[5]*al;
                lt0[6] = (this._p1[6] + dt12[6]*al) * text.width;
                lt0[7] = (this._p1[7] + dt12[7]*al) * text.height;
            } else {
                const al = dt23[1] ? (ly - this._p2[1]) / dt23[1] : 0;
                lt0[1] = ly;
                lt0[2] = 1. / ((1.-al)/this._p2[2] + al/this._p3[2]);
                lt0[0] = this._p2[0] + dt23[0]*al;
                lt0[3] = this._p2[3] + dt23[3]*al;
                lt0[4] = this._p2[4] + dt23[4]*al;
                lt0[5] = this._p2[5] + dt23[5]*al;
                lt0[6] = (this._p2[6] + dt23[6]*al) * text.width;
                lt0[7] = (this._p2[7] + dt23[7]*al) * text.height;
            }

            if (ly < this._p3[1]) {
                const al = dt13[1] ? (ly - this._p1[1]) / dt13[1] : 0;
                lt1[1] = ly;
                lt1[2] = 1. / ((1.-al)/this._p1[2] + al/this._p3[2]);
                lt1[0] = this._p1[0] + dt13[0]*al;
                lt1[3] = this._p1[3] + dt13[3]*al;
                lt1[4] = this._p1[4] + dt13[4]*al;
                lt1[5] = this._p1[5] + dt13[5]*al;
                lt1[6] = (this._p1[6] + dt13[6]*al) * text.width;
                lt1[7] = (this._p1[7] + dt13[7]*al) * text.height;
            } else {
                const al = dt23[1] ? (this._p3[1] - ly) / dt23[1] : 0;
                lt1[1] = ly;
                lt1[2] = 1. / ((1.-al)/this._p3[2] + al/this._p2[2]);
                lt1[0] = this._p3[0] - dt23[0]*al;
                lt1[3] = this._p3[3] - dt23[3]*al;
                lt1[4] = this._p3[4] - dt23[4]*al;
                lt1[5] = this._p3[5] - dt23[5]*al;
                lt1[6] = (this._p3[6] - dt23[6]*al) * text.width;
                lt1[7] = (this._p3[7] - dt23[7]*al) * text.height;
            }

            if (lt0[0] === lt1[0]) continue;
            if (lt0[0] > lt1[0]) { const t = lt0; lt0 = lt1; lt1 = t; }

            const xMin = Math.trunc(lt0[0]);
            const xMax = Math.trunc(lt1[0] + 0.5);

            const dt = [];
            dt[3] = lt1[3] - lt0[3];
            dt[4] = lt1[4] - lt0[4];
            dt[5] = lt1[5] - lt0[5];
            dt[6] = lt1[6] - lt0[6];
            dt[7] = lt1[7] - lt0[7];

            for (let lx = xMin; lx <= xMax; lx++) {
                const al   = (xMin < xMax) ? (lx - xMin) / (xMax - xMin) : 0;
                const lz   = 1. / ((1.-al)/lt0[2] + al/lt1[2]);

                if (engine.zBuffer.set(lx, ly, lz)) {
                    let xt   = Math.trunc(lz * (lt0[6] + dt[6]*al)) % text.width;  if (xt < 0) xt += text[0];
                    let yt   = Math.trunc(lz * (lt0[7] + dt[7]*al)) % text.height; if (yt < 0) yt += text[1];
                    const post = 4 * (xt + yt * text.width);
                    const posi = 4 * (lx + ly * engine.scr_width);

                    const r = Math.trunc((lt0[3] + dt[3]*al) * text.data[post+0]);
                    const g = Math.trunc((lt0[4] + dt[4]*al) * text.data[post+1]);
                    const b = Math.trunc((lt0[5] + dt[5]*al) * text.data[post+2]);
                    const a = alpha * parseFloat(text.data[post+3]) / 255.;

                    if (a < 1.) {
                        engine.scr_data.data[posi+0] = a*r + (1-a)*engine.scr_data.data[posi+0];
                        engine.scr_data.data[posi+1] = a*g + (1-a)*engine.scr_data.data[posi+1];
                        engine.scr_data.data[posi+2] = a*b + (1-a)*engine.scr_data.data[posi+2];
                        engine.scr_data.data[posi+3] = a*255 + (1-a)*engine.scr_data.data[posi+3];
                    } else {
                        engine.scr_data.data[posi+0] = r;
                        engine.scr_data.data[posi+1] = g;
                        engine.scr_data.data[posi+2] = b;
                        engine.scr_data.data[posi+3] = 255;
                    }
                }
            }
        }
    }
}
