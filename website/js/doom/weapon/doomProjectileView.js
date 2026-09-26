/**
 * The drawable state of a shot in flight, in plain data: its flight frame and
 * its centre. The projectile system writes it on the simulating device; a
 * replica writes the same object on any other device, and the presentation
 * draws it without knowing which.
 */
class DoomProjectileView {
    /**
     * @param {Instance}                            inst
     * @param {Array<{objId: int, height: number}>} frames - the flight animation (DoomProjectileDefs)
     */
    constructor(inst, frames) {
        this._inst   = inst;
        this._frames = frames;
        this._frame  = 0;
        this._x      = 0;
        this._y      = 0;
        this._z      = 0;
    }

    getInstance() {
        return this._inst;
    }

    getFrames() {
        return this._frames;
    }

    setFrame(frame) {
        this._frame = frame;

        return this;
    }

    getFrame() {
        return this._frame;
    }

    setCenter(x, y, z) {
        this._x = x;
        this._y = y;
        this._z = z;

        return this;
    }

    getX() {
        return this._x;
    }

    getY() {
        return this._y;
    }

    getZ() {
        return this._z;
    }
}
