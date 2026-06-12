class World extends AbstractLoadedEntity {
    constructor(id, url, callback) {
        super(id, url, callback);

        this._user          = null;
        this._background    = [0, 0, 0];
        this._lightAmbient  = null;
        this._lights        = [];
        this._collision     = null;
        this._jumpWasDown   = false;

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

    update(dt, inputs) {
        const user   = this._user;
        const action = inputs.readButtonAction();

        // 1. Save instance transforms (needed for platform riding + blocking)
        this.getInstances().filter(i => i.isCollidable())
            .forEach(inst => inst.savePreviousTransform());

        // 2. Player input
        user.beginFrame(dt);
        user.setWalkSlow(inputs.readButtonWalkSlow());
        user.setCrouch(inputs.readButtonCrouch());
        // Jump press/release edges, interpreted from the unified button state
        const jumpDown = inputs.readButtonJump();
        if (jumpDown && !this._jumpWasDown) {
            user.pressJump();
        }
        if (!jumpDown && this._jumpWasDown) {
            user.releaseJump();
        }
        this._jumpWasDown = jumpDown;
        // The axis magnitude is applied proportionally: keyboard gives ±1
        // (binary), the sticks give their analog deflection
        user.move(inputs.readJoy1Y());
        user.strafe(inputs.readJoy1X());

        user.lookMouse(inputs.readJoy2DeltaX(dt), inputs.readJoy2DeltaY(dt));

        // 3. Animate instances
        this.getInstances().forEach(inst => inst.update(dt, user, action));

        // 4. Update interactions
        loader.interactions().updateAll(dt);

        // 5. Refresh dynamic collider triangles
        this._collision.updateDynamicColliders();

        // 6. Platform riding
        this._collision.applyPlatformRiding(user);

        // 7. Player physics + collision
        user.updateMove(this._collision);

        // 8. Object-player blocking (rollback)
        this._collision.resolveObjectPlayerBlockage(user);

        // 9. Damage
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
