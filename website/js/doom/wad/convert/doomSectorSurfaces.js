/**
 * Live floor surface (flat, special) of every sector as the "+change" floors
 * rewrite them: a change reads its source here at fire time, like vanilla's
 * live line->frontsector, so chained platforms propagate. Saved with the game.
 */
class DoomSectorSurfaces {
    /**
     * @param {object[]} sectors parsed sectors ({ft, special, …})
     */
    constructor(sectors) {
        this._originalFlats    = sectors.map((sector) => sector.ft);
        this._originalSpecials = sectors.map((sector) => sector.special);
        this._flats    = [...this._originalFlats];
        this._specials = [...this._originalSpecials];
    }

    flatOf(si) {
        return this._flats[si];
    }

    specialOf(si) {
        return this._specials[si];
    }

    set(si, flat, special) {
        this._flats[si]    = flat;
        this._specials[si] = special;
    }

    /**
     * @returns {object[]} the sectors whose surface differs from the WAD
     */
    exportState() {
        const changed = [];
        for (let si = 0; si < this._flats.length; si++) {
            if ((this._flats[si] !== this._originalFlats[si]) || (this._specials[si] !== this._originalSpecials[si])) {
                changed.push({si: si, flat: this._flats[si], special: this._specials[si]});
            }
        }

        return changed;
    }

    importState(changed) {
        this._flats    = [...this._originalFlats];
        this._specials = [...this._originalSpecials];
        for (const entry of changed) {
            if (entry.si < this._flats.length) {
                this.set(entry.si, entry.flat, entry.special);
            }
        }
    }
}
