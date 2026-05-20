class User {
    constructor(x, y, z, yaw, pitch) {
        this.x     = x;
        this.y     = y;
        this.z     = z;
        this.yaw   = yaw;
        this.pitch = pitch;

        this._height          = 0.85;
        this._eyeRatio        = 0.82;
        this._crouchRatio     = 0.55;
        this._crouchSpeed     = 4.0;
        this._radius          = 0.2;
        this._gravity         = 15.0;
        this._maxJumpVelocity = 5.0;
        this.moveSpeed        = 0.003;
        this.turnSpeed        = 0.1;

        this._crouchProgress = 0;
        this._walkAngle      = 0;
        this._walking        = false;
        this._deltaTime      = 0;
    }

    setHeight(v)          { this._height          = v; return this; }
    setEyeRatio(v)        { this._eyeRatio        = v; return this; }
    setCrouchRatio(v)     { this._crouchRatio      = v; return this; }
    setCrouchSpeed(v)     { this._crouchSpeed      = v; return this; }
    setRadius(v)          { this._radius           = v; return this; }
    setGravity(v)         { this._gravity          = v; return this; }
    setMaxJumpVelocity(v) { this._maxJumpVelocity  = v; return this; }
    setMoveSpeed(v)       { this.moveSpeed         = v; return this; }
    setTurnSpeed(v)       { this.turnSpeed         = v; return this; }

    beginFrame(deltaTime) {
        this._deltaTime = deltaTime;
        this._walking   = false;
    }

    moveForward() {
        this.x += this._deltaTime * this.moveSpeed * Math.sin(DEG_TO_RAD * this.yaw);
        this.z += this._deltaTime * this.moveSpeed * Math.cos(DEG_TO_RAD * this.yaw);
        this._walking = true;
    }

    moveBackward() {
        this.x -= this._deltaTime * this.moveSpeed * Math.sin(DEG_TO_RAD * this.yaw);
        this.z -= this._deltaTime * this.moveSpeed * Math.cos(DEG_TO_RAD * this.yaw);
        this._walking = true;
    }

    strafeLeft() {
        this.x -= this._deltaTime * this.moveSpeed * Math.cos(DEG_TO_RAD * this.yaw);
        this.z += this._deltaTime * this.moveSpeed * Math.sin(DEG_TO_RAD * this.yaw);
        this._walking = true;
    }

    strafeRight() {
        this.x += this._deltaTime * this.moveSpeed * Math.cos(DEG_TO_RAD * this.yaw);
        this.z -= this._deltaTime * this.moveSpeed * Math.sin(DEG_TO_RAD * this.yaw);
        this._walking = true;
    }

    lookMouse(dx, dy) {
        this.yaw   += dx * this.turnSpeed;
        this.pitch  = Math.max(-89, Math.min(89, this.pitch - dy * this.turnSpeed));
    }

    updateMove() {
        if (!this._walking) {
            this._walkAngle = 0;
            return;
        }
        this._walkAngle += this._deltaTime * 0.6;
        if (this._walkAngle > 360) this._walkAngle -= 360;
    }

    getCurrentHeight() {
        return this._height * (1 - this._crouchProgress * (1 - this._crouchRatio));
    }
    getCenterX() { return this.x; }
    getCenterY() { return this.y + this.getCurrentHeight() * 0.5; }
    getCenterZ() { return this.z; }

    getCameraX() { return this.x; }
    getCameraY() {
        const h = this.getCurrentHeight() * this._eyeRatio;
        return this.y + h * (1 + 0.05 * Math.sin(this._walkAngle * DEG_TO_RAD));
    }
    getCameraZ() { return this.z; }
}
