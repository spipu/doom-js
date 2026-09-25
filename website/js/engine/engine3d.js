const DEG_TO_RAD = Math.PI / 180;

class Engine3d {
    constructor(screenManager, renderer) {
        this.scrWidth         = 0;
        this.scrHeight        = 0;
        this.background       = [0, 0, 0];
        this.sky              = null; // {loaderId, wrap} cylindrical-sky descriptor, or null
        this.depthShading     = null; // depth-based light attenuation curve params, or null
        this.lightOverride    = null; // global light floor 0..1 (scene-wide fullbright), or null
        this.lightBoost       = 0;    // additive scene-wide light 0..1 (brief flashes), 0 = off
        this._overlayCallback = null; // invoked after the scene to draw 2D screen overlays
        this.instanceLight    = 1;    // light multiplier of the instance being drawn (1 for the static map)
        this.instanceRoll     = 0;    // billboard spin of the instance being drawn
        this.textureSmoothing = true; // texture filter: smoothed, or raw texels
        this.viewYaw          = 0;    // cached in setCamera for the sky pass
        this.viewPitch        = 0;
        this.viewMatrix       = new Matrix();
        this.fov              = 0.0;
        // Frustum half-slopes, infinite until preComputeViewport so a
        // half-configured viewport culls nothing.
        this._frustumTanX = Infinity;
        this._frustumTanY = Infinity;
        this._frustumKX   = Infinity;
        this._frustumKY   = Infinity;
        this.viewXMin     = 0.0;
        this.viewXMax     = 0.0;
        this.viewYMin     = 0.0;
        this.viewYMax     = 0.0;
        this.lightList    = [];
        this.zBuffer      = new ZBuffer();

        this._renderer = renderer;

        this._fpsCount         = 0;
        this._fpsDisplay       = 0;
        this._deltaTime        = 0;
        this._deltaLast        = null;
        this._currentTimestamp = 0;
        this._fpsLastCheck     = null;
        // Scene clock (ms) the renderers resolve animated texture frames against
        this.sceneMs           = 0;

        this.viewMatrix.identity();

        this.scrCanvas = screenManager.getCanvas();
        if (!this.scrCanvas || !this.scrCanvas.getContext) {
            return;
        }

        this.scrCtx = this._renderer.initCanvas(this.scrCanvas);

        this.setScreen(320, 240);
        this.setView(-32., 32., -24., 24.);
        this.setFov(45.);

        screenManager.bindEngine(this);
    }

    destroy() {
    }

    calculateDeltaTime(timestamp) {
        this._currentTimestamp = timestamp;
        this._deltaTime = ((this._deltaLast === null) ? 0 : Math.min(timestamp - this._deltaLast, 50));
        this._deltaLast = timestamp;
        this.sceneMs  += Math.round(this._deltaTime);
        return this;
    }

    getDeltaTime() {
        return this._deltaTime;
    }

    // Call on resume so the paused time does not leak into the first live frame
    resetDeltaClock() {
        this._deltaLast = null;
        return this;
    }

    setBackground(r, g, b) {
        this.background[0] = r;
        this.background[1] = g;
        this.background[2] = b;
        this.scrCanvas.style.background = 'RGB(' + r + ', ' + g + ', ' + b + ')';
        return this;
    }

    setSky(sky) {
        this.sky = sky;
        return this;
    }

    // Per-pixel depth light attenuation (WebGL only), or null to disable:
    //   {visibility, visibilityMax, shadeBase, shadeScale, rampCount, strength}
    //   vis      = min(visibility / viewDepth, visibilityMax)
    //   shade    = shadeBase − shadeScale × light      (light: vertex level 0..1)
    //   darkness = clamp((shade − vis) × (rampCount−1), 0, rampCount−1) / rampCount
    //   colour  ×= 1 − strength × darkness
    setDepthShading(params) {
        this.depthShading = params;
        return this;
    }

    // Scene-wide light floor 0..1 (null = off) that also bypasses the depth
    // shading. WebGL only.
    setLightOverride(value) {
        this.lightOverride = value;
        return this;
    }

    // Scene-wide additive light 0..1 on every non-fullbright face, depth shading
    // included. WebGL only.
    setLightBoost(value) {
        this.lightBoost = value;
        return this;
    }

    // 2D overlay drawn over the finished scene, called with (renderer, engine)
    setOverlayCallback(callback) {
        this._overlayCallback = callback;
        return this;
    }

    // WebGL only: the CPU renderers always sample the nearest texel.
    setTextureSmoothing(smooth) {
        this.textureSmoothing = smooth;
        return this;
    }

    setScreen(w, h) {
        this.scrWidth         = w;
        this.scrHeight        = h;
        this.scrCanvas.width  = w;
        this.scrCanvas.height = h;
        this.preComputeViewport();
        return this;
    }

    setFov(degrees) {
        this.fov = DEG_TO_RAD * degrees;
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
        if (!this.scrWidth || !this.scrHeight || !this.fov) {
            return false;
        }
        if (this.viewXMax <= this.viewXMin) {
            return false;
        }
        if (this.viewYMax <= this.viewYMin) {
            return false;
        }

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

        // Derived from the projection, not the FOV: on screen while |x/z| <= tanX
        // and |y/z| <= tanY. k normalises the side planes for the sphere test.
        this._frustumTanX = this.scrWidth  / (2 * factorX);
        this._frustumTanY = this.scrHeight / (2 * factorY);
        this._frustumKX   = Math.sqrt(1 + this._frustumTanX * this._frustumTanX);
        this._frustumKY   = Math.sqrt(1 + this._frustumTanY * this._frustumTanY);
    }

    initFromWorld(world) {
        const bg = world.getBackground();
        this.setBackground(bg[0], bg[1], bg[2]);
        this.setSky(world.getSky());
        this.setLightAmbient(world.getLightAmbient());
        world.getLights().forEach((l) => this.addLight(l));
        return this;
    }

    setLightAmbient(color) {
        this.ambientLight = color;
        return this;
    }

    addLight(light) {
        this.lightList.push(light);
        return this;
    }

    lightsCalculatePosition() {
        this.lightList.forEach((l) => this.lightCalculatePosition(l));
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


    setCamera(user) {
        this.viewYaw   = user.yaw;
        this.viewPitch = user.pitch;
        this.matrixIdentity();
        this.matrixRotateX(user.pitch);
        this.matrixRotateZ(user.getStrafeLean());
        this.matrixRotateY(-user.yaw);
        this.matrixTranslate(-user.getCameraX(), -user.getCameraY(), -user.getCameraZ());
        return this;
    }

    drawInstance(instance) {
        this.matrixPush();
        this.viewMatrix.multiply(Matrix.composeInstanceTransform(instance.getRenderTransform()));
        this.instanceLight = instance.getRenderLight();
        this.instanceRoll  = instance.getRenderRoll();
        this.drawObject(instance.getObject());
        this.instanceLight = 1;
        this.instanceRoll  = 0;
        this.matrixPop();
        return this;
    }

    drawInit() {
        this._renderer.begin(this);
        return this;
    }

    drawObject(obj) {
        obj.ptTransform(this.viewMatrix, this.zBuffer.getNear(), this.instanceRoll);
        if (this._renderer.needsProjection()) {
            obj.ptProjection(this);
        }
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
        world.getInstances().forEach((inst) => {
            if (this.isInView(inst)) {
                this.drawInstance(inst);
            }
        });
        this.drawFinish();
        return this;
    }

    // Bounding-sphere frustum test in camera space. The render offset widens the
    // radius instead of moving the centre: applied before the rotations, it is
    // not a pure world translation.
    isInView(instance) {
        const c  = instance.getWorldCenter();
        const m  = this.viewMatrix.v;
        const cz = m[0][2]*c[0] + m[1][2]*c[1] + m[2][2]*c[2] + m[3][2];
        const r  = instance.getObject().getBoundingRadius() + instance.getRenderOffsetBound() + instance.getRenderRollBound();
        if ((cz + r < this.zBuffer.getNear()) || (cz - r > this.zBuffer.getFar())) {
            return false;
        }
        const cx = m[0][0]*c[0] + m[1][0]*c[1] + m[2][0]*c[2] + m[3][0];
        if (Math.abs(cx) - this._frustumTanX * cz > r * this._frustumKX) {
            return false;
        }
        const cy = m[0][1]*c[0] + m[1][1]*c[1] + m[2][1]*c[2] + m[3][1];
        return (Math.abs(cy) - this._frustumTanY * cz <= r * this._frustumKY);
    }

    drawFinish() {
        // end() flushes the frame and would wipe an overlay drawn before it
        this._renderer.end(this);
        if (this._overlayCallback !== null) {
            this._overlayCallback(this._renderer, this);
        }
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
