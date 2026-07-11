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
        this._animVariants      = null;   // name → {keyframes, onlyOnce}: per-trigger cycles (see start)
        this._animTime          = 0;
        this._animMaxTime       = 0;
        this._animPlaying       = false;
        this._animReverse       = false;   // true = keyframes played backward (time decreasing)
        this._animReverseScale  = 1;       // reverse playback speed factor (see startReverse)
        this._animLoop          = false;
        this._animOnlyOnce      = false;
        this._animDone          = false;

        // Trigger / interaction (how the animation is activated)
        this._trigger           = 'none';
        this._interactionRadius = null;
        this._triggerPlanar     = false;   // true = proximity tested on XZ only (walk-over lines)
        this._autoStart         = false;   // true = start() once at load (timer-armed elements)
        this._interaction       = null;
        this._triggerCondition  = null;

        // Collision (none | faces | box)
        this._collisionShape    = 'none';
        this._collisionRadius   = null;

        // Damage dealt to the player on contact
        this._damage            = null;
        this._wasInDamageRange  = false;

        // Moving floor this instance stands on (its Y follows that floor)
        this._rideOn            = null;
        this._rideBaseY         = 0;
        this._rideLastDy        = 0;

        // Lifecycle hooks: fired when the animation actually starts / reaches
        // its final keyframe (game-layer effects like floor texture changes)
        this._onStart           = null;
        this._onComplete        = null;
    }

    setOnStart(fn) {
        this._onStart = fn;
    }

    setOnComplete(fn) {
        this._onComplete = fn;
    }

    finalizeInit() {
        this._object = loader.objects().get(this._objectId);
        this._computeWorldCenter();
        // Timer-armed elements (e.g. Doom sector-special doors) play their
        // cycle from level load, independently of the trigger.
        if (this._autoStart) {
            this.start();
        }
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

    // Opaque gate evaluated before a proximity/action trigger may fire (e.g. a
    // locked door checking the player holds the key). The predicate is supplied
    // by the game layer; the engine stays generic and only calls it.
    setTriggerCondition(fn) {
        this._triggerCondition = fn;
        return this;
    }

    _conditionMet(user) {
        return ((this._triggerCondition === null) || (this._triggerCondition(user) === true));
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
            reverse:        this._animReverse,
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
        this._animReverse = prev.reverse;
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

    /**
     * Stand this instance on a moving floor instance: its Y (and derived world
     * centre) follows the floor's animation delta each frame — a pickup on a
     * lowering pillar rides down with it. Base Y = the position at call time.
     */
    setRideOn(floorInstance) {
        this._rideOn     = floorInstance;
        this._rideBaseY  = this._position[1];
        this._rideLastDy = 0;
    }

    _syncRide() {
        if (this._rideOn === null) {
            return;
        }
        const dy = this._rideOn.getTransform().deltaTranslate[1];
        if (dy !== this._rideLastDy) {
            this._rideLastDy  = dy;
            this._position[1] = this._rideBaseY + dy;
            this._computeWorldCenter();
        }
    }

    // dt in ms, user must expose getCenterX/Y/Z(), action = E key state
    update(dt, user, action) {
        this._syncRide();
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

        if (this._animReverse) {
            this._animTime -= (dt / 1000) * this._animReverseScale;
            if (this._animTime <= this._animKeyframes[0].t) {
                this._animTime    = this._animKeyframes[0].t;
                this._animPlaying = false;
                this._animReverse = false;
                this._animDone    = false;
            }
        } else {
            this._animTime += dt / 1000;
            if (this._animTime >= this._animMaxTime) {
                if (this._animLoop) {
                    this._animTime = this._animTime % this._animMaxTime;
                } else {
                    this.stop();
                }
            }
        }

        this._computeWorldCenter();
    }

    _checkTrigger(user, action) {
        if (this._trigger === 'none' || this._animPlaying) {
            return false;
        }

        // Planar triggers (walk-over lines) ignore Y: crossing the line fires it
        // regardless of the player's height — they may stand on a raised lift or
        // down in the pit. Other triggers (switches, doors) keep the 3D sphere.
        const dx = user.getCenterX() - this._worldCenter[0];
        const dy = (this._triggerPlanar ? 0 : (user.getCenterY() - this._worldCenter[1]));
        const dz = user.getCenterZ() - this._worldCenter[2];
        const inRange = (
            (this._interactionRadius !== null) &&
            (Math.sqrt(dx * dx + dy * dy + dz * dz) <= this._interactionRadius)
        );

        const wasPlaying = this._animPlaying;

        switch (this._trigger) {
            case 'always':
                this.start();
                break;
            case 'proximity':
                if (inRange && this._conditionMet(user)) {
                    this.start();
                }
                break;
            case 'action':
                if (inRange && action && this._conditionMet(user)) {
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

    /**
     * variant: optional name of a keyframe variant (setKeyframeVariants) to
     * play — per-trigger cycles (a Doom door tag mixing open-wait-close and
     * open-stay lines: the crossed line's special decides the cycle). Only
     * applied at rest: a playing or finished instance ignores the call, so
     * the variant switch can never teleport a moving panel.
     */
    start(variant = null) {
        // A finished onlyOnce animation stays finished (re-triggering a done
        // one-way is a vanilla no-op) — without this, a repeatable trigger
        // re-firing start() would reset the time while _animDone still blocks
        // update(), freezing the instance in a zombie state that also locks
        // out startReverse() (its playing guard). startReverse() clears
        // _animDone, re-arming start().
        if (this._animPlaying || this._animDone) {
            return;
        }
        if (variant !== null && this._animVariants !== null && this._animVariants[variant] !== undefined) {
            const v = this._animVariants[variant];
            this._animKeyframes = v.keyframes;
            this._animMaxTime   = v.keyframes[v.keyframes.length - 1].t;
            this._animOnlyOnce  = (v.onlyOnce === true);
            this._animTime      = v.keyframes[0].t;
        }
        this._animPlaying = true;
        if (this._animKeyframes.length > 0 && this._animTime >= this._animMaxTime) {
            this._animTime = this._animKeyframes[0].t;
        }
        if (this._onStart !== null) {
            this._onStart();
        }
    }

    setKeyframeVariants(variants) {
        this._animVariants = variants;
    }

    // Freezes the animation in place (Doom EV_StopPlat stasis): keeps the
    // current time and direction so a later start() resumes exactly where it
    // stopped. Harmless on an instance that is not playing.
    pause() {
        this._animPlaying = false;
    }

    // Plays the keyframes backward from the current position (same speeds).
    // No-op while playing or when already back at the first keyframe. Clears
    // _animDone so a finished one-way animation can be walked back; reaching
    // the origin re-arms start() (the element is genuinely at rest again).
    /**
     * Replay the keyframes backward from the current position. timeScale slows
     * (< 1) or speeds up the reverse playback relative to the forward timeline —
     * a floor lowered at turbo speed may legally rise back at the (slower)
     * speed of the raise special that reverses it.
     */
    startReverse(timeScale = 1) {
        if (this._animPlaying || this._animKeyframes.length === 0) {
            return;
        }
        if (this._animTime <= this._animKeyframes[0].t) {
            return;
        }
        this._animReverse      = true;
        this._animReverseScale = timeScale;
        this._animDone         = false;
        this._animPlaying      = true;
    }

    stop() {
        this._animTime    = this._animMaxTime;
        this._animPlaying = false;
        if (this._animOnlyOnce) {
            this._animDone = true;
        }
        if (this._onComplete !== null) {
            this._onComplete();
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
