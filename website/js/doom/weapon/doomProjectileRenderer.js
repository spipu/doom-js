/**
 * Draws the shots in flight from their views, the same on every device: the
 * current flight frame, and the billboard anchored on the shot's centre by
 * the frame's own height.
 */
class DoomProjectileRenderer {
    /**
     * @param {Set<DoomProjectileView>} views - the level's shots in flight
     */
    constructor(views) {
        this._views = views;
        this._shown = new WeakMap();   // view → frame set on its instance
    }

    draw() {
        for (const view of this._views) {
            const frame  = view.getFrame();
            const flight = view.getFrames()[frame];
            const inst   = view.getInstance();
            if (this._shown.get(view) !== frame) {
                inst.setObject(flight.objId);
                this._shown.set(view, frame);
            }
            // Through setPose: its world centre, the one the frustum test reads,
            // follows the shot on a device that runs no simulation.
            inst.setPose([view.getX(), view.getY() - flight.height / 2, view.getZ()],
                DoomProjectileRenderer.NO_DELTA, DoomProjectileRenderer.NO_DELTA);
        }
    }
}

DoomProjectileRenderer.NO_DELTA = [0, 0, 0];
