/**
 * The drawable state of a body — monster, corpse, barrel, drop — in plain
 * data: which of its views shows, how it faces, where it stands and how its
 * stepped motion is smoothed. The simulation writes it on the simulating
 * device; a replica writes the same object on any other device, and the
 * presentation draws it without knowing which.
 */
class DoomBodyView {
    /**
     * @param {Instance}    inst
     * @param {object|null} frames - view key → [objId ×1|×8]; null for a drop, whose sprite never changes
     */
    constructor(inst, frames) {
        this._inst         = inst;
        this._frames       = frames;
        this._frameKey     = null;       // null while no state was shown
        this._bright       = false;
        this._facing       = 0;          // Doom degrees
        this._sector       = null;       // sector index the body is lit by
        this._crushed      = false;      // ground into the gib pool
        this._hasOffset    = false;
        this._renderOffset = [0, 0, 0];  // glide from the previous spot, reused every frame
    }

    getInstance() {
        return this._inst;
    }

    getFrames() {
        return this._frames;
    }

    // The frame, facing and sector of a body entering or holding a state.
    showState(state, facing, sector) {
        return this.setFrame(DoomMonsterDef.viewKey(state.getSprite(), state.getFrame()), state.isBright())
            .setFacing(facing)
            .setSector(sector);
    }

    setFrame(frameKey, bright) {
        this._frameKey = frameKey;
        this._bright   = bright;

        return this;
    }

    getFrameKey() {
        return this._frameKey;
    }

    isBright() {
        return this._bright;
    }

    setFacing(facing) {
        this._facing = facing;

        return this;
    }

    getFacing() {
        return this._facing;
    }

    setSector(sector) {
        this._sector = sector;

        return this;
    }

    getSector() {
        return this._sector;
    }

    setCrushed(crushed) {
        this._crushed = crushed;

        return this;
    }

    isCrushed() {
        return this._crushed;
    }

    setRenderOffset(dx, dy, dz) {
        this._renderOffset[0] = dx;
        this._renderOffset[1] = dy;
        this._renderOffset[2] = dz;
        this._hasOffset       = true;

        return this;
    }

    clearRenderOffset() {
        this._hasOffset = false;

        return this;
    }

    // [dx, dy, dz], or null when the body is drawn at its spot.
    getRenderOffset() {
        return ((this._hasOffset) ? this._renderOffset : null);
    }
}
