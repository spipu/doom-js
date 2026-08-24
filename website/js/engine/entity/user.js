class User {
    constructor(x, y, z, yaw, pitch, maxEnergy) {
        this.x     = x;
        this.y     = y;
        this.z     = z;
        this.yaw   = yaw;
        this.pitch = pitch;

        // Physics params (all have setters)
        this._height           = 0.85;
        this._eyeRatio         = 0.82;
        this._crouchRatio      = 0.55;
        this._crouchSpeed      = 4.0;
        this._radius           = 0.2;
        this._gravity          = 15.0;
        this._maxJumpVelocity  = 5.0;
        this._maxFallSpeed     = 20.0;
        this._apexGravityBoost = 0.8;
        this._maxSlopeAngle    = 45;
        this._stepHeight       = 0.25;
        this._groundSnapDist   = 0.3;
        this._coyoteTime       = 100;
        this._jumpBufferTime   = 150;
        this._airControl       = 0.15;
        this._maxLean          = 0.8;
        this._leanSpeed        = 5.0;
        this._maxEnergy        = maxEnergy;
        this._moveSpeed        = 0.003;
        this._turnSpeed        = 0.1;
        // Fall damage: on by default, its two thresholds expressed as multiples
        // of the actor height — nothing billed below the safe one, the full
        // energy bar at the max one. A game with another scale overrides them.
        this._fallDamage       = true;
        this._fallSafeFactor   = 2.5;
        this._fallMaxFactor    = 10;

        // Physics state
        this._vy             = 0;
        this._onGround       = false;
        this._wasOnGround    = false;
        this._canJump        = false;
        this._jumpPressed    = false;
        this._jumpHeld       = false;
        this._coyoteTimer    = 0;
        this._jumpBuffer     = 0;
        this._crouchProgress = 0;
        this._crouchTarget   = 0;
        this._strafeLean     = 0;
        this._strafeDir      = 0;
        this._prevX          = x;
        this._prevZ          = z;
        this._realVelocityXZ = 0;
        this._walkSlow       = false;
        this._vx             = 0;
        this._vz             = 0;
        this._inputX         = 0;
        this._inputZ         = 0;
        // Environment perturbations (wind, conveyors, ice) fed by game code
        this._externalForces = new ActorExternalForces();

        // Energy / death
        this._energy         = maxEnergy;
        this._dead           = false;
        this._fallPeakY      = null;
        this._energyFlash    = 0;
        this._pickupFlash    = 0;
        this._deathRoll      = 0;
        this._deathEyeRatio  = 1.0;
        // Kill plane: falling below this y (out of the map) kills the player.
        // null = disabled.
        this._voidKillY      = null;

        // Smooth step up: when the body is snapped onto a step, the eye keeps
        // its world height (negative offset) and catches up with the body in
        // a gravity-driven free rise (vel += g·dt), re-latching on the real
        // height once the gap is crossed — frame-rate independent.
        this._stepViewOffset = 0;   // metres, <= 0
        this._stepViewVel    = 0;   // m/s catch-up speed

        // Armor (defensive stat: absorbs a fraction of incoming damage)
        this._armor       = 0;
        this._maxArmor    = 0;
        this._armorAbsorb = 0;

        // Walk animation
        this._walkAngle = 0;
        this._walking   = false;
        this._deltaTime = 0;
    }

    // --- Setters ---
    setHeight(v) {
        this._height = v;
        return this;
    }

    setEyeRatio(v) {
        this._eyeRatio = v;
        return this;
    }

    setVoidKillY(v) {
        this._voidKillY = v;
        return this;
    }

    setCrouchRatio(v) {
        this._crouchRatio = v;
        return this;
    }

    setCrouchSpeed(v) {
        this._crouchSpeed = v;
        return this;
    }

    setRadius(v) {
        this._radius = v;
        return this;
    }

    setGravity(v) {
        this._gravity = v;
        return this;
    }

    setMaxJumpVelocity(v) {
        this._maxJumpVelocity = v;
        return this;
    }

    setMaxFallSpeed(v) {
        this._maxFallSpeed = v;
        return this;
    }

    setApexGravityBoost(v) {
        this._apexGravityBoost = v;
        return this;
    }

    setMaxSlopeAngle(deg) {
        this._maxSlopeAngle = deg;
        return this;
    }

    setFallDamage(enabled) {
        this._fallDamage = (enabled === true);
        return this;
    }

    setFallSafeFactor(v) {
        this._fallSafeFactor = v;
        return this;
    }

    setFallMaxFactor(v) {
        this._fallMaxFactor = v;
        return this;
    }

    setStepHeight(v) {
        this._stepHeight = v;
        return this;
    }

    getStepHeight() {
        return this._stepHeight;
    }

    isOnGround() {
        return this._onGround;
    }

    setGroundSnapDist(v) {
        this._groundSnapDist = v;
        return this;
    }

    setCoyoteTime(ms) {
        this._coyoteTime = ms;
        return this;
    }

    setJumpBufferTime(ms) {
        this._jumpBufferTime = ms;
        return this;
    }

    setAirControl(f) {
        this._airControl = f;
        return this;
    }

    setMaxLean(deg) {
        this._maxLean = deg;
        return this;
    }

    setLeanSpeed(v) {
        this._leanSpeed = v;
        return this;
    }

    setEnergyMax(v) {
        this._maxEnergy = v;
        this._energy = Math.min(this._energy, v);
        return this;
    }

    setEnergy(v) {
        this._energy = Math.max(0, Math.min(v, this._maxEnergy));
        return this;
    }

    // Heal by amount, clamped to cap (defaults to the normal max). cap may exceed
    // _maxEnergy for over-heal pickups (soul sphere → 200) and never lowers a
    // value already above it. Returns true only if energy actually rose (drives
    // the Doom "don't consume the pickup when already full" rule).
    addEnergy(amount, cap = this._maxEnergy) {
        const ceiling = Math.max(cap, this._energy);
        const next    = Math.min(this._energy + amount, ceiling);
        const raised  = (next > this._energy);
        this._energy = next;
        return raised;
    }

    setMoveSpeed(v) {
        this._moveSpeed = v;
        return this;
    }

    setTurnSpeed(v) {
        this._turnSpeed = v;
        return this;
    }

    setArmor(v) {
        this._armor = Math.max(0, Math.min(v, this._maxArmor));
        return this;
    }

    setMaxArmor(v) {
        this._maxArmor = v;
        this._armor = Math.min(this._armor, v);
        return this;
    }

    setArmorAbsorb(v) {
        this._armorAbsorb = v;
        return this;
    }

    // --- Getters ---
    getEnergy() {
        return this._energy;
    }

    getMaxEnergy() {
        return this._maxEnergy;
    }

    getArmor() {
        return this._armor;
    }

    getMaxArmor() {
        return this._maxArmor;
    }

    getArmorAbsorb() {
        return this._armorAbsorb;
    }

    getRadius() {
        return this._radius;
    }

    getStrafeLean() {
        return this._strafeLean + this._deathRoll;
    }

    getRealVelocityXZ() {
        return this._realVelocityXZ;
    }

    getEnergyFlash() {
        return this._energyFlash;
    }

    getPickupFlash() {
        return this._pickupFlash;
    }

    // Brief golden screen pulse on item pickup (Doom bonuscount). Decays in
    // updateMove like the damage flash; the HUD composites the two.
    flashPickup() {
        this._pickupFlash = Math.max(this._pickupFlash, 0.5);
        return this;
    }

    isDead() {
        return this._dead;
    }

    syncPositionTracking() {
        this._prevX = this.x;
        this._prevZ = this.z;
    }

    // --- Energy ---

    // Immediate death, bypassing the armor (void fall, kill plane).
    kill() {
        this._energy      = 0;
        this._dead        = true;
        this._energyFlash = Math.max(this._energyFlash, 1);
    }

    takeDamage(delta) {
        if ((this._armor > 0) && (this._armorAbsorb > 0)) {
            const absorbed = Math.min(this._armor, delta * this._armorAbsorb);
            this._armor -= absorbed;
            delta       -= absorbed;
            if (this._armor <= 0) {
                this._armorAbsorb = 0;
            }
        }

        this._energy = Math.max(0, this._energy - delta);
        if (this._energy <= 0) {
            this._dead = true;
        }
        this._energyFlash += delta * 0.05;
        this._energyFlash = Math.max(this._energyFlash, 0.7);
    }

    getExternalForces() {
        return this._externalForces;
    }

    // Discontinuous displacement (teleport, respawn): the body keeps no
    // momentum, no environmental push and no pending fall from the old spot.
    haltMotion() {
        this._vx             = 0;
        this._vz             = 0;
        this._vy             = 0;
        this._fallPeakY      = null;
        this._externalForces = new ActorExternalForces();
        return this;
    }

    // --- Input ---
    beginFrame(deltaTime) {
        this._deltaTime = deltaTime;
        this._walking   = false;
        this._inputX    = 0;
        this._inputZ    = 0;
        this._strafeDir = 0;
        this._externalForces.beginFrame();
    }

    // scale: signed -1..+1 — keyboard gives ±1, sticks their analog deflection.
    // +1 = forward, -1 = backward
    move(scale) {
        if (this.isDead() || (scale === 0)) {
            return;
        }
        this._inputX += scale * Math.sin(DEG_TO_RAD * this.yaw);
        this._inputZ += scale * Math.cos(DEG_TO_RAD * this.yaw);
        this._walking = true;
    }

    // +1 = right, -1 = left
    strafe(scale) {
        if (this.isDead() || (scale === 0)) {
            return;
        }
        this._inputX += scale * Math.cos(DEG_TO_RAD * this.yaw);
        this._inputZ -= scale * Math.sin(DEG_TO_RAD * this.yaw);
        this._strafeDir = ((scale < 0) ? -1 : 1);
        this._walking = true;
    }

    lookMouse(dx, dy) {
        if (this.isDead()) {
            return;
        }
        this.yaw   += dx * this._turnSpeed;
        this.pitch  = Math.max(-89, Math.min(89, this.pitch - dy * this._turnSpeed));
    }

    setWalkSlow(bool) {
        if (!this.isDead()) {
            this._walkSlow = bool;
        }
    }

    setCrouch(bool) {
        if (!this.isDead()) {
            this._crouchTarget = ((bool) ? 1 : 0);
        }
    }

    pressJump() {
        if (this.isDead()) {
            return;
        }
        this._jumpPressed = true;
        this._jumpHeld    = true;
    }

    releaseJump() {
        this._jumpHeld = false;
    }

    // --- Fall damage infrastructure ---
    _startFall() {
        if (this._fallPeakY === null) {
            this._fallPeakY = this.y;
        }
    }

    _trackFallPeak() {
        if (this._fallPeakY !== null) {
            this._fallPeakY = Math.max(this._fallPeakY, this.y);
        }
    }

    _endFall() {
        if (this._fallPeakY === null) {
            return;
        }
        const fallDist = this._fallPeakY - this.y;
        // Cleared whatever follows: kept, the next fall would measure from
        // this one's peak and bill the two together.
        this._fallPeakY = null;
        if (!this._fallDamage) {
            return;
        }
        const safeH = this._height * this._fallSafeFactor;
        const maxH  = this._height * this._fallMaxFactor;
        if (fallDist <= safeH) {
            return;
        }
        const ratio = Math.min(1, (fallDist - safeH) / (maxH - safeH));
        this.takeDamage(ratio * this._maxEnergy);
    }

    // --- Physics ---
    updateMove(collision) {
        if (!collision) {
            if (!this._walking) {
                this._walkAngle = 0;
                return;
            }
            this._walkAngle += this._deltaTime * 0.6;
            if (this._walkAngle > 360) {
                this._walkAngle -= 360;
            }
            return;
        }

        const dt    = this._deltaTime;
        const dt_ms = Math.min(dt, 200);
        const dt_s  = dt_ms / 1000;

        // 0. Prep
        this._wasOnGround = this._onGround;

        // 1. Timers
        if (this._coyoteTimer > 0) {
            this._coyoteTimer = Math.max(0, this._coyoteTimer - dt);
        }
        if (this._jumpBuffer > 0) {
            this._jumpBuffer = Math.max(0, this._jumpBuffer - dt);
        }

        // 2. Jump buffer: memorize jump intent if in air
        if (this._jumpPressed && !this._onGround && !this._canJump) {
            this._jumpBuffer = this._jumpBufferTime;
        }

        // 3. Horizontal movement
        const inputLen = Math.sqrt(this._inputX*this._inputX + this._inputZ*this._inputZ);
        if (!this.isDead()) {
            if (this._onGround) {
                let targetVx = 0;
                let targetVz = 0;
                if (inputLen > 1e-10) {
                    // Clamp to 1 instead of normalizing: keyboard diagonals stay
                    // capped, analog partial deflections keep their magnitude
                    const norm = ((inputLen > 1) ? (1 / inputLen) : 1);
                    let speed = this._moveSpeed;
                    if (this._walkSlow) {
                        speed *= 0.5;
                    }
                    speed *= (1 - this._crouchProgress * 0.4);
                    targetVx = this._inputX * norm * speed;
                    targetVz = this._inputZ * norm * speed;
                }
                const friction = this._externalForces.getGroundFriction();
                if (friction === null) {
                    this._vx = targetVx;
                    this._vz = targetVz;
                } else {
                    // Slippery ground: inertial blend toward the same target
                    // speed — per tick `v = v*f + target*(1-f)`, closed form
                    // over the frame. Sluggish start, long slide, identical
                    // top speed.
                    const keep = Math.pow(friction, dt_s * ActorExternalForces.TICK_RATE);
                    this._vx = this._vx * keep + targetVx * (1 - keep);
                    this._vz = this._vz * keep + targetVz * (1 - keep);
                }
            } else if (inputLen > 1e-10) {
                // Air steering: nudge velocity toward desired direction
                const norm = ((inputLen > 1) ? (1 / inputLen) : 1);
                const nudge = this._moveSpeed * this._airControl;
                this._vx += this._inputX * norm * nudge * dt_s;
                this._vz += this._inputZ * norm * nudge * dt_s;
                const vLen = Math.sqrt(this._vx*this._vx + this._vz*this._vz);
                if (vLen > this._moveSpeed) {
                    this._vx = this._vx / vLen * this._moveSpeed;
                    this._vz = this._vz / vLen * this._moveSpeed;
                }
            }
        }
        // Environment push (wind/conveyors): its own velocity channel,
        // integrated at tick rate and summed into the frame displacement so a
        // single resolveWall call keeps wall sliding correct. It applies to a
        // DEAD player too (GZDoom-style: the corpse keeps drifting on the
        // current) — only the input velocity dies with the player.
        this._externalForces.integrate(dt_s);
        const inputVx = ((this.isDead()) ? 0 : this._vx);
        const inputVz = ((this.isDead()) ? 0 : this._vz);
        const vx = inputVx * dt_ms + this._externalForces.getVelX() * dt_s;
        const vz = inputVz * dt_ms + this._externalForces.getVelZ() * dt_s;
        if (Math.abs(vx) > 1e-10 || Math.abs(vz) > 1e-10) {
            const res = collision.resolveWall(this.x, this.z, vx, vz, this._radius, this.y, this.getCurrentHeight(), this._stepHeight);
            const blocked = (Math.abs(res.x - this.x) < 1e-8 && Math.abs(res.z - this.z) < 1e-8);
            if (!blocked) {
                const destFloor = collision.getFloor(res.x, res.z, this._radius, this.y + this._stepHeight);
                const destCeil  = collision.getCeiling(res.x, res.z, this._radius, ((destFloor !== -Infinity) ? destFloor + this._stepHeight : this.y));
                if (destFloor === -Infinity || destCeil - destFloor >= this.getCurrentHeight()) {
                    this.x = res.x;
                    this.z = res.z;
                }
            } else if (this._onGround) {
                this._tryStepUp(collision, vx, vz);
            }
        }

        // 4. Gravity
        this._vy -= this._gravity * dt_s;
        if (this._vy < 0) {
            this._vy -= this._gravity * this._apexGravityBoost * dt_s;
        }
        this._vy = Math.max(this._vy, -this._maxFallSpeed);

        // 5. Jump trigger
        if ((this._jumpPressed || this._jumpBuffer > 0) && (this._canJump || this._coyoteTimer > 0)) {
            this._vy          = this._maxJumpVelocity;
            this._canJump     = false;
            this._coyoteTimer = 0;
            this._jumpBuffer  = 0;
            this._startFall();
        }

        // 6. Jump cut (variable height — applied once on release)
        if (!this._jumpHeld && this._vy > 0) {
            this._vy      *= 0.5;
            this._jumpHeld = true;
        }

        // 7. Vertical movement — check ceiling before moving to prevent tunneling upward
        const yBeforeVertical = this.y;
        const ceilBefore = collision.getCeiling(this.x, this.z, this._radius, this.y + this.getCurrentHeight());
        this.y += this._vy * dt_s;
        if (this.y + this.getCurrentHeight() > ceilBefore) {
            this.y   = ceilBefore - this.getCurrentHeight();
            if (this._vy > 0) {
                this._vy = 0;
            }
        }

        // 8. Floor check — maxSearchY prevents floors above the player (e.g. a rising lift)
        //    from being mistaken for the ground and invalidating the onGround state.
        const maxFloorSearch = yBeforeVertical + this._stepHeight;
        const floorY      = collision.getFloor(this.x, this.z, this._radius, maxFloorSearch);
        const floorNormal = collision.getFloorNormal(this.x, this.z, this._radius, maxFloorSearch);
        const maxSlopeCos = Math.cos(this._maxSlopeAngle * DEG_TO_RAD);

        if (floorNormal && floorNormal[1] < maxSlopeCos) {
            // Too steep — no snapping
            this._onGround = false;
        } else if (floorY !== -Infinity && this.y <= floorY && floorY <= yBeforeVertical + this._stepHeight) {
            // Walking up a step: the lift is smoothed on the camera, not the
            // body (vanilla smooth step up). Measured from the pre-gravity y —
            // the per-frame gravity dip below the floor must NOT feed the
            // smoother (it fires every frame and makes the view oscillate).
            if (this._wasOnGround) {
                this._smoothStepUp(floorY - yBeforeVertical);
            }
            this.y = floorY;
            if (this._vy < 0) {
                this._vy = 0;
            }
            if (!this._wasOnGround) {
                this._endFall();
            }
            this._onGround = true;
            this._canJump  = true;
            this._jumpHeld = false;
            if (this._jumpBuffer > 0) {
                this._vy         = this._maxJumpVelocity;
                this._canJump    = false;
                this._jumpBuffer = 0;
                this._startFall();
            }
        } else if (this._wasOnGround && this._vy <= 0 && floorY !== -Infinity
            && (yBeforeVertical - floorY) > 0 && (yBeforeVertical - floorY) <= this._stepHeight) {
            // Walking down a step (drop within stepHeight, not jumping): the
            // body stays grounded on the lower floor, and the camera keeps its
            // height then falls back at 0.6×g (symmetric smooth step, down).
            this._smoothStepDown(yBeforeVertical - floorY);
            this.y = floorY;
            this._vy       = 0;
            this._onGround = true;
            this._canJump  = true;
            this._jumpHeld = false;
        } else {
            if (this._wasOnGround && !this._jumpPressed) {
                this._coyoteTimer = this._coyoteTime;
            }
            this._onGround = false;
        }

        // Kill plane: fell out of the map (below every floor) → the body rests
        // clamped on the plane and the player dies (death animation).
        if (this._voidKillY !== null && this.y < this._voidKillY) {
            this.y   = this._voidKillY;
            this._vy = 0;
            if (!this._dead) {
                this.kill();
            }
        }

        // Track fall peak while airborne
        if (!this._onGround) {
            if (this._wasOnGround) {
                this._startFall();
            }
            this._trackFallPeak();
        }

        // 9. Ground snapping (gentle slopes / stairs)
        if (this._wasOnGround && !this._onGround && !(this._vy > 0) && floorY !== -Infinity) {
            const snapDist = this.y - floorY;
            if (snapDist > 0 && snapDist < this._groundSnapDist) {
                this.y = floorY;
                this._onGround = true;
            }
        }

        // 10. No ceiling re-check after the ground snap: a mover pressing down
        // on the player is resolved by rolling the mover back
        // (resolveObjectPlayerBlockage), NOT by clamping the player under it —
        // a feet-level clamp would push the player through the floor before
        // the rollback runs.

        // 11. Crouch animation
        const crouchDelta = this._crouchSpeed * dt_s;
        if (this._crouchTarget === 1) {
            this._crouchProgress = Math.min(1, this._crouchProgress + crouchDelta);
        } else {
            const targetH = this._height * (1 - (this._crouchProgress - crouchDelta) * (1 - this._crouchRatio));
            if (collision.getCeiling(this.x, this.z, this._radius, this.y) >= this.y + targetH) {
                this._crouchProgress = Math.max(0, this._crouchProgress - crouchDelta);
            }
        }

        // 12. Real XZ velocity
        const dxActual = this.x - this._prevX;
        const dzActual = this.z - this._prevZ;
        this._realVelocityXZ = ((dt_s > 0) ? Math.sqrt(dxActual*dxActual + dzActual*dzActual) / dt_s : 0);
        this._prevX = this.x;
        this._prevZ = this.z;

        // 13. Head bob — gated on player INPUT (_walking), not just real
        // displacement: being pushed around (wind, conveyor) must not play
        // the walk animation.
        if (this._onGround && this._walking && this._realVelocityXZ > 0.01) {
            this._walkAngle += dt * 0.6;
            if (this._walkAngle > 360) {
                this._walkAngle -= 360;
            }
        } else {
            this._walkAngle = 0;
        }

        // 14. Strafe lean
        const targetLean = this._strafeDir * this._maxLean;
        const leanDelta  = this._leanSpeed * dt_s;
        if (this._strafeLean < targetLean) {
            this._strafeLean = Math.min(targetLean, this._strafeLean + leanDelta);
        } else {
            this._strafeLean = Math.max(targetLean, this._strafeLean - leanDelta);
        }

        // 15. Reset one-frame flags
        this._jumpPressed = false;

        // 16. Energy / pickup flash fade
        if (this._energyFlash > 0) {
            this._energyFlash = Math.max(0, this._energyFlash - dt_s);
        }
        if (this._pickupFlash > 0) {
            this._pickupFlash = Math.max(0, this._pickupFlash - dt_s);
        }

        // 16b. Smooth step recovery: the camera moves toward the body at 0.6×
        // the world gravity (up after a step up, down after a step down) and
        // re-latches on the real height when the gap is crossed.
        if (this._stepViewOffset !== 0) {
            const dir = ((this._stepViewOffset < 0) ? 1 : -1);
            this._stepViewVel    += 0.6 * this._gravity * dt_s;
            this._stepViewOffset += dir * this._stepViewVel * dt_s;
            if (dir * this._stepViewOffset >= 0) {
                this._stepViewOffset = 0;
                this._stepViewVel    = 0;
            }
        }

        // 17. Death animation — roll camera sideways and lower eye height
        if (this._dead) {
            if (this._deathRoll < 30) {
                this._deathRoll = Math.min(30, this._deathRoll + 30 * dt_s);
            }
            if (this._deathEyeRatio > 0.3) {
                this._deathEyeRatio = Math.max(0.3, this._deathEyeRatio - 0.7 * dt_s);
            }
        }
    }

    _tryStepUp(collision, vx, vz) {
        // No ceiling guard here: a local check would refuse legal steps in any
        // low corridor, and a too-low destination is already refused upstream
        // (normal-path clearance check; its upper wall blocks both passes).
        const testY = this.y + this._stepHeight;
        const res = collision.resolveWall(this.x, this.z, vx, vz, this._radius, testY, this.getCurrentHeight());
        if (Math.abs(res.x - this.x) < 1e-8 && Math.abs(res.z - this.z) < 1e-8) {
            return false;
        }
        const newFloor = collision.getFloor(res.x, res.z, this._radius);
        if (newFloor === -Infinity || newFloor < testY - this._stepHeight - 0.01) {
            return false;
        }
        this.x = res.x;
        this.z = res.z;
        this._smoothStepUp(newFloor - this.y);
        this.y = newFloor;
        return true;
    }

    // Smooth step up: keep the eye at its pre-step world height and let the
    // recovery pass (16b) catch up gravity-style. The offset is floored at
    // half the eye height (vanilla clamps viewheight at VIEWHEIGHT/2). Rises
    // below 3 cm (~2 doom units) are ignored: they are frame noise (gravity
    // dip, slow platform ride), not steps — smoothing them wobbles the view.
    // The catch-up speed is kept across chained steps (stairs feel continuous).
    _smoothStepUp(rise) {
        if (rise < 0.03) {
            return;
        }
        const maxDrop = this.getCurrentHeight() * this._eyeRatio * 0.5;
        this._stepViewOffset = Math.max(this._stepViewOffset - rise, -maxDrop);
    }

    // Symmetric: walking down a step, the camera keeps its height (positive
    // offset) and the recovery pass brings it down at 0.6×g.
    _smoothStepDown(drop) {
        if (drop < 0.03) {
            return;
        }
        const maxLift = this.getCurrentHeight() * this._eyeRatio * 0.5;
        this._stepViewOffset = Math.min(this._stepViewOffset + drop, maxLift);
    }

    // --- Geometry ---
    getCurrentHeight() {
        return this._height * (1 - this._crouchProgress * (1 - this._crouchRatio));
    }

    getCenterX() {
        return this.x;
    }

    getCenterY() {
        return this.y + this.getCurrentHeight() * 0.5;
    }

    getCenterZ() {
        return this.z;
    }

    getCameraX() {
        return this.x;
    }

    getCameraY() {
        const baseH = ((this._dead) ? this._height : this.getCurrentHeight());
        const eyeH  = baseH * this._eyeRatio * this._deathEyeRatio;
        const bob   = ((!this._dead && this._onGround && this._walking && this._realVelocityXZ > 0.01)
            ? 0.05 * Math.sin(this._walkAngle * DEG_TO_RAD) : 0);
        return this.y + eyeH * (1 + bob) + this._stepViewOffset;
    }
    getCameraZ() {
        return this.z;
    }
}
