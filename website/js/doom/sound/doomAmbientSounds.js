/**
 * Ambient sound points of a level (Raven's sound things, skipped by the thing
 * catalog: no body, no sprite). Two natures, from the profile's ambientSounds
 * table:
 *
 *  - {loop}: a positioned, endlessly looping emitter (waterfall, wind);
 *  - {sequence}: an environment number of the WAD's sound-sequence catalog —
 *    the level's scheduler sequence (the slot the environments declare, e.g.
 *    HereticAmbience) runs as one machine whose random picks are drawn from
 *    the environments the map actually holds.
 */
class DoomAmbientSounds {
    constructor() {
        this._loops          = [];
        this._environments   = new Set();
        this._sequencePlayer = null;
        this._started        = false;
    }

    /**
     * @param {string} name logical sound of a positioned loop
     * @param {number[]} origin world [x, y, z]
     */
    addLoop(name, origin) {
        this._loops.push({name: name, origin: origin, handle: null});
        return this;
    }

    /**
     * @param {number} environment sequence environment number (thing 1200+n → n)
     */
    addSequence(environment) {
        this._environments.add(environment);
        return this;
    }

    /**
     * Called every game frame (frozen frames never reach it, so the pacing
     * pauses with the game).
     *
     * @param {number} dt ms
     */
    update(dt) {
        if (!this._started) {
            this._started = true;
            for (const loop of this._loops) {
                loop.handle = doomSound.playAt(loop.name, loop.origin, {loop: true});
            }
            this._sequencePlayer = this._buildSequencePlayer();
        }
        if (this._sequencePlayer !== null) {
            this._sequencePlayer.update(dt);
        }

        return this;
    }

    // One player for the whole level (the vanilla ambient queue): it runs the
    // environments' slot sequence, its random picks limited to the map's environments.
    _buildSequencePlayer() {
        const sequences = doomSound.getSequences();
        if ((sequences === null) || (this._environments.size === 0)) {
            return null;
        }
        const candidates = [];
        let schedulerName = null;
        for (const environment of this._environments) {
            const name = sequences.environmentSequence(environment);
            if (name === null) {
                continue;
            }
            candidates.push(name);
            schedulerName = (schedulerName ?? sequences.byName(name).slot);
        }
        if ((candidates.length === 0) || (schedulerName === null) || (sequences.byName(schedulerName) === null)) {
            return null;
        }

        return new DoomSoundSequencePlayer(sequences, schedulerName, {candidates: candidates});
    }
}
