class World extends AbstractLoadedEntity {
    constructor(id, url, callback) {
        super(id, url, callback);

        this._user          = null;
        this._background    = [0, 0, 0];
        this._sky           = null;
        this._lightAmbient  = null;
        this._lights        = [];
        this._collision     = null;
    }

    // Flat forward ray from the eye: uses are 2D
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
        // Capped at the spawn Y so an overhead face (arch top) is not taken for the floor
        const floorY = this._collision.getFloor(this._user.x, this._user.z, this._user.getRadius(), this._user.y);
        if (floorY !== -Infinity) {
            this._user.y = floorY;
        }
    }

    /**
     * @param {number}      dt      - milliseconds
     * @param {UserCommand} command - the player's command for this turn
     */
    update(dt, command) {
        const user     = this._user;
        const previous = user.getLastCommand();
        const action   = command.isPressed(UserCommand.ACTION);

        // 1. Save instance transforms (riding and blocking)
        this.getInstances().filter((i) => i.isCollidable())
            .forEach((inst) => inst.savePreviousTransform());

        // 2. Player command: the move follows the yaw of the previous turn, the look comes after
        user.beginFrame(dt);
        user.setWalkSlow(command.isPressed(UserCommand.WALK_SLOW));
        user.setCrouch(command.isPressed(UserCommand.CROUCH));
        if (command.isJustPressed(UserCommand.JUMP, previous)) {
            user.pressJump();
        }
        if (command.isJustReleased(UserCommand.JUMP, previous)) {
            user.releaseJump();
        }
        user.move(command.getMoveY());
        user.strafe(command.getMoveX());
        user.look(command.getLookYaw(), command.getLookPitch());
        user.setLastCommand(command);

        // 3. Animate instances
        this.getInstances().forEach((inst) => inst.update(dt, user, action));

        // 4. Update interactions
        loader.interactions().updateAll(dt);

        // Use failure: a fresh press refused by a condition or swallowed by a wall.
        // Consumed every frame so held presses stay silent.
        const useState = user.consumeUseState();
        if (command.isJustPressed(UserCommand.ACTION, previous)
            && ((useState.seen && !useState.accepted)
                || (!useState.seen && this._useProbeHitsWall(user)))) {
            user.notifyUseFailed();
        }

        // 5. Refresh dynamic collider triangles, and the box blockers that rode
        // a moving floor in step 3
        this._collision.updateDynamicColliders();
        this._collision.syncRidingBoxes();

        // 5b. Mover pressure, before riding and the player's move, so he is never
        // clipped against the mover's advanced pose
        this._collision.resolveMoverPressure(user);

        // 6. Platform riding
        this._collision.applyPlatformRiding(user);

        // 7. Player physics + collision
        user.updateMove(this._collision);

        // 8. Object-player blocking (rollback)
        this._collision.resolveObjectPlayerBlockage(user);

        // 9. Damage
        this.getInstances().forEach((inst) => inst.checkDamage(user, dt));

        // 10. Despawn, after the loops so the list is never mutated mid-iteration
        loader.instances().flushRemovals();
    }

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
