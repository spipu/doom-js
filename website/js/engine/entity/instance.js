class Instance extends AbstractLoadedEntity {
    constructor(id, url, callback) {
        super(id, url, callback);

        // 3D object reference
        this._objectId          = null;
        this._object            = null;

        // World transform (+ derived centre, frame delta, rollback snapshot)
        this._position          = [0, 0, 0];
        this._rotation          = [0, 0, 0];
        this._worldCenter       = [0, 0, 0];
        this._delta             = { translate: [0, 0, 0], rotate: [0, 0, 0] };
        this._prevTransform     = null;

        // Animation playback (keyframes-driven)
        this._animKeyframes     = [];
        this._animTime          = 0;
        this._animMaxTime       = 0;
        this._animPlaying       = false;
        this._animLoop          = false;
        this._animOnlyOnce      = false;
        this._animDone          = false;

        // Trigger / interaction (how the animation is activated)
        this._trigger           = 'none';
        this._interactionRadius = null;
        this._interaction       = null;

        // Collision (none | faces | box)
        this._collisionShape    = 'none';
        this._collisionRadius   = null;

        // Damage dealt to the player on contact
        this._damage            = null;
        this._wasInDamageRange  = false;
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
        const t = new Matrix();
        t.translation(px, py, pz);
        m.multiply(t);
        if (irx) {
            const r = new Matrix();
            r.rotationX(irx * DEG_TO_RAD);
            m.multiply(r);
        }
        if (irz) {
            const r = new Matrix();
            r.rotationZ(irz * DEG_TO_RAD);
            m.multiply(r);
        }
        if (iry) {
            const r = new Matrix();
            r.rotationY(iry * DEG_TO_RAD);
            m.multiply(r);
        }
        if (dtx || dty || dtz) {
            const t2 = new Matrix();
            t2.translation(dtx, dty, dtz);
            m.multiply(t2);
        }
        if (drx) {
            const r = new Matrix();
            r.rotationX(drx * DEG_TO_RAD);
            m.multiply(r);
        }
        if (drz) {
            const r = new Matrix();
            r.rotationZ(drz * DEG_TO_RAD);
            m.multiply(r);
        }
        if (dry) {
            const r = new Matrix();
            r.rotationY(dry * DEG_TO_RAD);
            m.multiply(r);
        }
        const p = m.multiplyPosition([lc[0], lc[1], lc[2], 1]);
        this._worldCenter = [p[0], p[1], p[2]];
    }

    isCollidable() {
        return (this._collisionShape !== 'none');
    }

    getCollisionShape() {
        return this._collisionShape;
    }

    getCollisionRadius() {
        return this._collisionRadius;
    }

    getDamage() {
        return this._damage;
    }

    getObject() {
        return this._object;
    }

    getPosition() {
        return this._position;
    }

    getWorldCenter() {
        return this._worldCenter;
    }

    savePreviousTransform() {
        this._prevTransform = {
            position:       [...this._position],
            rotation:       [...this._rotation],
            deltaTranslate: [...this._delta.translate],
            deltaRotate:    [...this._delta.rotate],
            time:           this._animTime,
            playing:        this._animPlaying,
            done:           this._animDone,
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
        this._animTime    = prev.time;
        this._animPlaying = prev.playing;
        this._animDone    = prev.done;
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
        if (this._animKeyframes.length === 0 && this._interaction === null) {
            return;
        }
        if (this._animDone) {
            return;
        }

        if (this._checkTrigger(user, action)) {
            return;
        }

        if (!this._animPlaying) {
            return;
        }

        this._animTime += dt / 1000;
        if (this._animTime >= this._animMaxTime) {
            if (this._animLoop) {
                this._animTime = this._animTime % this._animMaxTime;
            } else {
                this.stop();
            }
        }

        this._computeWorldCenter();
    }

    _checkTrigger(user, action) {
        if (this._trigger === 'none' || this._animPlaying) {
            return false;
        }

        const inRange = (
            (this._interactionRadius !== null) &&
            (Math.sqrt(
                (user.getCenterX() - this._worldCenter[0]) ** 2 +
                (user.getCenterY() - this._worldCenter[1]) ** 2 +
                (user.getCenterZ() - this._worldCenter[2]) ** 2
            ) <= this._interactionRadius)
        );

        const wasPlaying = this._animPlaying;

        switch (this._trigger) {
            case 'always':
                this.start();
                break;
            case 'proximity':
                if (inRange) {
                    this.start();
                }
                break;
            case 'action':
                if (inRange && action) {
                    this.start();
                }
                break;
        }

        if (!wasPlaying && this._animPlaying) {
            if (this._interaction !== null) {
                loader.interactions().getByCode(this._interaction).triggered(this);

                if (this._animKeyframes.length === 0) {
                    this.stop();
                    return true;
                }
            }
        }

        return false;
    }

    start() {
        if (this._animPlaying) {
            return;
        }
        this._animPlaying = true;
        if (this._animKeyframes.length > 0 && this._animTime >= this._animMaxTime) {
            this._animTime = this._animKeyframes[0].t;
        }
    }

    stop() {
        this._animTime    = this._animMaxTime;
        this._animPlaying = false;
        if (this._animOnlyOnce) {
            this._animDone = true;
        }
    }

    _interpolate() {
        if (this._animKeyframes.length === 0) return { translate: [0, 0, 0], rotate: [0, 0, 0] };

        let k0 = this._animKeyframes[0];
        let k1 = this._animKeyframes[this._animKeyframes.length - 1];
        for (let i = 0; i < this._animKeyframes.length - 1; i++) {
            if (this._animTime >= this._animKeyframes[i].t && this._animTime <= this._animKeyframes[i + 1].t) {
                k0 = this._animKeyframes[i];
                k1 = this._animKeyframes[i + 1];
                break;
            }
        }

        if (k0 === k1 || k1.t === k0.t) return { translate: [...k0.translate], rotate: [...k0.rotate] };

        const f = (this._animTime - k0.t) / (k1.t - k0.t);
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
