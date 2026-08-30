class World extends AbstractLoadedEntity {
    constructor(id, url, callback) {
        super(id, url, callback);

        this._user          = null;
        this._background    = [0, 0, 0];
        this._sky           = null;
        this._lightAmbient  = null;
        this._lights        = [];
        this._collision     = null;
        this._jumpWasDown   = false;
        this._actionWasDown = false;
    }

    // Flat forward ray from the eye (uses are 2D): a wall inside the probe
    // distance is what swallowed the press.
    _useProbeHitsWall(user) {
        const yawRad = DEG_TO_RAD * user.yaw;

        return (this._collision.raycast(
            user.x, user.getCameraY(), user.z,
            Math.sin(yawRad), 0, Math.cos(yawRad),
            user.getUseProbeDistance()
        ) !== null);
    }

    finalizeInit() {
        this._collision = new Collision();
        this._collision.addMap(loader.objects().getByCode('map'));
        loader.instances().getAll().forEach((inst) => this._collision.addInstance(inst));
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
        this.getInstances().filter((i) => i.isCollidable())
            .forEach((inst) => inst.savePreviousTransform());

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
        this.getInstances().forEach((inst) => inst.update(dt, user, action));

        // 4. Update interactions
        loader.interactions().updateAll(dt);

        // Use feedback: a fresh press that reached nothing usable — refused by
        // a trigger condition (locked door), or swallowed by a bare wall at
        // probe distance. Consumed every frame so held presses stay silent.
        const useState = user.consumeUseState();
        if (action && !this._actionWasDown
            && ((useState.seen && !useState.accepted)
                || (!useState.seen && this._useProbeHitsWall(user)))) {
            user.notifyUseFailed();
        }
        this._actionWasDown = action;

        // 5. Refresh dynamic collider triangles, and the box blockers that rode
        // a moving floor in step 3
        this._collision.updateDynamicColliders();
        this._collision.syncRidingBoxes();

        // 5b. Mover-caused pressure (stall/reverse rollback) — resolved BEFORE
        // riding and the player's own movement, so the player is never clipped
        // against the mover's advanced pose (a stalled door hovers at contact
        // and its walls stay out of his body — he can walk out from under it).
        this._collision.resolveMoverPressure(user);

        // 6. Platform riding
        this._collision.applyPlatformRiding(user);

        // 7. Player physics + collision
        user.updateMove(this._collision);

        // 8. Object-player blocking (rollback)
        this._collision.resolveObjectPlayerBlockage(user);

        // 9. Damage
        this.getInstances().forEach((inst) => inst.checkDamage(user, dt));

        // 10. Despawn instances flagged for removal this frame (e.g. picked-up
        // items) — done after all the per-frame loops so the list is never
        // mutated mid-iteration.
        loader.instances().flushRemovals();
    }

    /**
     * Scene contents, written once by the loader that reads the definition:
     * the player, the background colour, the optional sky descriptor, the
     * ambient level and the point lights. Chainable, like every configuration
     * setter of the engine.
     */
    setUser(user) {
        this._user = user;
        return this;
    }

    setBackground(background) {
        this._background = background;
        return this;
    }

    setSky(sky) {
        this._sky = sky;
        return this;
    }

    setLightAmbient(ambient) {
        this._lightAmbient = ambient;
        return this;
    }

    setLights(lights) {
        this._lights = lights;
        return this;
    }

    getUser() {
        return this._user;
    }

    getBackground() {
        return this._background;
    }

    getSky() {
        return this._sky;
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
