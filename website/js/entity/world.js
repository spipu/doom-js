class World extends AbstractLoadedEntity {
    constructor(id, url, callback) {
        super(id, url, callback);

        this._user          = null;
        this._background    = [0, 0, 0];
        this._lightAmbient  = null;
        this._lights        = [];
        this._collision     = null;
        this._keyboardBound = false;

    }

    finalizeInit() {
        this._collision = new Collision();
        this._collision.addMap(loader.objects().getByCode('map'));
        loader.instances().getAll().forEach(inst => this._collision.addInstance(inst));
        // Snap player to floor on first load — maxSearchY caps to spawn Y to avoid snapping
        // onto overhead faces (arch tops, lift) that getFloor would otherwise pick as highest floor
        const floorY = this._collision.getFloor(this._user.x, this._user.z, this._user.getRadius(), this._user.y);
        if (floorY !== -Infinity) {
            this._user.y = floorY;
        }
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
        if (keyboard.readKeyForward()) {
            user.moveForward();
        }
        if (keyboard.readKeyBackward()) {
            user.moveBackward();
        }
        if (keyboard.readKeyStrafeLeft()) {
            user.strafeLeft();
        }
        if (keyboard.readKeyStrafeRight()) {
            user.strafeRight();
        }

        const lookDelta = dt * 1.5;
        user.lookMouse(
            mouse.readDeltaX() + (keyboard.readKey('KeyJ') ? -lookDelta : 0) + (keyboard.readKey('KeyL') ? lookDelta : 0),
            mouse.readDeltaY() + (keyboard.readKey('KeyI') ? -lookDelta : 0) + (keyboard.readKey('KeyK') ? lookDelta : 0)
        );

        // 3. Animate instances
        this.getInstances().forEach(inst => inst.update(dt, user, action));

        // 4. Refresh dynamic collider triangles
        this._collision.updateDynamicColliders();

        // 5. Platform riding
        this._collision.applyPlatformRiding(user);

        // 6. Player physics + collision
        user.updateMove(this._collision);

        // 7. Object-player blocking (rollback)
        this._collision.resolveObjectPlayerBlockage(user);

        // 8. Damage
        this.getInstances().forEach(inst => inst.checkDamage(user, dt));
    }

    getUser() {
        return this._user;
    }

    getBackground() {
        return this._background;
    }

    getLightAmbient() {
        return this._lightAmbient;
    }

    getLights() {
        return this._lights;
    }

    getMap() {
        return loader.objects().getByCode('map');
    }

    getInstances() {
        return loader.instances().getAll();
    }

    getCollision() {
        return this._collision;
    }
}
