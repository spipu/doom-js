class Moteur3D {
    constructor(obj_id) {
        this.PI_180       = Math.PI / 180.0;
        this.scr_id       = obj_id;
        this.scr_width    = 0;
        this.scr_height   = 0;
        this.background   = [0, 0, 0];
        this.m_view        = new Matrix();
        this.fov    = 0.0;
        this.view_xMin    = 0.0;
        this.view_xMax    = 0.0;
        this.view_yMin    = 0.0;
        this.view_yMax    = 0.0;
        this.light_lst    = [];
        this.light_amp    = [0, 0, 0];
        this.zBuffer      = [];
        this.z_near       = 0;
        this.z_far        = 0;
        this.z_def        = 1000;
        this.fast_display = false;

        this.m_view.identity();

        this.scr_obj = document.getElementById(obj_id);
        if (!this.scr_obj || !this.scr_obj.getContext) return;

        this.scr_ctx  = this.scr_obj.getContext('2d');
        this.scr_data = [];

        this.setScreen(320, 240);
        this.setView(-32., 32., -24., 24.);
        this.setFov(45.);
    }

    setBackground(r, g, b) {
        this.background[0] = r;
        this.background[1] = g;
        this.background[2] = b;
        this.scr_obj.style.background = 'RGB(' + r + ', ' + g + ', ' + b + ')';
        return this;
    }

    setScreen(w, h) {
        this.scr_width      = w;
        this.scr_height     = h;
        this.scr_obj.width  = w;
        this.scr_obj.height = h;
        this.preComputeViewport();
        return this;
    }

    setFov(angle_fov) {
        this.fov = this.PI_180 * angle_fov;
        this.preComputeViewport();
        return this;
    }

    setView(xMin, xMax, yMin, yMax) {
        this.view_xMin = xMin;
        this.view_xMax = xMax;
        this.view_yMin = yMin;
        this.view_yMax = yMax;
        this.preComputeViewport();
        return this;
    }

    setZBuffer(near, far) {
        this.z_near = near || 1;
        this.z_far  = far  || 80;
        return this;
    }

    fastDisplay(mode) {
        this.fast_display = (mode === 'on');
    }

    preComputeViewport() {
        if (!this.scr_width)  return false;
        if (!this.scr_height) return false;
        if (!this.fov)  return false;
        if (this.view_xMax <= this.view_xMin) return false;
        if (this.view_yMax <= this.view_yMin) return false;

        let sx = this.scr_width  / (this.view_xMax - this.view_xMin);
        let sy = this.scr_height / (this.view_yMax - this.view_yMin);

        const factor_x = sx * (this.view_xMax - this.view_xMin) / (2 * Math.tan(this.fov));
        const factor_y = sy * (this.view_xMax - this.view_xMin) / (2 * Math.tan(this.fov));

        sx = sx * this.view_xMin - 0.5;
        sy = sy * this.view_yMin - 0.5;

        this.calcul_sx = sx;
        this.calcul_sy = sy;
        this.calcul_fx = factor_x;
        this.calcul_fy = factor_y;
    }

    lightAmbient(color) {
        this.light_ambient = color;
        return this;
    }

    lightAdd(color, length, pos) {
        if (!pos) pos = [0., 0., 0.];
        this.light_lst.push(new Light(color, length, this.m_view.multiplyPosition(pos)));
        return this.light_lst.length;
    }

    lightMove(id, pos) {
        if (id) this.light_lst[id - 1].changePos(this.m_view.multiplyPosition(pos));
        return id;
    }

    matrixIdentity() {
        this.m_view.identity();
        return this;
    }

    matrixPush() {
        this.m_view.push();
        return this;
    }

    matrixPop() {
        this.m_view.pop();
        return this;
    }

    matrixTranslate(vx, vy, vz) {
        const m = new Matrix();
        m.translation(vx, vy, vz);
        this.m_view.multiply(m);
        return this;
    }

    matrixRotateX(rx) {
        const m = new Matrix();
        m.rotationX(this.PI_180 * rx);
        this.m_view.multiply(m);
        return this;
    }

    matrixRotateY(ry) {
        const m = new Matrix();
        m.rotationY(this.PI_180 * ry);
        this.m_view.multiply(m);
        return this;
    }

    matrixRotateZ(rz) {
        const m = new Matrix();
        m.rotationZ(this.PI_180 * rz);
        this.m_view.multiply(m);
        return this;
    }

    matrixScale(sx, sy, sz) {
        const m = new Matrix();
        m.scale(sx, sy, sz);
        this.m_view.multiply(m);
        return this;
    }

    drawInit() {
        if (this.fast_display) {
            this.scr_ctx.clearRect(0, 0, this.scr_width, this.scr_height);
        } else {
            const nb = this.scr_width * this.scr_height;
            this.zBuffer  = new Array(nb).fill(this.z_far);
            this.scr_data = this.scr_ctx.createImageData(this.scr_width, this.scr_height);
        }
        return this;
    }

    drawFinish() {
        if (!this.fast_display) {
            this.scr_ctx.putImageData(this.scr_data, 0, 0);
        }
        return this;
    }

    drawObject(obj) {
        obj.ptTransform(this.m_view);
        obj.ptProjection(this);
        if (this.fast_display) {
            obj.fcDrawFast(this);
        } else {
            obj.fcDraw(this);
        }
        return this;
    }

    zBufSet(x, y, z) {
        if (x < 0)                  return false;
        if (y < 0)                  return false;
        if (x > this.scr_width - 1) return false;
        if (y > this.scr_height - 1) return false;
        if (z < this.z_near)        return false;
        if (z > this.z_far)         return false;

        const t = x + y * this.scr_width;
        if (this.zBuffer[t] < z) return false;
        this.zBuffer[t] = z;
        return true;
    }
}
