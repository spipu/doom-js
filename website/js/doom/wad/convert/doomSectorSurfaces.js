/**
 * Live floor surface of every sector — flat name and special — as the
 * "+change" floors rewrite them during play. The parsed sectors keep their WAD
 * values; a change reads its SOURCE here at firing time and writes its target
 * back, so a chain of raise-and-change platforms propagates the flat the
 * previous one just took (vanilla EV_DoFloor reads line->frontsector live).
 * Saved with the game and restored before the movers replay their hooks.
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
