class World {
    constructor(url) {
        this._user         = null;
        this._lightAmbient = null;
        this._lights       = [];
        this._loaded       = false;

        object3dFactory.reset();
        instanceFactory.reset();

        fetch(url)
            .then(r => r.json())
            .then(data => this._init(data))
            .catch(e => console.error('Failed to load world "' + url + '": ' + e));
    }

    _init(data) {
        const u = data.user;
        this._user = new User(u.position[0], u.position[1], u.position[2], u.yaw, u.pitch, u.maxEnergy)
            .setHeight(u.height)
            .setEyeRatio(u.eyeRatio);

        this._lightAmbient = data.lights.ambient;
        this._lights = data.lights.sources.map(s => new Light(s.color, s.range, s.position));

        object3dFactory.load('map', data.map);
        for (const [code, url] of Object.entries(data.instances)) {
            instanceFactory.load(code, url);
        }

        this._loaded = true;
    }

    update(dt, keyboard, mouse) {
        const user   = this._user;
        const action = keyboard.readKeyAction();

        user.beginFrame(dt);

        if (keyboard.readKeyForward())     user.moveForward();
        if (keyboard.readKeyBackward())    user.moveBackward();
        if (keyboard.readKeyStrafeLeft())  user.strafeLeft();
        if (keyboard.readKeyStrafeRight()) user.strafeRight();

        const lookDelta = dt * 1.5;
        user.lookMouse(
            mouse.readDeltaX() + (keyboard.readKey('KeyU') ? -lookDelta : 0) + (keyboard.readKey('KeyI') ? lookDelta : 0),
            mouse.readDeltaY()
        );

        user.updateMove();
        this.getInstances().forEach(inst => inst.update(dt, user, action));
    }

    isReady() {
        return this._loaded && object3dFactory.isReady() && instanceFactory.isReady();
    }

    getUser()         { return this._user; }
    getLightAmbient() { return this._lightAmbient; }
    getLights()       { return this._lights; }
    getMap()          { return object3dFactory.get('map'); }
    getInstances()    { return instanceFactory.getAll(); }
}
