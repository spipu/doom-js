class User {
    constructor(x, y, z, eyeHeight, yaw, pitch) {
        this.x         = x;
        this.y         = y;
        this.z         = z;
        this.eyeHeight = eyeHeight;
        this.yaw       = yaw;
        this.pitch     = pitch;
        this._walkAngle = 0;
        this._walking   = false;
        this._deltaTime = 0;
        this.moveSpeed  = 0.003;
        this.turnSpeed  = 0.09;
    }

    lookLeft() {
        this.yaw -= this._deltaTime * this.turnSpeed;
    }

    lookRight() {
        this.yaw += this._deltaTime * this.turnSpeed;
    }

    lookUp() {
        this.pitch = Math.min(89, this.pitch + this._deltaTime * this.turnSpeed);
    }

    lookDown() {
        this.pitch = Math.max(-89, this.pitch - this._deltaTime * this.turnSpeed);
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

    updateTime(deltaTime) {
        this._deltaTime = deltaTime;
        this._walking   = false;
    }

    updateMove() {
        if (!this._walking) {
            this._walkAngle = 0;
            return;
        }

        this._walkAngle += this._deltaTime * 0.6;
        if (this._walkAngle > 360) {
            this._walkAngle -= 360.;
        }

    }

    getCameraX() {
        return this.x;
    }
    getCameraY() {
        return this.y + this.eyeHeight * (1. + 0.05 * Math.sin(this._walkAngle * DEG_TO_RAD));
    }
    getCameraZ() {
        return this.z;
    }
}
