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
        this.moveSpeed         = 0.003;
        this.turnSpeed         = 0.1;

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

        // Energy / death
        this._energy         = maxEnergy;
        this._dead           = false;
        this._fallPeakY      = null;
        this._energyFlash    = 0;
        this._pickupFlash    = 0;
        this._deathRoll      = 0;
        this._deathEyeRatio  = 1.0;

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

    setStepHeight(v) {
        this._stepHeight = v;
        return this;
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
        this.moveSpeed = v;
        return this;
    }

    setTurnSpeed(v) {
        this.turnSpeed = v;
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

    getEnergyFlash() {
        return this._energyFlash;
    }

    getPickupFlash() {
        return this._pickupFlash;
    }

    // Brief golden screen pulse on item pickup (Doom bonuscount). Decays in
    // updateMove like the damage flash; the HUD renders it under the red one.
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
    takeDamage(delta) {
        // Armor absorbs a fraction of the hit and is consumed point per point
        // of the amount it absorbs; the rest goes to energy.
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

    // --- Input ---
    beginFrame(deltaTime) {
        this._deltaTime = deltaTime;
        this._walking   = false;
        this._inputX    = 0;
        this._inputZ    = 0;
        this._strafeDir = 0;
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
        this.yaw   += dx * this.turnSpeed;
        this.pitch  = Math.max(-89, Math.min(89, this.pitch - dy * this.turnSpeed));
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
        const safeH    = this._height * 2.5;
        const maxH     = this._height * 10;
        if (fallDist > safeH) {
            const ratio = Math.min(1, (fallDist - safeH) / (maxH - safeH));
            this.takeDamage(ratio * this._maxEnergy);
        }
        this._fallPeakY = null;
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
                if (inputLen > 1e-10) {
                    // Clamp to 1 instead of normalizing: keyboard diagonals stay
                    // capped, analog partial deflections keep their magnitude
                    const norm = ((inputLen > 1) ? (1 / inputLen) : 1);
                    let speed = this.moveSpeed;
                    if (this._walkSlow) speed *= 0.5;
                    if (this._strafeDir !== 0) speed *= 0.7;
                    speed *= (1 - this._crouchProgress * 0.4);
                    this._vx = this._inputX * norm * speed;
                    this._vz = this._inputZ * norm * speed;
                } else {
                    this._vx = 0;
                    this._vz = 0;
                }
            } else if (inputLen > 1e-10) {
                // Air steering: nudge velocity toward desired direction
                const norm = ((inputLen > 1) ? (1 / inputLen) : 1);
                const nudge = this.moveSpeed * this._airControl;
                this._vx += this._inputX * norm * nudge * dt_s;
                this._vz += this._inputZ * norm * nudge * dt_s;
                const vLen = Math.sqrt(this._vx*this._vx + this._vz*this._vz);
                if (vLen > this.moveSpeed) {
                    this._vx = this._vx / vLen * this.moveSpeed;
                    this._vz = this._vz / vLen * this.moveSpeed;
                }
            }
            const vx = this._vx * dt_ms, vz = this._vz * dt_ms;
            if (Math.abs(vx) > 1e-10 || Math.abs(vz) > 1e-10) {
                const res = collision.resolveWall(this.x, this.z, vx, vz, this._radius, this.y, this.getCurrentHeight(), this._stepHeight);
                const blocked = Math.abs(res.x - this.x) < 1e-8 && Math.abs(res.z - this.z) < 1e-8;
                if (!blocked) {
                    const destFloor = collision.getFloor(res.x, res.z, this._radius, this.y + this._stepHeight);
                    const destCeil  = collision.getCeiling(res.x, res.z, this._radius, destFloor !== -Infinity ? destFloor + this._stepHeight : this.y);
                    if (destFloor === -Infinity || destCeil - destFloor >= this.getCurrentHeight()) {
                        this.x = res.x;
                        this.z = res.z;
                    }
                } else if (this._onGround) {
                    this._tryStepUp(collision, vx, vz);
                }
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
            this._vy         = this._maxJumpVelocity;
            this._canJump    = false;
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
        } else {
            if (this._wasOnGround && !this._jumpPressed) {
                this._coyoteTimer = this._coyoteTime;
            }
            this._onGround = false;
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

        // 10. Ceiling check
        const ceilY = collision.getCeiling(this.x, this.z, this._radius, this.y + this.getCurrentHeight());
        if (this.y + this.getCurrentHeight() > ceilY) {
            this.y = ceilY - this.getCurrentHeight();
            if (this._vy > 0) {
                this._vy = 0;
            }
        }

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

        // 13. Head bob
        if (this._onGround && this._realVelocityXZ > 0.01) {
            this._walkAngle += dt * 0.6;
            if (this._walkAngle > 360) this._walkAngle -= 360;
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
        const testY = this.y + this._stepHeight;
        if (collision.getCeiling(this.x, this.z, this._radius, testY + this.getCurrentHeight()) < testY + this.getCurrentHeight()) {
            return false;
        }
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
        this.y = newFloor;
        return true;
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
        const bob   = ((!this._dead && this._onGround && this._realVelocityXZ > 0.01)
            ? 0.05 * Math.sin(this._walkAngle * DEG_TO_RAD) : 0);
        return this.y + eyeH * (1 + bob);
    }
    getCameraZ() {
        return this.z;
    }
}
