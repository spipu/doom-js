class WorldLoader {
    constructor(loadedCallback) {
        this._loadedCallback = loadedCallback;
        this._userClass      = User;
        this.reset();
    }

    // A game may supply its own User subclass
    setUserClass(userClass) {
        this._userClass = userClass;
        return this;
    }

    reset() {
        this._loaded  = true;
        this._world   = null;
        this._userDef = null;
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

    // The map, instances and interactions must already be in their loaders
    loadFromData(data) {
        if (this._world !== null) {
            throw new Error('World is already loaded');
        }

        this._loaded = false;
        this._world = new World(0, null, () => this._checkFullyLoaded());

        this._populateWorld(this._world, data);
    }

    _populateWorld(world, data) {
        this._userDef = data.user;
        world
            .setUser(this._createUser(data.user))
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

    /**
     * Another body built from the loaded world's user definition, for the
     * caller to add to the world.
     *
     * @param {number[]} position - [x, y, z]
     * @param {number}   yaw      - degrees
     * @returns {User}
     */
    createUser(position, yaw) {
        if (this._userDef === null) {
            throw new Error('World is not yet loaded');
        }

        return this._createUser({...this._userDef, position: position, yaw: yaw});
    }

    _createUser(userDef) {
        const UserClass = this._userClass;
        const user = new UserClass(userDef.position[0], userDef.position[1], userDef.position[2], userDef.yaw, userDef.pitch, userDef.maxEnergy)
            .setHeight(userDef.height)
            .setEyeRatio(userDef.eyeRatio);

        if (userDef.radius          !== undefined) {
            user.setRadius(userDef.radius);
        }
        if (userDef.gravity         !== undefined) {
            user.setGravity(userDef.gravity);
        }
        if (userDef.maxJumpVelocity !== undefined) {
            user.setMaxJumpVelocity(userDef.maxJumpVelocity);
        }
        if (userDef.maxSlopeAngle   !== undefined) {
            user.setMaxSlopeAngle(userDef.maxSlopeAngle);
        }
        if (userDef.moveSpeed       !== undefined) {
            user.setMoveSpeed(userDef.moveSpeed);
        }
        if (userDef.stepHeight      !== undefined) {
            user.setStepHeight(userDef.stepHeight);
        }
        if (userDef.voidKillY       !== undefined) {
            user.setVoidKillY(userDef.voidKillY);
        }
        if (userDef.fallSafeFactor  !== undefined) {
            user.setFallSafeFactor(userDef.fallSafeFactor);
        }
        if (userDef.fallMaxFactor   !== undefined) {
            user.setFallMaxFactor(userDef.fallMaxFactor);
        }

        return user;
    }

    get() {
        if ((this._world === null) || !this._loaded) {
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
