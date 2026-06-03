class Instance extends AbstractLoadedEntity {
    constructor(id, url, callback) {
        super(id, url, callback);

        this._objectId  = null;
        this._object    = null;
        this._position  = [0, 0, 0];
        this._rotation  = [0, 0, 0];
        this._trigger     = 'none';
        this._loop        = false;
        this._onlyOnce    = false;
        this._done        = false;
        this._collidable  = false;
        this._radius      = null;
        this._keyframes        = [];
        this._maxTime          = 0;
        this._time             = 0;
        this._playing          = false;
        this._worldCenter      = [0, 0, 0];
        this._delta            = { translate: [0, 0, 0], rotate: [0, 0, 0] };
        this._damage           = null;
        this._wasInDamageRange = false;
        this._prevTransform    = null;
    }

    finalizeInit() {
        this._object = loader.objects().get(this._objectId);
        this._computeWorldCenter();
    }

    _computeWorldCenter() {
        const [px, py, pz]    = this._position;
        const [irx, iry, irz] = this._rotation;
        this._delta           = this._interpolate();
        const [dtx, dty, dtz] = this._delta.translate;
        const [drx, dry, drz] = this._delta.rotate;
        const lc              = this._object.getCenter();
        const m = new Matrix();
        m.identity();
        const t = new Matrix(); t.translation(px, py, pz); m.multiply(t);
        if (irx) {
            const r = new Matrix(); r.rotationX(irx * DEG_TO_RAD); m.multiply(r);
        }
        if (irz) {
            const r = new Matrix(); r.rotationZ(irz * DEG_TO_RAD); m.multiply(r);
        }
        if (iry) {
            const r = new Matrix(); r.rotationY(iry * DEG_TO_RAD); m.multiply(r);
        }
        if (dtx || dty || dtz) {
            const t2 = new Matrix(); t2.translation(dtx, dty, dtz); m.multiply(t2);
        }
        if (drx) {
            const r = new Matrix(); r.rotationX(drx * DEG_TO_RAD); m.multiply(r);
        }
        if (drz) {
            const r = new Matrix(); r.rotationZ(drz * DEG_TO_RAD); m.multiply(r);
        }
        if (dry) {
            const r = new Matrix(); r.rotationY(dry * DEG_TO_RAD); m.multiply(r);
        }
        const p = m.multiplyPosition([lc[0], lc[1], lc[2], 1]);
        this._worldCenter = [p[0], p[1], p[2]];
    }

    isCollidable() {
        return this._collidable;
    }

    getDamage() {
        return this._damage;
    }

    getObject() {
        return this._object;
    }

    savePreviousTransform() {
        this._prevTransform = {
            position:       [...this._position],
            rotation:       [...this._rotation],
            deltaTranslate: [...this._delta.translate],
            deltaRotate:    [...this._delta.rotate],
            time:           this._time,
            playing:        this._playing,
            done:           this._done,
        };
    }

    getPreviousTransform() {
        return this._prevTransform;
    }

    rollbackTransform(prev) {
        this._position        = [...prev.position];
        this._rotation        = [...prev.rotation];
        this._delta.translate = [...prev.deltaTranslate];
        this._delta.rotate    = [...prev.deltaRotate];
        this._time    = prev.time;
        this._playing = prev.playing;
        this._done    = prev.done;
        this._computeWorldCenter();
    }

    checkDamage(user, dt) {
        if (!this._damage || user.isDead()) {
            return;
        }
        const dx = user.getCenterX() - this._worldCenter[0];
        const dy = user.getCenterY() - this._worldCenter[1];
        const dz = user.getCenterZ() - this._worldCenter[2];
        const inRange = (Math.sqrt(dx*dx + dy*dy + dz*dz) <= this._damage.radius);
        if (this._damage.type === 'direct') {
            if (inRange && !this._wasInDamageRange) {
                user.takeDamage(this._damage.delta);
            }
            this._wasInDamageRange = inRange;
        } else {
            if (inRange) {
                user.takeDamage(this._damage.delta * dt / 1000);
            }
        }
    }

    // dt in ms, user must expose getCenterX/Y/Z(), action = E key state
    update(dt, user, action) {
        if (this._keyframes.length === 0) {
            return;
        }
        if (this._trigger === 'none') {
            return;
        }
        if (this._done) {
            return;
        }

        const inRange = (
            (this._radius !== null) &&
            (Math.sqrt(
                (user.getCenterX() - this._worldCenter[0]) ** 2 +
                (user.getCenterY() - this._worldCenter[1]) ** 2 +
                (user.getCenterZ() - this._worldCenter[2]) ** 2
            ) <= this._radius)
        );

        const wasPlaying = this._playing;

        switch (this._trigger) {
            case 'always':    this._playing = true;              break;
            case 'proximity': if (inRange) this._playing = true;  break;
            case 'action':    if (inRange && action) this._playing = true; break;
        }

        if (!wasPlaying && this._playing && this._time >= this._maxTime) {
            this._time = this._keyframes[0].t;
        }

        if (!this._playing) {
            return;
        }

        this._time += dt / 1000;
        if (this._time >= this._maxTime) {
            if (this._loop) {
                this._time = this._time % this._maxTime;
            } else {
                this._time    = this._maxTime;
                this._playing = false;
                if (this._onlyOnce) {
                    this._done = true;
                }
            }
        }

        this._computeWorldCenter();
    }

    _interpolate() {
        if (this._keyframes.length === 0) return { translate: [0, 0, 0], rotate: [0, 0, 0] };

        let k0 = this._keyframes[0];
        let k1 = this._keyframes[this._keyframes.length - 1];
        for (let i = 0; i < this._keyframes.length - 1; i++) {
            if (this._time >= this._keyframes[i].t && this._time <= this._keyframes[i + 1].t) {
                k0 = this._keyframes[i];
                k1 = this._keyframes[i + 1];
                break;
            }
        }

        if (k0 === k1 || k1.t === k0.t) return { translate: [...k0.translate], rotate: [...k0.rotate] };

        const f = (this._time - k0.t) / (k1.t - k0.t);
        return {
            translate: k0.translate.map((v, i) => v + f * (k1.translate[i] - v)),
            rotate:    k0.rotate.map((v, i)    => v + f * (k1.rotate[i]    - v)),
        };
    }

    getTransform() {
        return {
            position:       this._position,
            rotation:       this._rotation,
            deltaTranslate: this._delta.translate,
            deltaRotate:    this._delta.rotate,
        };
    }
}
