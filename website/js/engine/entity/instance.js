class Instance extends AbstractLoadedEntity {
    constructor(id, url, callback) {
        super(id, url, callback);

        this._objectId          = null;
        this._object            = null;

        // World transform (+ derived centre, frame delta, rollback snapshot)
        this._position          = [0, 0, 0];
        this._rotation          = [0, 0, 0];
        this._worldCenter       = [0, 0, 0];
        this._delta             = { translate: [0, 0, 0], rotate: [0, 0, 0] };
        this._prevTransform     = null;

        // Animation playback (keyframes-driven)
        this._animKeyframes      = [];
        // name → {keyframes, onlyOnce, loop?, blockedBehavior?,
        // blockedSlowFactor?, crushDamage?, nextDefaultVariant?}: per-trigger
        // cycles (see start); nextDefaultVariant hands the default over on
        // completion, so later null-variant triggers run the follow-up cycle.
        this._animVariants       = null;
        this._animActiveVariant  = null;
        this._animDefaultVariant = null;
        this._baseCycle          = null;
        this._animTime           = 0;
        this._animMaxTime        = 0;
        this._animPlaying        = false;
        this._animReverse        = false;   // true = keyframes played backward (time decreasing)
        this._animReverseScale   = 1;       // reverse playback speed factor (see startReverse)
        this._animLoop           = false;
        this._animOnlyOnce       = false;
        this._animDone           = false;

        // Trigger / interaction (how the animation is activated)
        this._trigger                = 'none';
        this._interactionRadius      = null;
        // Shape of the proximity test around the radius: 'sphere' measures in
        // 3D, 'planar' on XZ only (walk-over lines fire at any height), and
        // 'cylinder' pairs the XZ circle with a vertical reach window.
        this._interactionShape       = 'sphere';
        this._interactionReachBelow  = 0;
        this._interactionReachAbove  = 0;
        this._autoStart              = false;   // true = start() once at load (timer-armed elements)
        this._interaction            = null;
        this._triggerConditions      = [];
        this._renderOffset           = null;
        this._renderLight            = 1;

        // Collision (none | faces | box)
        this._collisionShape    = 'none';
        this._collisionRadius   = null;

        // Damage dealt to the player on contact
        this._damage            = null;
        this._wasInDamageRange  = false;

        // Pressure on the player (state driven by the Collision pressure passes)
        this._blockedBehavior   = 'stall';   // 'stall' | 'reverse' | 'crush'
        this._blockedSlowFactor = 1;         // animation speed factor while pressing
        this._blockedPressing   = false;     // pressing the player (lasts while the overlap does)
        this._crushDamage       = null;      // {delta, windowS} | null
        this._crushActive       = false;     // pressing AND moving this frame (arms the damage tick)
        this._crushClockS       = 0;

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
        // Captured so a variant only has to state its divergences.
        this._baseCycle = {
            keyframes:         this._animKeyframes,
            onlyOnce:          this._animOnlyOnce,
            loop:              this._animLoop,
            blockedBehavior:   this._blockedBehavior,
            blockedSlowFactor: this._blockedSlowFactor,
            crushDamage:       this._crushDamage,
        };
        this._applyCycle(null);
        this._computeWorldCenter();
        // Timer-armed elements (e.g. Doom sector-special doors) play their
        // cycle from level load, independently of the trigger.
        if (this._autoStart) {
            this.start();
        }
    }

    // Re-point the instance at another already-loaded object (e.g. an animated
    // effect stepping through its frame billboards). Re-resolves the center.
    setObject(objectId) {
        this._objectId = objectId;
        this._object   = loader.objects().get(objectId);
        this._computeWorldCenter();
        return this;
    }

    // The moving floor this instance rides (null when grounded on static
    // floor) — lets a spawned child inherit its parent's ride.
    getRideOn() {
        return this._rideOn;
    }

    // Move the instance keeping its cached world centre in sync (the pattern
    // of _syncRide, exposed for game-driven bodies: knockback, falls).
    translate(dx, dy, dz) {
        this._position[0]    += dx;
        this._position[1]    += dy;
        this._position[2]    += dz;
        this._worldCenter[0] += dx;
        this._worldCenter[1] += dy;
        this._worldCenter[2] += dz;
        // A ridden instance re-expresses its base at the new Y (the setRideOn
        // mid-travel invariant), so the next ride sync moves it by the floor's
        // FUTURE delta only instead of snapping it back to the old altitude.
        if (this.getRideOn() !== null) {
            this.setRideOn(this._rideOn);
        }
        return this;
    }

    _computeWorldCenter() {
        this._delta = this._interpolate();
        const lc = this._object.getCenter();
        const m  = Matrix.composeInstanceTransform(this.getTransform());
        const p  = m.multiplyPosition([lc[0], lc[1], lc[2], 1]);
        this._worldCenter = [p[0], p[1], p[2]];
    }

    // Opaque gates evaluated before a proximity/action trigger may fire (e.g. a
    // locked door checking the player holds the key). The predicates are
    // supplied by the game layer; the engine stays generic and ANDs them —
    // several rules may guard one instance (key + crossing + side).
    addTriggerCondition(fn) {
        this._triggerConditions.push(fn);
        return this;
    }

    // Every predicate runs, whatever the ones before answered: a STATEFUL gate
    // (a line-crossing sampler) must keep sampling even while another one
    // refuses, or it reads a stale position the frame the refusal lifts.
    _conditionMet(user) {
        let met = true;
        for (const fn of this._triggerConditions) {
            const ok = (fn(user) === true);
            met = (met && ok);
        }
        return met;
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
        this._animTime        = prev.time;
        this._animPlaying     = prev.playing;
        this._animReverse     = prev.reverse;
        this._animDone        = prev.done;
        this._computeWorldCenter();
    }

    /**
     * Plain-data snapshot of the mutable animation/transform state, restorable
     * by importAnimState after a deterministic rebuild of the same scene. The
     * ridden floor is referenced by its code (a reference would not survive
     * serialization); the interpolation delta is derived, so it is not exported.
     */
    exportAnimState() {
        return {
            position:       [...this._position],
            rotation:       [...this._rotation],
            time:           this._animTime,
            playing:        this._animPlaying,
            reverse:        this._animReverse,
            reverseScale:   this._animReverseScale,
            done:           this._animDone,
            variant:        this._animActiveVariant,
            defaultVariant: this._animDefaultVariant,
            rideOnCode:     ((this._rideOn !== null) ? this._rideOn.getCode() : null),
            rideBaseY:      this._rideBaseY,
            rideLastDy:     this._rideLastDy,
        };
    }

    /**
     * Counterpart of exportAnimState. The saved cycle is re-applied first (it
     * swaps the timeline and its playback rules), then the raw fields overwrite
     * it. The ride is restored directly — setRideOn() would recompute the base
     * against the mover's CURRENT delta, while the saved base already matches
     * the restored mover pose. The lifecycle hooks are replayed when the
     * restored state says they already fired: their effects (e.g. a floor
     * texture change) belong to the animation's progress, not to the freshly
     * rebuilt scene.
     *
     * @param {object} data
     * @param {Instance|null} rideOnInstance resolved from data.rideOnCode by the caller
     */
    importAnimState(data, rideOnInstance = null) {
        if (this._cycleOf(data.variant) !== null) {
            this._applyCycle(data.variant);
        }
        // A default handed over by a completed cycle (nextDefaultVariant) is
        // state, not derived — older saves without the field keep the loaded one.
        this._animDefaultVariant = (data.defaultVariant ?? this._animDefaultVariant);
        this._position         = [...data.position];
        this._rotation         = [...data.rotation];
        this._animTime         = data.time;
        this._animPlaying      = data.playing;
        this._animReverse      = data.reverse;
        this._animReverseScale = data.reverseScale;
        this._animDone         = data.done;
        this._rideOn           = rideOnInstance;
        this._rideBaseY        = data.rideBaseY;
        this._rideLastDy       = data.rideLastDy;
        this._computeWorldCenter();

        const firstT  = ((this._animKeyframes.length > 0) ? this._animKeyframes[0].t : 0);
        const started = (this._animPlaying || this._animDone || (this._animTime > firstT));
        if (started && (this._onStart !== null)) {
            this._onStart();
        }
        if (this._animDone && (this._onComplete !== null)) {
            this._onComplete();
        }
    }

    checkDamage(user, dt) {
        this._crushDamageTick(user, dt);
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

    // Crush damage: dealt in windows of windowS seconds while the mover both
    // presses the player AND moves (PIT_ChangeSector: 10 hp every 4 tics).
    // The clock is primed to windowS on the pressing rising edge, so the
    // first hit lands immediately.
    _crushDamageTick(user, dt) {
        if ((this._crushDamage === null) || (this._crushActive !== true) || user.isDead()) {
            return;
        }
        this._crushClockS += dt / 1000;
        if (this._crushClockS >= this._crushDamage.windowS) {
            this._crushClockS %= this._crushDamage.windowS;
            user.takeDamage(this._crushDamage.delta);
        }
    }

    getBlockedBehavior() {
        return this._blockedBehavior;
    }

    isBlockedPressing() {
        return this._blockedPressing;
    }

    // A crush mover currently pressing the player is passable for him (the
    // vanilla lateral escape): its walls/ceilings leave the player queries.
    isCrushPassable() {
        return ((this._blockedBehavior === 'crush') && (this._blockedPressing === true));
    }

    setBlockedPressing(pressing) {
        if ((pressing === true) && (this._blockedPressing === false)) {
            this._crushClockS = ((this._crushDamage !== null) ? this._crushDamage.windowS : 0);
        }
        if (pressing === false) {
            this._crushClockS = 0;
            this._crushActive = false;
        }
        this._blockedPressing = pressing;
    }

    setCrushActive(active) {
        this._crushActive = active;
    }

    /**
     * Stand this instance on a moving floor instance: its Y (and derived world
     * centre) follows the floor's animation delta each frame — a pickup on a
     * lowering pillar rides down with it. The base is expressed at the
     * floor's rest pose: an instance attached MID-TRAVEL (a decal shot on a
     * moving platform) already contains the current delta in its position,
     * and must not be shifted by it a second time on the next sync.
     */
    setRideOn(floorInstance) {
        const dy = floorInstance.getTransform().deltaTranslate[1];

        this._rideOn     = floorInstance;
        this._rideBaseY  = this._position[1] - dy;
        this._rideLastDy = dy;
    }

    clearRide() {
        this._rideOn = null;
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

    // dt in ms, user must expose getCenterX/Y/Z() and getFeetY(), action = E key state
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
            this._animTime += (dt / 1000) * ((this._blockedPressing) ? this._blockedSlowFactor : 1);
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

    // A once-only trigger that already fired (or was force-stopped) is spent
    // for every actor — game code syncing its own crossing bookkeeping.
    isTriggerSpent() {
        return this._animDone;
    }

    /**
     * Purely visual position offset consumed at DRAW time only (the physics
     * body never moves): game code smoothing stepped logical motion — actors
     * advancing by teleport-steps at a fixed tick rate — hands the shrinking
     * gap to the renderer here. Null when unused (zero cost).
     */
    setRenderOffset(dx, dy, dz) {
        this._renderOffset = [dx, dy, dz];
    }

    clearRenderOffset() {
        this._renderOffset = null;
    }

    // Upper bound of how far the render offset can push the drawn body away
    // from its world centre — the frustum test widens its sphere by it instead
    // of trying to place the offset centre exactly.
    getRenderOffsetBound() {
        if (this._renderOffset === null) {
            return 0;
        }
        const o = this._renderOffset;
        return Math.sqrt(o[0]*o[0] + o[1]*o[1] + o[2]*o[2]);
    }

    /**
     * Light multiplier consumed at DRAW time only (1 = baked colours
     * untouched): two instances sharing one object may be lit differently, so
     * a moving body can follow the lighting of the area it crosses.
     */
    setRenderLight(factor) {
        this._renderLight = factor;
    }

    getRenderLight() {
        return this._renderLight;
    }

    getRenderTransform() {
        const t = this.getTransform();
        if (this._renderOffset === null) {
            return t;
        }
        return {
            position: [
                t.position[0] + this._renderOffset[0],
                t.position[1] + this._renderOffset[1],
                t.position[2] + this._renderOffset[2]
            ],
            rotation:       t.rotation,
            deltaTranslate: t.deltaTranslate,
            deltaRotate:    t.deltaRotate
        };
    }

    /**
     * Fire this trigger zone programmatically for a non-player actor (game
     * code detecting its own crossings): same consumption path as the player
     * proximity check — start(), notify the interaction, and a zero-keyframe
     * zone stops immediately, so a once-only line is consumed for everyone.
     * No-op on a spent or busy zone. Returns true when it fired.
     */
    fireZoneTrigger() {
        if (this._trigger === 'none' || this._animDone || this._animPlaying) {
            return false;
        }
        this.start();
        if (!this._animPlaying) {
            return false;
        }
        this._notifyTriggered();
        return true;
    }

    // Interaction hand-off of a trigger that just started: a zone with no
    // keyframes stops right away (its once-only flag consumes it). Shared by
    // the player proximity path and fireZoneTrigger.
    _notifyTriggered() {
        if (this._interaction === null) {
            return false;
        }
        loader.interactions().getByCode(this._interaction).triggered(this);
        if (this._animKeyframes.length === 0) {
            this.stop();
            return true;
        }
        return false;
    }

    /**
     * Reach of a proximity/action trigger, per interaction shape. A cylinder
     * keeps the two axes apart: the vertical window is measured from this
     * instance's live base (so a body riding a lift follows it) to the user's
     * feet, and the radius stays a plain ground footprint — where a sphere lets
     * a tall target eat into the horizontal reach.
     */
    _inInteractionRange(user) {
        const dx    = user.getCenterX() - this._worldCenter[0];
        const dz    = user.getCenterZ() - this._worldCenter[2];
        const radSq = (this._interactionRadius * this._interactionRadius);
        if (this._interactionShape === 'cylinder') {
            if (((dx * dx) + (dz * dz)) > radSq) {
                return false;
            }
            const delta = (this._position[1] + this._delta.translate[1]) - user.getFeetY();

            return ((delta <= this._interactionReachAbove) && (delta >= -this._interactionReachBelow));
        }
        const dy = ((this._interactionShape === 'planar') ? 0 : (user.getCenterY() - this._worldCenter[1]));

        return (((dx * dx) + (dy * dy) + (dz * dz)) <= radSq);
    }

    _checkTrigger(user, action) {
        if (this._trigger === 'none' || this._animPlaying) {
            return false;
        }

        const inRange = ((this._interactionRadius !== null) && this._inInteractionRange(user));

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

        if (this._animPlaying && this._notifyTriggered()) {
            return true;
        }

        return false;
    }

    /**
     * variant: name of the cycle to play (keyframeVariants of the loaded
     * data), null = the default one — the crossed line's special picks it
     * (a door tag mixing open-stay and close-wait-open lines).
     */
    start(variant = null) {
        if (this._animPlaying) {
            return;
        }
        // A cycle paused mid-travel (stop line, vanilla stasis) resumes as-is
        // whatever the trigger asks for: P_ActivateInStasis re-awakens the
        // parked thinker, it never re-reads the activating line's action.
        if (this._isPausedMidCycle()) {
            this._animPlaying = true;
            if (this._onStart !== null) {
                this._onStart();
            }
            return;
        }
        // Another cycle is a NEW cycle, not the re-trigger of a spent one
        // (vanilla spawns a fresh thinker), so a done animation accepts it.
        // One trigger key is broadcast to every tagged target whatever its
        // family: a key this instance does not declare falls back to its
        // default cycle, exactly like a null-variant trigger.
        let wanted = (variant ?? this._animDefaultVariant);
        let cycle  = this._cycleOf(wanted);
        if ((wanted !== null) && (cycle === null)) {
            wanted = this._animDefaultVariant;
            cycle  = this._cycleOf(wanted);
        }
        const switching = ((wanted !== this._animActiveVariant) && (cycle !== null));
        // Re-triggering a done one-way is a vanilla no-op, and it would reset
        // the time while _animDone still blocks update() — a zombie state that
        // also locks out startReverse().
        if (this._animDone && !switching) {
            return;
        }
        if (switching) {
            // A cycle plays from its first keyframe, so the body must already
            // sit there: a closing cycle rests OPEN, an opening one CLOSED, and
            // applying either from the wrong pose teleports the panel.
            if (!this._poseIsCycleStart(wanted)) {
                return;
            }
            this._applyCycle(wanted);
        }
        this._animPlaying = true;
        if (this._animKeyframes.length > 0 && this._animTime >= this._animMaxTime) {
            this._animTime = this._animKeyframes[0].t;
        }
        if (this._onStart !== null) {
            this._onStart();
        }
    }

    _isPausedMidCycle() {
        return ((this._animKeyframes.length > 0)
            && !this._animDone
            && (this._animTime > this._animKeyframes[0].t)
            && (this._animTime < this._animMaxTime));
    }

    _cycleOf(name) {
        if (name === null) {
            return this._baseCycle;
        }
        return ((this._animVariants !== null) ? (this._animVariants[name] ?? null) : null);
    }

    _applyCycle(name) {
        const cycle  = this._cycleOf(name);
        const frames = cycle.keyframes;
        this._animKeyframes      = frames;
        this._animMaxTime        = ((frames.length > 0) ? frames[frames.length - 1].t : 0);
        this._animTime           = ((frames.length > 0) ? frames[0].t : 0);
        this._animOnlyOnce       = (cycle.onlyOnce === true);
        this._animLoop           = (cycle.loop === true);
        this._animDone           = false;
        this._blockedBehavior    = (cycle.blockedBehavior ?? this._baseCycle.blockedBehavior);
        this._blockedSlowFactor  = (cycle.blockedSlowFactor ?? this._baseCycle.blockedSlowFactor);
        this._crushDamage        = (cycle.crushDamage ?? this._baseCycle.crushDamage);
        this._animActiveVariant  = name;
    }

    _poseIsCycleStart(name) {
        const first = this._cycleOf(name).keyframes[0];
        if (first === undefined) {
            return true;
        }
        for (let axis = 0; axis < 3; axis++) {
            if (Math.abs(this._delta.translate[axis] - first.translate[axis]) > Instance.POSE_EPSILON) {
                return false;
            }
            if (Math.abs(this._delta.rotate[axis] - first.rotate[axis]) > Instance.POSE_EPSILON) {
                return false;
            }
        }
        return true;
    }

    // Freezes the animation in place (Doom EV_StopPlat stasis): keeps the
    // current time and direction so a later start() resumes exactly where it
    // stopped. Harmless on an instance that is not playing.
    pause() {
        this._animPlaying = false;
    }

    /**
     * Replay the keyframes backward from the current position. No-op while
     * playing or when already back at the first keyframe. Clears _animDone so
     * a finished one-way animation can be walked back; reaching the origin
     * re-arms start() (the element is genuinely at rest again). timeScale
     * slows (< 1) or speeds up the reverse playback relative to the forward
     * timeline — a floor lowered at turbo speed may legally rise back at the
     * (slower) speed of the raise special that reverses it.
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

    // Mover pressing the player with blockedBehavior 'reverse': head back the
    // other way (vanilla T_VerticalDoor going back up, T_PlatRaise going back
    // down). Already reversing (the re-close is the opening segment replayed
    // backward): flip forward again — full reopening then the normal cycle.
    // Otherwise the pause()+startReverse() pattern lifts the playing guard.
    reverseBlocked() {
        if (!this._animPlaying) {
            return;
        }
        if (this._animReverse) {
            this._animReverse = false;
            return;
        }
        if ((this._animKeyframes.length === 0) || (this._animTime <= this._animKeyframes[0].t)) {
            return;
        }
        this._animPlaying = false;
        this.startReverse();
    }

    stop() {
        this._animTime    = this._animMaxTime;
        this._animPlaying = false;
        if (this._animOnlyOnce) {
            this._animDone = true;
        }
        const cycle = this._cycleOf(this._animActiveVariant);
        if ((cycle !== null) && ((cycle.nextDefaultVariant ?? null) !== null)) {
            this._animDefaultVariant = cycle.nextDefaultVariant;
        }
        if (this._onComplete !== null) {
            this._onComplete();
        }
    }

    _interpolate() {
        if (this._animKeyframes.length === 0) {
            return {translate: [0, 0, 0], rotate: [0, 0, 0]};
        }

        let k0 = this._animKeyframes[0];
        let k1 = this._animKeyframes[this._animKeyframes.length - 1];
        for (let i = 0; i < this._animKeyframes.length - 1; i++) {
            if (this._animTime >= this._animKeyframes[i].t && this._animTime <= this._animKeyframes[i + 1].t) {
                k0 = this._animKeyframes[i];
                k1 = this._animKeyframes[i + 1];
                break;
            }
        }

        if (k0 === k1 || k1.t === k0.t) {
            return {translate: [...k0.translate], rotate: [...k0.rotate]};
        }

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

// Pose tolerance of _poseIsCycleStart (world units / degrees)
Instance.POSE_EPSILON = 1e-3;
