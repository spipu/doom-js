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
        this._energy      = maxEnergy;
        this._dead        = false;
        this._fallPeakY   = null;
        this._energyFlash = 0;

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

    setMoveSpeed(v) {
        this.moveSpeed = v;
        return this;
    }

    setTurnSpeed(v) {
        this.turnSpeed = v;
        return this;
    }

    // --- Getters ---
    getEnergy() {
        return this._energy;
    }

    getMaxEnergy() {
        return this._maxEnergy;
    }

    getRadius() {
        return this._radius;
    }

    getStrafeLean() {
        return this._strafeLean;
    }

    getEnergyFlash() {
        return this._energyFlash;
    }

    isDead() {
        return this._dead;
    }

    // --- Energy ---
    takeDamage(delta) {
        this._energy = Math.max(0, this._energy - delta);
        if (this._energy <= 0) this._dead = true;
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

    moveForward() {
        if (this.isDead()) return;
        this._inputX += Math.sin(DEG_TO_RAD * this.yaw);
        this._inputZ += Math.cos(DEG_TO_RAD * this.yaw);
        this._walking = true;
    }

    moveBackward() {
        if (this.isDead()) return;
        this._inputX -= Math.sin(DEG_TO_RAD * this.yaw);
        this._inputZ -= Math.cos(DEG_TO_RAD * this.yaw);
        this._walking = true;
    }

    strafeLeft() {
        if (this.isDead()) return;
        this._inputX -= Math.cos(DEG_TO_RAD * this.yaw);
        this._inputZ += Math.sin(DEG_TO_RAD * this.yaw);
        this._strafeDir = -1;
        this._walking = true;
    }

    strafeRight() {
        if (this.isDead()) return;
        this._inputX += Math.cos(DEG_TO_RAD * this.yaw);
        this._inputZ -= Math.sin(DEG_TO_RAD * this.yaw);
        this._strafeDir = 1;
        this._walking = true;
    }

    lookMouse(dx, dy) {
        if (this.isDead()) return;
        this.yaw   += dx * this.turnSpeed;
        this.pitch  = Math.max(-89, Math.min(89, this.pitch - dy * this.turnSpeed));
    }

    setWalkSlow(bool) {
        if (!this.isDead()) this._walkSlow = bool;
    }

    setCrouch(bool) {
        if (!this.isDead()) this._crouchTarget = bool ? 1 : 0;
    }

    pressJump() {
        if (this.isDead()) return;
        this._jumpPressed = true;
        this._jumpHeld    = true;
    }

    releaseJump() {
        this._jumpHeld = false;
    }

    // --- Fall damage infrastructure ---
    _startFall() {
        if (this._fallPeakY === null) this._fallPeakY = this.y;
    }

    _trackFallPeak() {
        if (this._fallPeakY !== null) this._fallPeakY = Math.max(this._fallPeakY, this.y);
    }

    _endFall() {
        if (this._fallPeakY === null) return;
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
            if (!this._walking) { this._walkAngle = 0; return; }
            this._walkAngle += this._deltaTime * 0.6;
            if (this._walkAngle > 360) this._walkAngle -= 360;
            return;
        }

        const dt   = this._deltaTime;
        const dt_s = Math.min(dt, 200) / 1000;

        // 0. Prep
        this._wasOnGround = this._onGround;

        // 1. Timers
        if (this._coyoteTimer > 0) this._coyoteTimer = Math.max(0, this._coyoteTimer - dt);
        if (this._jumpBuffer  > 0) this._jumpBuffer  = Math.max(0, this._jumpBuffer  - dt);

        // 2. Jump buffer: memorize jump intent if in air
        if (this._jumpPressed && !this._onGround && !this._canJump) {
            this._jumpBuffer = this._jumpBufferTime;
        }

        // 3. Horizontal movement
        const inputLen = Math.sqrt(this._inputX*this._inputX + this._inputZ*this._inputZ);
        if (!this.isDead()) {
            if (this._onGround) {
                if (inputLen > 1e-10) {
                    const ndx = this._inputX / inputLen, ndz = this._inputZ / inputLen;
                    let speed = this.moveSpeed;
                    if (this._walkSlow) speed *= 0.5;
                    if (this._strafeDir !== 0) speed *= 0.7;
                    speed *= (1 - this._crouchProgress * 0.4);
                    this._vx = ndx * speed;
                    this._vz = ndz * speed;
                } else {
                    this._vx = 0; this._vz = 0;
                }
            } else if (inputLen > 1e-10) {
                // Air steering: nudge velocity toward desired direction
                const ndx = this._inputX / inputLen, ndz = this._inputZ / inputLen;
                const nudge = this.moveSpeed * this._airControl;
                this._vx += ndx * nudge * dt_s;
                this._vz += ndz * nudge * dt_s;
                const vLen = Math.sqrt(this._vx*this._vx + this._vz*this._vz);
                if (vLen > this.moveSpeed) { this._vx = this._vx/vLen * this.moveSpeed; this._vz = this._vz/vLen * this.moveSpeed; }
            }
            const vx = this._vx * dt, vz = this._vz * dt;
            if (Math.abs(vx) > 1e-10 || Math.abs(vz) > 1e-10) {
                const res = collision.resolveWall(this.x, this.z, vx, vz, this._radius, this.y, this.getCurrentHeight());
                const blocked = Math.abs(res.x - this.x) < 1e-8 && Math.abs(res.z - this.z) < 1e-8;
                if (!blocked) {
                    this.x = res.x; this.z = res.z;
                } else if (this._onGround) {
                    this._tryStepUp(collision, vx, vz);
                }
            }
        }

        // 4. Gravity
        this._vy -= this._gravity * dt_s;
        if (this._vy < 0) this._vy -= this._gravity * this._apexGravityBoost * dt_s;
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
            if (this._vy > 0) this._vy = 0;
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
            if (this._vy < 0) this._vy = 0;
            if (!this._wasOnGround) this._endFall();
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
            if (this._wasOnGround && !this._jumpPressed) this._coyoteTimer = this._coyoteTime;
            this._onGround = false;
        }

        // Track fall peak while airborne
        if (!this._onGround) {
            if (this._wasOnGround) this._startFall();
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
            if (this._vy > 0) this._vy = 0;
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
        const dxActual = this.x - this._prevX, dzActual = this.z - this._prevZ;
        this._realVelocityXZ = dt_s > 0 ? Math.sqrt(dxActual*dxActual + dzActual*dzActual) / dt_s : 0;
        this._prevX = this.x; this._prevZ = this.z;

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
        if (this._strafeLean < targetLean) this._strafeLean = Math.min(targetLean, this._strafeLean + leanDelta);
        else                               this._strafeLean = Math.max(targetLean, this._strafeLean - leanDelta);

        // 15. Reset one-frame flags
        this._jumpPressed = false;

        // 16. Energy flash fade
        if (this._energyFlash > 0) this._energyFlash = Math.max(0, this._energyFlash - dt_s);
    }

    _tryStepUp(collision, vx, vz) {
        const testY = this.y + this._stepHeight;
        if (collision.getCeiling(this.x, this.z, this._radius, testY + this.getCurrentHeight()) < testY + this.getCurrentHeight()) return false;
        const res = collision.resolveWall(this.x, this.z, vx, vz, this._radius, testY, this.getCurrentHeight());
        if (Math.abs(res.x - this.x) < 1e-8 && Math.abs(res.z - this.z) < 1e-8) return false;
        const newFloor = collision.getFloor(res.x, res.z, this._radius);
        if (newFloor === -Infinity || newFloor < testY - this._stepHeight - 0.01) return false;
        this.x = res.x; this.z = res.z; this.y = newFloor;
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
        const eyeH = this.getCurrentHeight() * this._eyeRatio;
        const bob  = (this._onGround && this._realVelocityXZ > 0.01)
            ? 0.05 * Math.sin(this._walkAngle * DEG_TO_RAD) : 0;
        return this.y + eyeH * (1 + bob);
    }
    getCameraZ() {
        return this.z;
    }
}
