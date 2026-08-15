/**
 * Walk-line activation of one zone, vanilla style (P_CrossSpecialLine): the
 * linedef fires when it is CROSSED, not while the player stands near it. The
 * engine zone keeps its proximity circle as a broadphase and defers here
 * through Instance.addTriggerCondition — without that gate a repeatable line
 * re-fires every frame, which turns a pair of opposite lines (the two walls of
 * a floor elevator, E1M8) into a yo-yo.
 */
class WadLineCrossing {
    /**
     * @param {number[]} segment - [x1, z1, x2, z2] of the linedef, world units
     */
    constructor(segment) {
        this._segment = WadLineCrossing._widened(segment);
        this._lastX   = null;
        this._lastZ   = null;
    }

    /**
     * True when the actor moved across the line since the previous call.
     */
    crossedBy(user) {
        const fromX = this._lastX;
        const fromZ = this._lastZ;
        this._lastX = user.getCenterX();
        this._lastZ = user.getCenterZ();
        if (fromX === null) {
            return false;
        }
        // Sampling only happens while the player is inside the zone circle, so
        // two consecutive samples may sit far apart (zone left and re-entered,
        // teleport arrival, restored save): the straight segment between them
        // would cross lines the player never walked through.
        if (Math.hypot(this._lastX - fromX, this._lastZ - fromZ) > WadConstants.WALK_CROSS_MAX_STEP) {
            return false;
        }

        return WadGeometry.segmentsCross(
            fromX, fromZ, this._lastX, this._lastZ,
            this._segment[0], this._segment[1], this._segment[2], this._segment[3]);
    }

    // --- Internal ---

    // Vanilla collects the crossed specials over the player BOX, not over their
    // centre (P_TryMove / PIT_CheckLine): brushing past the end of a line still
    // fires it. The centre test keeps that tolerance by lengthening the segment
    // by the player radius on both sides.
    static _widened([x1, z1, x2, z2]) {
        const length = Math.hypot(x2 - x1, z2 - z1);
        if (length === 0) {
            return [x1, z1, x2, z2];
        }
        const ex = ((x2 - x1) / length) * WadConstants.USER_DEFAULTS.radius;
        const ez = ((z2 - z1) / length) * WadConstants.USER_DEFAULTS.radius;

        return [x1 - ex, z1 - ez, x2 + ex, z2 + ez];
    }
}
