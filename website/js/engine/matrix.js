class Matrix {
    // Instance transform composition — the SINGLE source of truth shared by
    // the render (Engine3d.drawInstance), the collision colliders and the
    // world-center computation: position translation, base rotation X/Z/Y,
    // then the animation delta translation and delta rotation X/Z/Y.
    static composeInstanceTransform(tf) {
        const [px, py, pz]    = tf.position;
        const [irx, iry, irz] = tf.rotation;
        const [dtx, dty, dtz] = tf.deltaTranslate;
        const [drx, dry, drz] = tf.deltaRotate;
        const m = new Matrix();
        m.identity();
        const apply = (fn, ...args) => {
            const step = new Matrix();
            step[fn](...args);
            m.multiply(step);
        };
        apply('translation', px, py, pz);
        if (irx) {
            apply('rotationX', irx * DEG_TO_RAD);
        }
        if (irz) {
            apply('rotationZ', irz * DEG_TO_RAD);
        }
        if (iry) {
            apply('rotationY', iry * DEG_TO_RAD);
        }
        if (dtx || dty || dtz) {
            apply('translation', dtx, dty, dtz);
        }
        if (drx) {
            apply('rotationX', drx * DEG_TO_RAD);
        }
        if (drz) {
            apply('rotationZ', drz * DEG_TO_RAD);
        }
        if (dry) {
            apply('rotationY', dry * DEG_TO_RAD);
        }
        return m;
    }

    constructor() {
        this.v    = [[0.,0.,0.,0.],[0.,0.,0.,0.],[0.,0.,0.,0.],[0.,0.,0.,0.]];
        this.stack = [];
    }

    clear() {
        this.v = [
            [0.,0.,0.,0.],
            [0.,0.,0.,0.],
            [0.,0.,0.,0.],
            [0.,0.,0.,0.],
        ];
        return this;
    }

    identity() {
        this.v = [
            [1.,0.,0.,0.],
            [0.,1.,0.,0.],
            [0.,0.,1.,0.],
            [0.,0.,0.,1.],
        ];
        return this;
    }

    translation(tx, ty, tz) {
        this.v = [
            [1.,0.,0.,0.],
            [0.,1.,0.,0.],
            [0.,0.,1.,0.],
            [tx,ty,tz,1.],
        ];
        return this;
    }


    rotationX(rx) {
        const c = Math.cos(rx);
        const s = Math.sin(rx);
        this.v = [
            [1.,0.,0.,0.],
            [0., c, s,0.],
            [0.,-s, c,0.],
            [0.,0.,0.,1.],
        ];
        return this;
    }

    rotationY(ry) {
        const c = Math.cos(ry);
        const s = Math.sin(ry);
        this.v = [
            [ c,0.,-s,0.],
            [0.,1.,0.,0.],
            [ s,0., c,0.],
            [0.,0.,0.,1.],
        ];
        return this;
    }

    rotationZ(rz) {
        const c = Math.cos(rz);
        const s = Math.sin(rz);
        this.v = [
            [ c, s,0.,0.],
            [-s, c,0.,0.],
            [0.,0.,1.,0.],
            [0.,0.,0.,1.],
        ];
        return this;
    }

    multiply(m) {
        const a = this.v;
        const b = m.v;
        this.clear();
        for (let x = 0; x < 4; x++) {
            this.v[x][0] = a[0][0]*b[x][0] + a[1][0]*b[x][1] + a[2][0]*b[x][2] + a[3][0]*b[x][3];
            this.v[x][1] = a[0][1]*b[x][0] + a[1][1]*b[x][1] + a[2][1]*b[x][2] + a[3][1]*b[x][3];
            this.v[x][2] = a[0][2]*b[x][0] + a[1][2]*b[x][1] + a[2][2]*b[x][2] + a[3][2]*b[x][3];
            this.v[x][3] = a[0][3]*b[x][0] + a[1][3]*b[x][1] + a[2][3]*b[x][2] + a[3][3]*b[x][3];
        }
        return this;
    }

    multiplyPosition(pos) {
        pos[3] = 1;
        return [
            this.v[0][0]*pos[0] + this.v[1][0]*pos[1] + this.v[2][0]*pos[2] + this.v[3][0]*pos[3],
            this.v[0][1]*pos[0] + this.v[1][1]*pos[1] + this.v[2][1]*pos[2] + this.v[3][1]*pos[3],
            this.v[0][2]*pos[0] + this.v[1][2]*pos[1] + this.v[2][2]*pos[2] + this.v[3][2]*pos[3],
            1,
        ];
    }

    push() {
        this.stack.push(this.v);
        return this;
    }

    pop() {
        this.v = this.stack.pop();
        return this;
    }

}
