/**
 * Live floor and ceiling heights of a sector, in map units: the static
 * (post-patch) values corrected by the current offset of the sector's mover
 * instance — a door's ceiling is its panel bottom (closed rest = its floor),
 * while a lift, rising floor or stair top rests at its original height and
 * carries the instance's Y delta. Read by the sound flood, the mover pressure
 * and the automap.
 */
class DoomSectorHeights {
    /**
     * @param {object} levelData - {sectors, restFh, doorFloorH, moverCodes}
     */
    constructor(levelData) {
        this._sectors    = levelData.sectors;
        this._restFh     = levelData.restFh;
        this._doorFloorH = levelData.doorFloorH;
        this._moverCodes = levelData.moverCodes;
        this._moverCache = {};
    }

    floorOf(si) {
        const rest  = ((this._restFh[si] !== undefined) ? this._restFh[si] : this._sectors[si].fh);
        const mover = this._mover(si);
        if ((mover === null) || (mover.kind === 'door')) {
            return rest;
        }

        return (rest + this._deltaOf(mover));
    }

    ceilingOf(si) {
        const mover = this._mover(si);
        if ((mover === null) || (mover.kind !== 'door')) {
            return this._sectors[si].ch;
        }

        return (this._doorFloorH[si] + this._deltaOf(mover));
    }

    /**
     * Both heights at once. Built on the scalar accessors rather than the other
     * way round: the automap reads thousands of heights per frame and must not
     * allocate a pair for each of them.
     *
     * @returns {{fh: number, ch: number}}
     */
    effectiveHeights(si) {
        return {fh: this.floorOf(si), ch: this.ceilingOf(si)};
    }

    // --- Internal ---

    _deltaOf(mover) {
        return (mover.inst.getVerticalShift() / WadConstants.SCALE);
    }

    // Lazy resolution: the builder only lists codes it actually built, so
    // getByCode never throws here.
    _mover(si) {
        if (this._moverCache[si] === undefined) {
            const entry = this._moverCodes[si];
            this._moverCache[si] = ((entry !== undefined)
                ? {kind: entry.kind, inst: loader.instances().getByCode(entry.code)}
                : null);
        }

        return this._moverCache[si];
    }
}
