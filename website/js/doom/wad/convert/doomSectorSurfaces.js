/**
 * Live floor surface (flat, special) of every sector as the "+change" floors
 * rewrite them: a change reads its source here at fire time, like vanilla's
 * live line->frontsector, so chained platforms propagate. Saved with the game,
 * and shown on a replica from the main's state.
 */
class DoomSectorSurfaces {
    /**
     * @param {object[]} sectors parsed sectors ({ft, special, …})
     */
    constructor(sectors) {
        this._originalFlats    = sectors.map((sector) => sector.ft);
        this._originalSpecials = sectors.map((sector) => sector.special);
        this._flats            = [...this._originalFlats];
        this._specials         = [...this._originalSpecials];
        this._painters         = new Map();   // si → repaints the floor's faces with a flat
    }

    setPainter(si, painter) {
        this._painters.set(si, painter);

        return this;
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

    /**
     * A replica's floors as the main's state shows them: the flats received,
     * the WAD's elsewhere, each changed floor repainted — nothing fires there.
     *
     * @param {object[]} changed - {si, flat} of a DoomNetStateCapture StateSnapshot
     */
    showReplicatedFlats(changed) {
        for (const [si, painter] of this._painters) {
            const entry = changed.find((candidate) => (candidate.si === si));
            const flat  = ((entry !== undefined) ? entry.flat : this._originalFlats[si]);
            if (flat !== this._flats[si]) {
                painter(flat);
                this._flats[si] = flat;
            }
        }
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
