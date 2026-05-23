class Engine3d {
    constructor(obj_id, renderer) {
        this.scr_width  = 0;
        this.scr_height = 0;
        this.background = [0, 0, 0];
        this.m_view     = new Matrix();
        this.fov        = 0.0;
        this.view_xMin = 0.0;
        this.view_xMax = 0.0;
        this.view_yMin = 0.0;
        this.view_yMax = 0.0;
        this.light_lst = [];
        this.zBuffer   = new ZBuffer();

        this._renderer = renderer;

        this._fpsCount        = 0;
        this._fpsDisplay      = 0;
        this._deltaTime       = 0;
        this._deltaLast       = null;
        this._currentTimestamp = 0;
        this._fpsLastCheck    = null;

        this.m_view.identity();

        this.scr_obj = document.getElementById(obj_id);
        if (!this.scr_obj || !this.scr_obj.getContext) return;

        this.scr_ctx = this._renderer.initCanvas(this.scr_obj);

        this.setScreen(320, 240);
        this.setView(-32., 32., -24., 24.);
        this.setFov(45.);
    }

    destroy() {
    }

    calculateDeltaTime(timestamp) {
        this._currentTimestamp = timestamp;
        this._deltaTime = this._deltaLast === null ? 0 : Math.min(timestamp - this._deltaLast, 50);
        this._deltaLast = timestamp;
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

    lightAdd(light) {
        this.light_lst.push(light);
        return this;
    }

    lightsCalculatePosition() {
        this.light_lst.forEach(l => this.lightCalculatePosition(l));
        return this;
    }

    lightCalculatePosition(light) {
        light.calculateFinalPosition(this.m_view);
        return this;
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

    setCamera(user) {
        this.matrixIdentity();
        this.matrixRotateX(user.pitch);
        this.matrixRotateZ(user.getStrafeLean());
        this.matrixRotateY(-user.yaw);
        this.matrixTranslate(-user.getCameraX(), -user.getCameraY(), -user.getCameraZ());
        return this;
    }

    drawInstance(instance) {
        const tf              = instance.getTransform();
        const [px, py, pz]    = tf.position;
        const [irx, iry, irz] = tf.rotation;
        const [dtx, dty, dtz] = tf.deltaTranslate;
        const [drx, dry, drz] = tf.deltaRotate;
        this.matrixPush();
        this.matrixTranslate(px, py, pz);
        if (irx) this.matrixRotateX(irx);
        if (irz) this.matrixRotateZ(irz);
        if (iry) this.matrixRotateY(iry);
        if (dtx || dty || dtz) this.matrixTranslate(dtx, dty, dtz);
        if (drx) this.matrixRotateX(drx);
        if (drz) this.matrixRotateZ(drz);
        if (dry) this.matrixRotateY(dry);
        this.drawObject(instance.getObject());
        this.matrixPop();
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

    getFps() {
        return this._fpsDisplay;
    }

    getRendererCode() {
        return this._renderer.code;
    }

    displayWorld(world) {
        this.setCamera(world.getUser());
        this.lightsCalculatePosition();
        this.drawInit();
        this.drawObject(world.getMap());
        world.getInstances().forEach(inst => this.drawInstance(inst));
        this.drawFinish();
        return this;
    }

    drawFinish() {
        this._renderer.end(this);
        this._updateFps();
        return this;
    }

    _updateFps() {
        this._fpsCount++;

        if (this._fpsLastCheck === null) {
            this._fpsLastCheck = this._currentTimestamp;
            return;
        }

        if (this._currentTimestamp - this._fpsLastCheck >= 1000) {
            this._fpsDisplay   = Math.floor(this._fpsCount * 1000 / (this._currentTimestamp - this._fpsLastCheck));
            this._fpsCount     = 0;
            this._fpsLastCheck = this._currentTimestamp;
        }
    }
}
