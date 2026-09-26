class World extends AbstractLoadedEntity {
    constructor(id, url, callback) {
        super(id, url, callback);

        this._users         = [];
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
        for (const user of this._users) {
            this._collision.addUser(user);
            this._snapToFloor(user);
        }
    }

    // Capped at the user's Y so an overhead face (arch top) is not taken for the floor
    _snapToFloor(user) {
        const floorY = this._collision.getFloor(user.x, user.z, user.getRadius(), user.y);
        if (floorY !== -Infinity) {
            user.y = floorY;
        }
    }

    /**
     * @param {number}                 dt       - milliseconds
     * @param {Map<User, UserCommand>} commands - this turn's command of each user;
     *                                            a user without one stands still
     */
    update(dt, commands) {
        const users = this._users;
        const turn  = users.map((user) => ({
            user:     user,
            command:  (commands.get(user) ?? World.NEUTRAL_COMMAND),
            previous: user.getLastCommand(),
        }));

        // 1. Save instance transforms (riding and blocking)
        this.getInstances().filter((i) => i.isCollidable())
            .forEach((inst) => inst.savePreviousTransform());

        // 2. User commands
        turn.forEach((entry) => this._applyCommand(entry.user, entry.command, entry.previous, dt));

        // 3. Animate instances: ride, then each user's triggers, then the animation
        this.getInstances().forEach((inst) => {
            inst.followRide();
            turn.forEach((entry) => inst.checkTriggers(entry.user, entry.command.isPressed(UserCommand.ACTION)));
            inst.advance(dt);
        });

        // 4. Update interactions
        loader.interactions().updateAll(dt);

        turn.forEach((entry) => this._reportUseFailure(entry.user, entry.command, entry.previous));

        // 5. Refresh dynamic collider triangles, and the box blockers that rode
        // a moving floor in step 3
        this._collision.updateDynamicColliders();
        this._collision.syncRidingBoxes();

        // 5b. Mover pressure, before riding and the users' moves, so they are
        // never clipped against the mover's advanced pose
        this._collision.resolveMoverPressure(users);

        // 6-7. Platform riding, then physics + collision
        users.forEach((user) => {
            this._collision.applyPlatformRiding(user);
            user.updateMove(this._collision);
        });

        // 8. Object-user blocking (rollback)
        this._collision.resolveObjectUserBlockage(users);

        // 9. Damage
        this.getInstances().forEach((inst) => inst.checkDamage(users, dt));

        // 10. Despawn, after the loops so the list is never mutated mid-iteration
        loader.instances().flushRemovals();
    }

    // The move follows the yaw of the previous turn, the look comes after.
    _applyCommand(user, command, previous, dt) {
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
    }

    // A fresh press refused by a condition or swallowed by a wall. Consumed
    // every turn so held presses stay silent.
    _reportUseFailure(user, command, previous) {
        const useState = user.consumeUseState();
        if (command.isJustPressed(UserCommand.ACTION, previous)
            && ((useState.seen && !useState.accepted)
                || (!useState.seen && this._useProbeHitsWall(user)))) {
            user.notifyUseFailed();
        }
    }

    // The body the world definition describes: the first user.
    setUser(user) {
        this._users = [user];
        return this;
    }

    /**
     * A user joining the loaded world, snapped to the floor under its position.
     *
     * @param {User} user
     */
    addUser(user) {
        this._users.push(user);
        this._collision.addUser(user);
        this._snapToFloor(user);
        return this;
    }

    removeUser(user) {
        this._users = this._users.filter((other) => (other !== user));
        this._collision.removeUser(user);
        return this;
    }

    getUsers() {
        return this._users;
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

    // The first user: the body the world definition built.
    getUser() {
        return (this._users[0] ?? null);
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

// What a user without a command this turn does: nothing.
World.NEUTRAL_COMMAND = new UserCommand();
