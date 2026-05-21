class World {
    constructor(url) {
        this._user          = null;
        this._lightAmbient  = null;
        this._lights        = [];
        this._collision     = null;
        this._loaded        = false;
        this._keyboardBound = false;

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
        if (u.radius)          this._user.setRadius(u.radius);
        if (u.gravity)         this._user.setGravity(u.gravity);
        if (u.maxJumpVelocity) this._user.setMaxJumpVelocity(u.maxJumpVelocity);

        this._lightAmbient = data.lights.ambient;
        this._lights = data.lights.sources.map(s => new Light(s.color, s.range, s.position));

        object3dFactory.load('map', data.map);
        for (const [code, url] of Object.entries(data.instances)) {
            instanceFactory.load(code, url);
        }

        this._loaded = true;
    }

    isReady() {
        if (!this._loaded || !object3dFactory.isReady() || !instanceFactory.isReady()) return false;
        if (!this._collision) {
            this._collision = new Collision();
            this._collision.addMap(object3dFactory.get('map'));
            instanceFactory.getAll().forEach(inst => this._collision.addInstance(inst));
            // Snap player to floor on first load
            const floorY = this._collision.getFloor(this._user.x, this._user.z, this._user.getRadius());
            if (floorY !== -Infinity) this._user.y = floorY;
        }
        return true;
    }

    update(dt, keyboard, mouse) {
        // Bind jump callbacks once
        if (!this._keyboardBound) {
            keyboard.onJumpPress  = () => this._user.pressJump();
            keyboard.onJumpRelease = () => this._user.releaseJump();
            this._keyboardBound = true;
        }

        const user   = this._user;
        const action = keyboard.readKeyAction();

        // 1. Save instance transforms (needed for platform riding + blocking)
        this.getInstances().filter(i => i.isCollidable())
            .forEach(inst => inst.savePreviousTransform());

        // 2. Player input
        user.beginFrame(dt);
        user.setWalkSlow(keyboard.readKey('AltLeft') || keyboard.readKey('AltRight'));
        user.setCrouch(keyboard.readKeyCtrl());
        if (keyboard.readKeyForward())     user.moveForward();
        if (keyboard.readKeyBackward())    user.moveBackward();
        if (keyboard.readKeyStrafeLeft())  user.strafeLeft();
        if (keyboard.readKeyStrafeRight()) user.strafeRight();

        const lookDelta = dt * 1.5;
        user.lookMouse(
            mouse.readDeltaX() + (keyboard.readKey('KeyU') ? -lookDelta : 0) + (keyboard.readKey('KeyI') ? lookDelta : 0),
            mouse.readDeltaY()
        );

        // 3. Animate instances
        this.getInstances().forEach(inst => inst.update(dt, user, action));

        // 4. Refresh dynamic collider triangles
        this._collision.updateDynamicColliders();

        // 5. Platform riding
        this._collision.applyPlatformRiding(user, this.getInstances());

        // 6. Player physics + collision
        user.updateMove(this._collision);

        // 7. Object-player blocking (rollback)
        this._collision.resolveObjectPlayerBlockage(user, this.getInstances());

        // 8. Damage
        this.getInstances().forEach(inst => inst.checkDamage(user, dt));
    }

    getUser()         { return this._user; }
    getLightAmbient() { return this._lightAmbient; }
    getLights()       { return this._lights; }
    getMap()          { return object3dFactory.get('map'); }
    getInstances()    { return instanceFactory.getAll(); }
    getCollision()    { return this._collision; }
}
