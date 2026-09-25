/**
 * The van demo scene: a fixed camera over a lit ground, and one van whose pose (x, z, angle)
 * is the whole state of the demo. Shared by the single-player and the network versions.
 */
class DemoVanScene {
    /** @type {ScreenManager} */ _screen;
    /** @type {Engine3d}      */ _engine;
    /** @type {Light}         */ _sunLight;
    /** @type {Light}         */ _greenLight;
    /** @type {Light}         */ _redLight;
    /** @type {number}        */ _x;
    /** @type {number}        */ _z;
    /** @type {number}        */ _angle;

    constructor(screenId) {
        this._x     = DemoVanScene.START_X;
        this._z     = DemoVanScene.START_Z;
        this._angle = 0;

        this._sunLight   = new Light([255., 255., 255.], 30, [0., 25., 0.]);
        this._greenLight = new Light([0., 200., 0.], 5, [9, 2., 0.]);
        this._redLight   = new Light([200., 0., 0.], 5, [-8, 2., 0.]);

        this._screen = new ScreenManager(screenId, {
            fullscreen: true,
            virtualWidth: 1920,
            virtualHeight: 1080
        });
        this._engine = new Engine3d(this._screen, new Object3dRendererList().getRenderer('webgl'));
        this._engine.setFov(45.0);
        this._engine.setZBuffer(1, 100);
        this._engine.setBackground(20, 20, 20);
        this._engine.setLightAmbient([40., 40., 40.]);
        this._engine.addLight(this._sunLight);
        this._engine.addLight(this._greenLight);
        this._engine.addLight(this._redLight);
    }

    static load() {
        loader.objects().loadByCode('ground', './assets/objects/ground.obj.json');
        loader.objects().loadByCode('van', './assets/objects/van.obj.json');
    }

    getScreen() {
        return this._screen;
    }

    getEngine() {
        return this._engine;
    }

    getX() {
        return this._x;
    }

    getZ() {
        return this._z;
    }

    getAngle() {
        return this._angle;
    }

    setPose(x, z, angle) {
        this._x     = x;
        this._z     = z;
        this._angle = angle;
        return this;
    }

    /**
     * @returns {number} the elapsed time since the previous frame
     */
    beginFrame(timestamp) {
        this._engine.calculateDeltaTime(timestamp);
        return this._engine.getDeltaTime();
    }

    drive(dt, joyX, joyY) {
        if (joyY === 0) {
            return;
        }
        this._angle += dt * DemoVanScene.TURN_SPEED * joyX * ((joyY > 0) ? 1 : -1);
        this._x     += dt * DemoVanScene.SPEED * joyY * Math.cos(DEG_TO_RAD * this._angle);
        this._z     -= dt * DemoVanScene.SPEED * joyY * Math.sin(DEG_TO_RAD * this._angle);
        this._x      = Math.min(Math.max(this._x, -DemoVanScene.LIMIT_X), DemoVanScene.LIMIT_X);
        this._z      = Math.min(Math.max(this._z, -DemoVanScene.LIMIT_Z), DemoVanScene.LIMIT_Z);
    }

    render() {
        const engine = this._engine;

        engine.drawInit();

        engine.matrixIdentity();
        engine.matrixRotateZ(180);
        engine.matrixRotateX(200);
        engine.matrixTranslate(0, -20, -40);
        engine.lightCalculatePosition(this._sunLight);

        engine.matrixPush();
        engine.matrixTranslate(this._x, 0, this._z);
        engine.matrixRotateY(this._angle);
        engine.lightCalculatePosition(this._greenLight);
        engine.lightCalculatePosition(this._redLight);
        engine.drawObject(loader.objects().getByCode('van'));
        engine.matrixPop();

        engine.drawObject(loader.objects().getByCode('ground'));
        engine.drawFinish();
        this._screen.update();
    }
}

DemoVanScene.START_X    = -5;
DemoVanScene.START_Z    = -10;
DemoVanScene.SPEED      = 0.015;
DemoVanScene.TURN_SPEED = 0.1;
DemoVanScene.LIMIT_X    = 25;
DemoVanScene.LIMIT_Z    = 15;
