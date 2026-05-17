class Object3dRendererBase {
    isAvailable() {
        return true;
    }

    initCanvas(canvas) {
        return canvas.getContext('2d');
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
}
