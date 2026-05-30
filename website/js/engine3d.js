class Engine3d {
    constructor(canvasId, renderer) {
        this.scrWidth  = 0;
        this.scrHeight = 0;
        this.background = [0, 0, 0];
        this.viewMatrix     = new Matrix();
        this.fov        = 0.0;
        this.viewXMin = 0.0;
        this.viewXMax = 0.0;
        this.viewYMin = 0.0;
        this.viewYMax = 0.0;
        this.lightList = [];
        this.zBuffer   = new ZBuffer();

        this._renderer = renderer;

        this._fpsCount        = 0;
        this._fpsDisplay      = 0;
        this._deltaTime       = 0;
        this._deltaLast       = null;
        this._currentTimestamp = 0;
        this._fpsLastCheck    = null;
        this._sceneMs         = 0;

        this.viewMatrix.identity();

        this.scrCanvas = document.getElementById(canvasId);
        if (!this.scrCanvas || !this.scrCanvas.getContext) {
            return;
        }

        this.scrCtx = this._renderer.initCanvas(this.scrCanvas);

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
        this._sceneMs  += Math.round(this._deltaTime);
        return this;
    }

    getDeltaTime() {
        return this._deltaTime;
    }

    setBackground(r, g, b) {
        this.background[0] = r;
        this.background[1] = g;
        this.background[2] = b;
        this.scrCanvas.style.background = 'RGB(' + r + ', ' + g + ', ' + b + ')';
        return this;
    }

    setScreen(w, h) {
        this.scrWidth      = w;
        this.scrHeight     = h;
        this.scrCanvas.width  = w;
        this.scrCanvas.height = h;
        this.preComputeViewport();
        return this;
    }

    setFov(angle_fov) {
        this.fov = DEG_TO_RAD * angle_fov;
        this.preComputeViewport();
        return this;
    }

    setView(xMin, xMax, yMin, yMax) {
        this.viewXMin = xMin;
        this.viewXMax = xMax;
        this.viewYMin = yMin;
        this.viewYMax = yMax;
        this.preComputeViewport();
        return this;
    }

    setZBuffer(near, far) {
        this.zBuffer.setRange(near || 1, far || 80);
        return this;
    }

    preComputeViewport() {
        if (!this.scrWidth || !this.scrHeight || !this.fov) return false;
        if (this.viewXMax <= this.viewXMin) return false;
        if (this.viewYMax <= this.viewYMin) return false;

        let sx = this.scrWidth  / (this.viewXMax - this.viewXMin);
        let sy = this.scrHeight / (this.viewYMax - this.viewYMin);

        const factorX = sx * (this.viewXMax - this.viewXMin) / (2 * Math.tan(this.fov));
        const factorY = sy * (this.viewXMax - this.viewXMin) / (2 * Math.tan(this.fov));

        sx = sx * this.viewXMin - 0.5;
        sy = sy * this.viewYMin - 0.5;

        this.projOffsetX = sx;
        this.projOffsetY = sy;
        this.projScaleX = factorX;
        this.projScaleY = factorY;
    }

    initFromWorld(world) {
        const bg = world.getBackground();
        this.setBackground(bg[0], bg[1], bg[2]);
        this.lightAmbient(world.getLightAmbient());
        world.getLights().forEach(l => this.lightAdd(l));
        return this;
    }

    lightAmbient(color) {
        this.ambientLight = color;
        return this;
    }

    lightAdd(light) {
        this.lightList.push(light);
        return this;
    }

    lightsCalculatePosition() {
        this.lightList.forEach(l => this.lightCalculatePosition(l));
        return this;
    }

    lightCalculatePosition(light) {
        light.calculateFinalPosition(this.viewMatrix);
        return this;
    }

    matrixIdentity() {
        this.viewMatrix.identity();
        return this;
    }

    matrixPush() {
        this.viewMatrix.push();
        return this;
    }

    matrixPop() {
        this.viewMatrix.pop();
        return this;
    }

    matrixTranslate(vx, vy, vz) {
        const m = new Matrix();
        m.translation(vx, vy, vz);
        this.viewMatrix.multiply(m);
        return this;
    }

    matrixRotateX(rx) {
        const m = new Matrix();
        m.rotationX(DEG_TO_RAD * rx);
        this.viewMatrix.multiply(m);
        return this;
    }

    matrixRotateY(ry) {
        const m = new Matrix();
        m.rotationY(DEG_TO_RAD * ry);
        this.viewMatrix.multiply(m);
        return this;
    }

    matrixRotateZ(rz) {
        const m = new Matrix();
        m.rotationZ(DEG_TO_RAD * rz);
        this.viewMatrix.multiply(m);
        return this;
    }

    matrixScale(sx, sy, sz) {
        const m = new Matrix();
        m.scale(sx, sy, sz);
        this.viewMatrix.multiply(m);
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
        if (irx) {
            this.matrixRotateX(irx);
        }
        if (irz) {
            this.matrixRotateZ(irz);
        }
        if (iry) {
            this.matrixRotateY(iry);
        }
        if (dtx || dty || dtz) {
            this.matrixTranslate(dtx, dty, dtz);
        }
        if (drx) {
            this.matrixRotateX(drx);
        }
        if (drz) {
            this.matrixRotateZ(drz);
        }
        if (dry) {
            this.matrixRotateY(dry);
        }
        this.drawObject(instance.getObject());
        this.matrixPop();
        return this;
    }

    drawInit() {
        this._renderer.begin(this);
        return this;
    }

    drawObject(obj) {
        obj.ptTransform(this.viewMatrix);
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
