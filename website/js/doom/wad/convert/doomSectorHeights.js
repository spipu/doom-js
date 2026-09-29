/**
 * Live floor and ceiling heights of a sector, in map units: the static
 * (post-patch) values corrected by the current offset of the sector's mover
 * instances — a door's ceiling is its panel bottom (closed rest = its floor),
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
        const floor = this._movers(si).floor;
        if (floor === null) {
            return rest;
        }

        return (rest + this._deltaOf(floor));
    }

    ceilingOf(si) {
        const door = this._movers(si).door;
        if (door === null) {
            return this._sectors[si].ch;
        }

        return (this._doorFloorH[si] + this._deltaOf(door));
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

    _deltaOf(inst) {
        return (inst.getVerticalShift() / WadConstants.SCALE);
    }

    // Lazy resolution: the builder only lists codes it actually built, so
    // getByCode never throws here.
    _movers(si) {
        if (this._moverCache[si] === undefined) {
            const entry  = this._moverCodes[si];
            const instOf = (code) => ((code !== null) ? loader.instances().getByCode(code) : null);
            this._moverCache[si] = ((entry !== undefined)
                ? {floor: instOf(entry.floor), door: instOf(entry.door)}
                : DoomSectorHeights.NO_MOVER);
        }

        return this._moverCache[si];
    }
}

DoomSectorHeights.NO_MOVER = {floor: null, door: null};
