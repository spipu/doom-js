class Instance extends AbstractLoadedEntity {
    constructor(id, url, callback) {
        super(id, url, callback);

        this._objectId          = null;
        this._object            = null;

        // World transform (+ derived centre, frame delta, rollback snapshot)
        this._position          = [0, 0, 0];
        this._restY             = 0;
        this._rotation          = [0, 0, 0];
        this._worldCenter       = [0, 0, 0];
        this._delta             = { translate: [0, 0, 0], rotate: [0, 0, 0] };
        this._prevTransform     = null;

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
        // Forward playback pauses at this time (startUntilVerticalDelta): a
        // mover driven part-way, whose next trigger picks a new target.
        this._animStopTime       = null;
        // Parked mid-travel by pause() (vanilla stasis): the next start()
        // resumes the run as it was, instead of beginning a new one.
        this._animPaused         = false;

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
        this._removalScheduled       = false;   // true = leaving the world at the end of the turn
        this._renderOffset           = null;
        this._renderLight            = 1;
        this._renderRoll             = 0;

        // Collision (none | faces | box)
        this._collisionShape    = 'none';
        this._collisionRadius   = null;

        // Damage dealt to the users on contact
        this._damage            = null;
        this._wasInDamageRange  = new Map();   // user → inside the range on the previous check

        // Pressure on the users (state driven by the Collision pressure passes)
        this._blockedBehavior   = 'stall';   // 'stall' | 'reverse' | 'crush'
        this._blockedSlowFactor = 1;         // animation speed factor while pressing
        this._blockedPressing   = false;     // pressing a user (lasts while the overlap does)
        this._crushDamage       = null;      // {delta, windowS} | null
        this._crushActive       = false;     // pressing AND moving this frame (arms the damage tick)
        this._crushClockS       = 0;
        this._crushVictims      = [];        // users pinched by it this turn

        // Moving floor this instance stands on (its Y follows that floor)
        this._rideOn            = null;
        this._rideBaseY         = 0;
        this._rideLastDy        = 0;

        // Lifecycle hooks: fired when the animation actually starts / reaches
        // its final keyframe (game-layer effects like floor texture changes)
        this._onStart           = null;
        this._onComplete        = null;
        // Vertical motion direction of the animation (-1 down, 0 still, +1 up)
        // and its change hook (game-layer motion sounds).
        this._onMotionChange    = null;
        this._motionDir         = 0;
        this._motionNotifyMuted = false;
    }

    setOnStart(fn) {
        this._onStart = fn;
    }

    setOnComplete(fn) {
        this._onComplete = fn;
    }

    /**
     * Called with the new vertical direction (-1/0/+1) whenever the animation
     * starts moving, reverses or comes to rest, plateaus included.
     *
     * @param {function} fn (dir) => void
     */
    setOnMotionChange(fn) {
        this._onMotionChange = fn;
    }

    // While muted, motion changes are neither tracked nor notified, so a
    // pressure stall goes unnoticed.
    setMotionNotifyMuted(muted) {
        this._motionNotifyMuted = (muted === true);
        return this;
    }

    _noteMotionDir(dir) {
        if (this._motionNotifyMuted || (dir === this._motionDir)) {
            return;
        }
        this._motionDir = dir;
        if (this._onMotionChange !== null) {
            this._onMotionChange(dir);
        }
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
        if (this._autoStart) {
            this.start();
        }
    }

    setObject(objectId) {
        this._objectId = objectId;
        this._object   = loader.objects().get(objectId);
        this._computeWorldCenter();
        return this;
    }

    // null when standing on static floor
    getRideOn() {
        return this._rideOn;
    }

    translate(dx, dy, dz) {
        this._position[0]    += dx;
        this._position[1]    += dy;
        this._position[2]    += dz;
        this._worldCenter[0] += dx;
        this._worldCenter[1] += dy;
        this._worldCenter[2] += dz;
        // Re-bases the ride at the new Y, or the next sync would snap it back
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

    // Predicates ANDed before a proximity/action trigger may fire (a locked
    // door checking the key)
    addTriggerCondition(fn) {
        this._triggerConditions.push(fn);
        return this;
    }

    // No short-circuit: a stateful gate (line-crossing sampler) must keep
    // sampling while another one refuses.
    _conditionsMet(user) {
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
            stopTime:       this._animStopTime,
            paused:         this._animPaused,
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
        this._animStopTime    = prev.stopTime;
        this._animPaused      = prev.paused;
        this._animDone        = prev.done;
        this._computeWorldCenter();
    }

    // Plain-data snapshot restorable by importAnimState after a deterministic
    // rebuild of the same scene; the ridden floor is referenced by its code.
    exportAnimState() {
        return {
            position:       [...this._position],
            rotation:       [...this._rotation],
            time:           this._animTime,
            playing:        this._animPlaying,
            reverse:        this._animReverse,
            reverseScale:   this._animReverseScale,
            stopTime:       this._animStopTime,
            paused:         this._animPaused,
            done:           this._animDone,
            variant:        this._animActiveVariant,
            defaultVariant: this._animDefaultVariant,
            rideOnCode:     ((this._rideOn !== null) ? this._rideOn.getCode() : null),
            rideBaseY:      this._rideBaseY,
            rideLastDy:     this._rideLastDy,
        };
    }

    /**
     * The ride is restored as saved: setRideOn() would re-base it on the mover's
     * current delta. Lifecycle hooks that already fired are replayed, their
     * effects (a floor texture change) being part of the progress.
     *
     * @param {object} state from exportAnimState
     * @param {Instance|null} rideOnInstance resolved from state.rideOnCode by the caller
     */
    importAnimState(state, rideOnInstance = null) {
        if (this._cycleOf(state.variant) !== null) {
            this._applyCycle(state.variant);
        }
        // Older saves lack the field and keep the loaded default
        this._animDefaultVariant = (state.defaultVariant ?? this._animDefaultVariant);
        this._position           = [...state.position];
        this._rotation           = [...state.rotation];
        this._animTime           = state.time;
        this._animPlaying        = state.playing;
        this._animReverse        = state.reverse;
        this._animReverseScale   = state.reverseScale;
        this._animStopTime       = (state.stopTime ?? null);
        this._animPaused         = (state.paused ?? false);
        this._animDone           = state.done;
        this._rideOn             = rideOnInstance;
        this._rideBaseY          = state.rideBaseY;
        this._rideLastDy         = state.rideLastDy;
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

    /**
     * @param {User[]} users
     * @param {number} dt - milliseconds
     */
    checkDamage(users, dt) {
        this._crushDamageTick(dt);
        if (!this._damage) {
            return;
        }
        for (const user of users) {
            if (!user.isDead()) {
                this._contactDamage(user, dt);
            }
        }
    }

    _contactDamage(user, dt) {
        const dx = user.getCenterX() - this._worldCenter[0];
        const dy = user.getCenterY() - this._worldCenter[1];
        const dz = user.getCenterZ() - this._worldCenter[2];
        const inRange = (Math.sqrt(dx*dx + dy*dy + dz*dz) <= this._damage.radius);
        if (this._damage.type === 'direct') {
            if (inRange && !(this._wasInDamageRange.get(user) ?? false)) {
                user.takeDamage(this._damage.delta);
            }
            this._wasInDamageRange.set(user, inRange);
        } else {
            if (inRange) {
                user.takeDamage(this._damage.delta * dt / 1000);
            }
        }
    }

    // One hit per windowS while pressing AND moving (PIT_ChangeSector), dealt
    // to every living victim; the clock is primed on the pressing edge so the
    // first hit is immediate, and stands still while no victim lives.
    _crushDamageTick(dt) {
        if ((this._crushDamage === null) || (this._crushActive !== true)) {
            return;
        }
        const victims = this._crushVictims.filter((user) => !user.isDead());
        if (victims.length === 0) {
            return;
        }
        this._crushClockS += dt / 1000;
        if (this._crushClockS >= this._crushDamage.windowS) {
            this._crushClockS %= this._crushDamage.windowS;
            for (const user of victims) {
                user.takeDamage(this._crushDamage.delta);
            }
        }
    }

    getBlockedBehavior() {
        return this._blockedBehavior;
    }

    isBlockedPressing() {
        return this._blockedPressing;
    }

    // Vanilla lateral escape: a pressing crusher is passable for the player
    isCrushPassable() {
        return ((this._blockedBehavior === 'crush') && (this._blockedPressing === true));
    }

    setBlockedPressing(pressing) {
        if ((pressing === true) && (this._blockedPressing === false)) {
            this._crushClockS = ((this._crushDamage !== null) ? this._crushDamage.windowS : 0);
        }
        if (pressing === false) {
            this._crushClockS  = 0;
            this._crushActive  = false;
            this._crushVictims = [];
        }
        this._blockedPressing = pressing;
    }

    setCrushActive(active) {
        this._crushActive = active;
    }

    // The users a pressing crusher pinches this turn: its damage tick hits them.
    setCrushVictims(users) {
        this._crushVictims = users;
    }

    // Y then follows the floor's animation delta. The base is taken at the
    // floor's rest pose, since a position set mid-travel already includes it.
    setRideOn(floorInstance) {
        const dy = floorInstance.getTransform().deltaTranslate[1];

        this._rideOn     = floorInstance;
        this._rideBaseY  = this._position[1] - dy;
        this._rideLastDy = dy;
    }

    clearRide() {
        this._rideOn = null;
    }

    // First step of an instance's turn, before its triggers: a body riding a
    // moving floor is tested where that floor carried it.
    followRide() {
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

    /**
     * Fill the instance from an `.instance.json` descriptor or a runtime spawn's
     * equivalent. The time bounds are computed later by finalizeInit.
     *
     * @param {object} data {code, object (loader id or url), position, rotation,
     *                       trigger, loop, onlyOnce, collisionShape,
     *                       collisionRadius, interactionRadius,
     *                       interactionShape, interactionReachBelow,
     *                       interactionReachAbove, autoStart, damage,
     *                       blockedBehavior, blockedSlowFactor, crushDamage,
     *                       interaction, keyframes, keyframeVariants,
     *                       defaultVariant}
     */
    populate(data) {
        // Runtime spawns omit the key; consumers test against null
        this.setCode(data.code ?? null);
        this._objectId                = ((typeof data.object === 'number') ? data.object : loader.objects().load(data.object));
        this._position                = data.position;
        this._restY                   = data.position[1];
        this._rotation                = data.rotation;
        this._trigger                 = data.trigger;
        this._animLoop                = (data.loop === true);
        this._animOnlyOnce            = (data.onlyOnce === true);
        this._collisionShape          = (data.collisionShape ?? 'none');
        this._collisionRadius         = (data.collisionRadius ?? null);
        this._interactionRadius       = (data.interactionRadius ?? null);
        this._interactionShape        = (data.interactionShape ?? 'sphere');
        this._interactionReachBelow   = (data.interactionReachBelow ?? 0);
        this._interactionReachAbove   = (data.interactionReachAbove ?? 0);
        this._autoStart               = (data.autoStart === true);
        this._damage                  = (data.damage || null);
        this._blockedBehavior         = (data.blockedBehavior ?? 'stall');
        this._blockedSlowFactor       = (data.blockedSlowFactor ?? 1);
        this._crushDamage             = (data.crushDamage ?? null);
        this._interaction             = (data.interaction || null);
        this._animKeyframes           = (data.keyframes || []);
        this._animVariants            = (data.keyframeVariants || null);
        this._animDefaultVariant      = (data.defaultVariant ?? null);

        return this;
    }

    // Something left to do: keyframes or an interaction, and not a spent
    // one-shot — a done cycle stays live when a variant can follow it (start() accepts one).
    _isLive() {
        if ((this._animKeyframes.length === 0) && (this._interaction === null)) {
            return false;
        }
        return !(this._animDone && (this._animVariants === null));
    }

    /**
     * Second step of an instance's turn, once per user: the first user whose
     * presence or use starts the animation wins, the others find it playing.
     *
     * @param {User}    user
     * @param {boolean} action - this user's use button
     */
    checkTriggers(user, action) {
        if (!this._removalScheduled && this._isLive()) {
            this._checkTrigger(user, action);
        }
    }

    // An instance on its way out triggers for no user any more, whoever reaches it later in the turn.
    markForRemoval() {
        this._removalScheduled = true;
    }

    /**
     * Last step of an instance's turn: its animation runs once, whoever triggered it.
     *
     * @param {number} dt - milliseconds
     */
    advance(dt) {
        if (!this._isLive() || !this._animPlaying) {
            return;
        }

        const prevY = this._delta.translate[1];
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
            if ((this._animStopTime !== null) && (this._animTime >= this._animStopTime) && (this._animStopTime < this._animMaxTime)) {
                this._animTime     = this._animStopTime;
                this._animStopTime = null;
                this._animPlaying  = false;
            } else if (this._animTime >= this._animMaxTime) {
                if (this._animLoop) {
                    this._animTime = this._animTime % this._animMaxTime;
                } else {
                    this.stop();
                }
            }
        }

        this._computeWorldCenter();

        const dy = (this._delta.translate[1] - prevY);
        this._noteMotionDir(((!this._animPlaying || (Math.abs(dy) <= Instance.MOTION_EPSILON)) ? 0 : Math.sign(dy)));
    }

    // A once-only trigger that already fired is spent for every actor
    isTriggerSpent() {
        return this._animDone;
    }

    // Draw-time position offset (the physics body stays put), used to smooth
    // tick-stepped motion
    setRenderOffset(dx, dy, dz) {
        this._renderOffset = [dx, dy, dz];
    }

    clearRenderOffset() {
        this._renderOffset = null;
    }

    // Widens the frustum-test sphere rather than moving its centre
    getRenderOffsetBound() {
        if (this._renderOffset === null) {
            return 0;
        }
        const o = this._renderOffset;
        return Math.sqrt(o[0]*o[0] + o[1]*o[1] + o[2]*o[2]);
    }

    // Draw-time light multiplier (1 = baked colours), so instances sharing an
    // object can be lit differently
    setRenderLight(factor) {
        this._renderLight = factor;
    }

    getRenderLight() {
        return this._renderLight;
    }

    // Draw-time billboard spin in its own plane, in radians (0 = upright)
    setRenderRoll(radians) {
        this._renderRoll = radians;
    }

    getRenderRoll() {
        return this._renderRoll;
    }

    // The roll turns the body around its origin, not its bounding-sphere centre
    getRenderRollBound() {
        if (this._renderRoll === 0) {
            return 0;
        }
        const c = this._object.getCenter();

        return (2 * Math.sqrt(c[0] * c[0] + c[1] * c[1] + c[2] * c[2]));
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

    // Fires the zone for a non-user actor, consuming it like the user path.
    // Returns true when it fired (never on a spent or busy zone).
    fireZoneTrigger(activator = null) {
        if ((this._trigger === 'none') || this._animDone || this._animPlaying) {
            return false;
        }
        this.start();
        if (!this._animPlaying) {
            return false;
        }
        this._notifyTriggered(activator);
        return true;
    }

    // A zone with no keyframes stops right away, so its once-only flag spends it
    _notifyTriggered(activator) {
        if (this._interaction === null) {
            return;
        }
        loader.interactions().getByCode(this._interaction).triggered(this, activator);
        if (this._animKeyframes.length === 0) {
            this.stop();
        }
    }

    // A cylinder measures its vertical window from the live base to the user's
    // feet, so a tall target does not eat into the horizontal reach.
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
        if ((this._trigger === 'none') || this._animPlaying) {
            return;
        }

        const inRange = ((this._interactionRadius !== null) && this._inInteractionRange(user));

        switch (this._trigger) {
            case 'always':
                this.start();
                break;
            case 'proximity':
                if (inRange && this._conditionsMet(user)) {
                    this.start();
                }
                break;
            case 'action':
                if (inRange && action) {
                    // Reported either way: a refused press is a use failure
                    const accepted = this._conditionsMet(user);
                    user.noteUseTarget(accepted);
                    if (accepted) {
                        this.start();
                    }
                }
                break;
        }

        if (this._animPlaying) {
            this._notifyTriggered(user);
        }
    }

    // variant: a keyframeVariants name, null = the default cycle. Returns whether
    // the trigger was taken: false while busy or when the cycle cannot start
    // from the current pose (a switch only spends itself on a taken action).
    start(variant = null) {
        if (this._animPlaying) {
            return false;
        }
        // P_ActivateInStasis: a parked cycle resumes as-is, whatever the trigger
        // asks for, stop time included.
        if (this._isPausedMidCycle()) {
            this._animPaused  = false;
            this._animPlaying = true;
            if (this._onStart !== null) {
                this._onStart();
            }
            return true;
        }
        this._animStopTime = null;
        // Another cycle is a fresh thinker, so a done animation accepts it. An
        // undeclared key falls back to the default cycle (keys are broadcast).
        let wanted = (variant ?? this._animDefaultVariant);
        let cycle  = this._cycleOf(wanted);
        if ((wanted !== null) && (cycle === null)) {
            wanted = this._animDefaultVariant;
            cycle  = this._cycleOf(wanted);
        }
        const switching = ((wanted !== this._animActiveVariant) && (cycle !== null));
        // Vanilla no-op; resetting the time here would leave a stuck state
        if (this._animDone && !switching) {
            return true;
        }
        if (switching) {
            // Applied from another pose than its first keyframe, it would teleport
            if (!this._poseIsCycleStart(wanted)) {
                return false;
            }
            this._applyCycle(wanted);
        }
        this._animPlaying = true;
        if ((this._animKeyframes.length > 0) && (this._animTime >= this._animMaxTime)) {
            this._animTime = this._animKeyframes[0].t;
        }
        if (this._onStart !== null) {
            this._onStart();
        }

        return true;
    }

    // start() that pauses once the body has risen `dy` world units from rest.
    // A target already reached counts as taken.
    startUntilVerticalDelta(dy, variant = null) {
        if (this._animPlaying) {
            return false;
        }
        if (this._isPausedMidCycle()) {
            return this.start(variant);
        }
        const stopTime = this._timeAtVerticalDelta(dy);
        if ((stopTime !== null) && (stopTime <= this._animTime)) {
            return true;
        }
        const taken = this.start(variant);
        if (taken && this._animPlaying) {
            this._animStopTime = stopTime;
        }

        return taken;
    }

    // null when the timeline never gets there
    _timeAtVerticalDelta(dy) {
        const kf = this._animKeyframes;
        if ((kf.length === 0) || (dy <= kf[0].translate[1])) {
            return ((kf.length > 0) ? kf[0].t : null);
        }
        for (let i = 1; i < kf.length; i++) {
            const y0 = kf[i - 1].translate[1];
            const y1 = kf[i].translate[1];
            if ((y1 > y0) && (dy <= y1)) {
                return (kf[i - 1].t + ((dy - y0) / (y1 - y0)) * (kf[i].t - kf[i - 1].t));
            }
        }

        return null;
    }

    _isPausedMidCycle() {
        return (this._animPaused && !this._animPlaying);
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
        this._animStopTime       = null;
        this._animPaused         = false;
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

    // EV_StopPlat stasis: a later start() resumes where it stopped
    pause() {
        this._animPaused  = (this._animPlaying && (this._animKeyframes.length > 0)
            && (this._animTime > this._animKeyframes[0].t) && (this._animTime < this._animMaxTime));
        this._animPlaying = false;
        this._noteMotionDir(0);
    }

    // Plays the keyframes backward, even on a finished one-way. timeScale lets
    // the return run at another speed (a turbo lower reversed by a slow raise).
    // Returns false only while busy.
    startReverse(timeScale = 1) {
        if (this._animPlaying || (this._animKeyframes.length === 0)) {
            return false;
        }
        if (this._animTime <= this._animKeyframes[0].t) {
            return true;
        }
        this._animReverse      = true;
        this._animReverseScale = timeScale;
        this._animStopTime     = null;
        this._animPaused       = false;
        this._animDone         = false;
        this._animPlaying      = true;

        return true;
    }

    // blockedBehavior 'reverse' (T_VerticalDoor, T_PlatRaise): a reversing
    // mover flips forward again, a forward one starts reversing.
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
        this._animTime       = this._animMaxTime;
        this._animStopTime   = null;
        this._animPaused     = false;
        this._animPlaying    = false;
        this._noteMotionDir(0);
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
            if ((this._animTime >= this._animKeyframes[i].t) && (this._animTime <= this._animKeyframes[i + 1].t)) {
                k0 = this._animKeyframes[i];
                k1 = this._animKeyframes[i + 1];
                break;
            }
        }

        if ((k0 === k1) || (k1.t === k0.t)) {
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

    // Animation delta plus any ride or game-driven move since load
    getVerticalShift() {
        return (this._position[1] - this._restY) + this._delta.translate[1];
    }
}

// Pose tolerance of _poseIsCycleStart (world units / degrees)
Instance.POSE_EPSILON = 1e-3;

// Below this per-frame vertical delta the animation counts as still (a wait
// plateau, not a slow leg) for the motion-change hook.
Instance.MOTION_EPSILON = 1e-6;
