class WorldLoader {
    constructor(loadedCallback) {
        this._loadedCallback = loadedCallback;
        this.reset();
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
        this._world = new World(0, url, () => {this._checkFullyLoaded(); });
        this._initialiseEntityFromUrl(this._world);
    }

    _initialiseEntityFromUrl(entity) {
        appBootstrap.fetchJson(entity.getUrl(), data => {

            loader.objects().loadByCode('map', data.map);
            (data.instances || []).forEach(url => loader.instances().load(url));
            (data.interactions || []).forEach(url => loader.interactions().load(url));

            entity._user         = this._initUser(data.user);
            entity._background   = data.background || [0, 0, 0];
            entity._lightAmbient = data.lights.ambient;
            entity._lights       = data.lights.sources.map(s => new Light(s.color, s.range, s.position));
            entity.setLoaded();
        });
    }
    
    _initUser(dataUser) {
        const user = new User(dataUser.position[0], dataUser.position[1], dataUser.position[2], dataUser.yaw, dataUser.pitch, dataUser.maxEnergy)
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
