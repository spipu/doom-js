const DEG_TO_RAD = Math.PI / 180;

class Engine3d {
    constructor(obj_id, initialRenderer = 'full') {
        this.scr_width  = 0;
        this.scr_height = 0;
        this.background = [0, 0, 0];
        this.m_view     = new Matrix();
        this.fov       = 0.0;
        this.view_xMin = 0.0;
        this.view_xMax = 0.0;
        this.view_yMin = 0.0;
        this.view_yMax = 0.0;
        this.light_lst = [];
        this.zBuffer   = new ZBuffer();

        this._renderer = new Object3dRenderer();
        this._renderer.addRenderer(new Object3dRendererFull());
        this._renderer.addRenderer(new Object3dRendererFlat());
        this._renderer.addRenderer(new Object3dRendererFast());
        this._renderer.addRenderer(new Object3dRendererWebGL());

        this._renderer.setRenderer(initialRenderer);

        this._fpsEnabled   = false;
        this._fpsCount     = 0;
        this._fpsDisplay   = 0;
        this._fpsLastCheck = 0;
        this._deltaTime    = 0;
        this._deltaLast    = new Date().getTime();

        this.m_view.identity();

        this.scr_obj = document.getElementById(obj_id);
        if (!this.scr_obj || !this.scr_obj.getContext) return;

        this.scr_ctx = this._renderer.initCanvas(this.scr_obj);

        this.setScreen(320, 240);
        this.setView(-32., 32., -24., 24.);
        this.setFov(45.);
    }

    enableFps() {
        this._fpsEnabled   = true;
        this._fpsCount     = 0;
        this._fpsDisplay   = 0;
        this._fpsLastCheck = (new Date()).getTime();

        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'position:relative;display:inline-block;';
        this.scr_obj.parentNode.insertBefore(wrapper, this.scr_obj);
        wrapper.appendChild(this.scr_obj);

        this._fpsDiv = document.createElement('div');
        this._fpsDiv.style.cssText = 'position:absolute;right:5px;bottom:5px;color:white;text-shadow:1px 1px 3px black;font:12px verdana;pointer-events:none;';
        wrapper.appendChild(this._fpsDiv);

        return this;
    }

    destroy() {
        if (this._fpsDiv) {
            const wrapper = this._fpsDiv.parentNode;
            if (wrapper) {
                wrapper.parentNode.insertBefore(this.scr_obj, wrapper);
                wrapper.remove();
            }
            this._fpsDiv = null;
        }
    }

    calculateDeltaTime() {
        const now = new Date().getTime();
        this._deltaTime = now - this._deltaLast;
        this._deltaLast = now;
        return this;
    }

    getDeltaTime() {
        return this._deltaTime;
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
        this.fov = DEG_TO_RAD * angle_fov;
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
        this.zBuffer.setRange(near || 1, far || 80);
        return this;
    }

    preComputeViewport() {
        if (!this.scr_width || !this.scr_height || !this.fov) return false;
        if (this.view_xMax <= this.view_xMin) return false;
        if (this.view_yMax <= this.view_yMin) return false;

        let sx = this.scr_width  / (this.view_xMax - this.view_xMin);
        let sy = this.scr_height / (this.view_yMax - this.view_yMin);

        const factor_x = sx * (this.view_xMax - this.view_xMin) / (2 * Math.tan(this.fov));
        const factor_y = sy * (this.view_xMax - this.view_xMin) / (2 * Math.tan(this.fov));

        sx = sx * this.view_xMin - 0.5;
        sy = sy * this.view_yMin - 0.5;

        this.proj_offsetX = sx;
        this.proj_offsetY = sy;
        this.proj_scaleX = factor_x;
        this.proj_scaleY = factor_y;
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

    matrixIdentity() { this.m_view.identity(); return this; }
    matrixPush()     { this.m_view.push();     return this; }
    matrixPop()      { this.m_view.pop();      return this; }

    matrixTranslate(vx, vy, vz) {
        const m = new Matrix();
        m.translation(vx, vy, vz);
        this.m_view.multiply(m);
        return this;
    }

    matrixRotateX(rx) {
        const m = new Matrix();
        m.rotationX(DEG_TO_RAD * rx);
        this.m_view.multiply(m);
        return this;
    }

    matrixRotateY(ry) {
        const m = new Matrix();
        m.rotationY(DEG_TO_RAD * ry);
        this.m_view.multiply(m);
        return this;
    }

    matrixRotateZ(rz) {
        const m = new Matrix();
        m.rotationZ(DEG_TO_RAD * rz);
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
        this._renderer.begin(this);
        return this;
    }

    drawObject(obj) {
        obj.ptTransform(this.m_view);
        obj.ptProjection(this);
        this._renderer.draw(obj, this);
        return this;
    }

    drawFinish() {
        this._renderer.end(this);
        this.drawFps();
        return this;
    }

    drawFps() {
        if (!this._fpsEnabled) return;

        const now = new Date().getTime();
        this._fpsCount++;

        if (now - this._fpsLastCheck >= 1000) {
            this._fpsDisplay   = Math.floor(this._fpsCount * 1000 / (now - this._fpsLastCheck));
            this._fpsCount     = 0;
            this._fpsLastCheck = now;
        }

        this._fpsDiv.innerText = this._fpsDisplay + ' fps';
    }
}
