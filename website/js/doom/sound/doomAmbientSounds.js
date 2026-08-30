/**
 * Ambient sound points of a level (Raven's sound things, skipped by the thing
 * catalog: no body, no sprite). Two natures, from the profile's ambientSounds
 * table:
 *
 *  - {loop}: a positioned, endlessly looping emitter (waterfall, wind);
 *  - {random}: a HereticAmbience script — after an initial hold, one
 *    unattenuated one-shot at random volume every few seconds (sndseq.txt:
 *    delayrand 350 tics first, then the sequence's own random waits).
 */
class DoomAmbientSounds {
    // HereticAmbience pacing, in seconds: the initial hold, then a draw
    // between the two bounds for every following one-shot.
    static INITIAL_HOLD_S  = 10;
    static RANDOM_MIN_S    = 6;
    static RANDOM_MAX_S    = 13;
    static RANDOM_MIN_GAIN = 0.25;

    constructor() {
        this._loops   = [];
        this._randoms = [];
        this._wait    = DoomAmbientSounds.INITIAL_HOLD_S;
        this._started = false;
    }

    /**
     * @param {string} name logical sound
     * @param {string} mode 'loop' | 'random'
     * @param {number[]} origin world [x, y, z]
     */
    add(name, mode, origin) {
        if (mode === 'loop') {
            this._loops.push({name: name, origin: origin, handle: null});
            return this;
        }
        this._randoms.push(name);

        return this;
    }

    /**
     * Called every game frame (frozen frames never reach it, so the pacing
     * pauses with the game). One SEQUENCER for the whole level, like the
     * vanilla ambient queue: each expiry voices one of the map's scripts.
     *
     * @param {number} dt ms
     */
    update(dt) {
        if (!this._started) {
            this._started = true;
            for (const loop of this._loops) {
                loop.handle = doomSound.playAt(loop.name, loop.origin, {loop: true});
            }
        }
        if (this._randoms.length === 0) {
            return this;
        }
        this._wait -= (dt / 1000);
        if (this._wait > 0) {
            return this;
        }
        this._wait = DoomAmbientSounds.RANDOM_MIN_S
            + Math.random() * (DoomAmbientSounds.RANDOM_MAX_S - DoomAmbientSounds.RANDOM_MIN_S);
        // Unattenuated, at a random volume — a level mood, not a place.
        const name   = this._randoms[Math.floor(Math.random() * this._randoms.length)];
        const handle = doomSound.playAt(name, null, {});
        if (handle !== null) {
            handle.setGain(DoomAmbientSounds.RANDOM_MIN_GAIN
                + Math.random() * (1 - DoomAmbientSounds.RANDOM_MIN_GAIN));
        }

        return this;
    }
}
