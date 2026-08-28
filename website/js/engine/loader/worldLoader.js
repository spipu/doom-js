class WorldLoader {
    constructor(loadedCallback) {
        this._loadedCallback = loadedCallback;
        this._userClass      = User;
        this.reset();
    }

    // The player class is injectable so a game can supply its own User subclass
    // without the engine knowing about it (kept generic).
    setUserClass(userClass) {
        this._userClass = userClass;
        return this;
    }

    reset() {
        this._loaded = true;
        this._world  = null;
    }

    isLoaded() {
        return this._loaded;
    }

    load(url) {
        if (this._world !== null) {
            throw new Error('World is already loaded');
        }

        this._loaded = false;
        this._world = new World(0, url, () => this._checkFullyLoaded());
        this._initialiseEntityFromUrl(this._world);
    }

    // Create the World from in-memory data. The map object, the instances and
    // the interactions must have been registered in their loaders beforehand
    // (World.getMap() and World.getInstances() read them from the loaders).
    loadFromData(data) {
        if (this._world !== null) {
            throw new Error('World is already loaded');
        }

        this._loaded = false;
        this._world = new World(0, null, () => this._checkFullyLoaded());

        this._populateWorld(this._world, data);
    }

    // Shared by the in-memory and the URL loading paths.
    _populateWorld(world, data) {
        world
            .setUser(this._initUser(data.user))
            .setBackground(data.background || [0, 0, 0])
            .setSky(data.sky || null)
            .setLightAmbient(data.lights.ambient)
            .setLights(data.lights.sources.map((s) => new Light(s.color, s.range, s.position)))
        ;
        world.setLoaded();
    }

    _initialiseEntityFromUrl(entity) {
        appBootstrap.fetchJson(entity.getUrl(), (data) => {

            loader.objects().loadByCode('map', data.map);
            (data.instances || []).forEach((url) => loader.instances().load(url));
            (data.interactions || []).forEach((url) => loader.interactions().load(url));

            this._populateWorld(entity, data);
        });
    }

    _initUser(dataUser) {
        const UserClass = this._userClass;
        const user = new UserClass(dataUser.position[0], dataUser.position[1], dataUser.position[2], dataUser.yaw, dataUser.pitch, dataUser.maxEnergy)
            .setHeight(dataUser.height)
            .setEyeRatio(dataUser.eyeRatio);

        if (dataUser.radius          !== undefined) {
            user.setRadius(dataUser.radius);
        }
        if (dataUser.gravity         !== undefined) {
            user.setGravity(dataUser.gravity);
        }
        if (dataUser.maxJumpVelocity !== undefined) {
            user.setMaxJumpVelocity(dataUser.maxJumpVelocity);
        }
        if (dataUser.maxSlopeAngle   !== undefined) {
            user.setMaxSlopeAngle(dataUser.maxSlopeAngle);
        }
        if (dataUser.moveSpeed       !== undefined) {
            user.setMoveSpeed(dataUser.moveSpeed);
        }
        if (dataUser.stepHeight      !== undefined) {
            user.setStepHeight(dataUser.stepHeight);
        }
        if (dataUser.voidKillY       !== undefined) {
            user.setVoidKillY(dataUser.voidKillY);
        }
        if (dataUser.fallSafeFactor  !== undefined) {
            user.setFallSafeFactor(dataUser.fallSafeFactor);
        }
        if (dataUser.fallMaxFactor   !== undefined) {
            user.setFallMaxFactor(dataUser.fallMaxFactor);
        }

        return user;
    }

    get() {
        if (this._world === null || !this._loaded) {
            throw new Error('World is not yet loaded');
        }

        return this._world;
    }

    _checkFullyLoaded() {
        if (this._world.isLoaded()) {
            this._loaded = true;
            this._loadedCallback();
        }
    }

    finalizeInit() {
        if (!this._loaded) {
            throw new Error('Factory is not fully loaded');
        }

        if (this._world !== null) {
            this._world.finalizeInit();
        }
    }

}
