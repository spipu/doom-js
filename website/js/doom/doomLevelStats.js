/**
 * The running level's statistics — vanilla totalsecret / totalkills /
 * totalitems, what has been found of them, and leveltime. The simulation
 * counts them on the main; the HUD, the tally and the saves read them without
 * knowing who fills them.
 */
class DoomLevelStats {
    constructor() {
        this.reset();
    }

    reset() {
        this._secretsFound   = 0;
        this._secretsTotal   = 0;
        this._killsCount     = 0;
        this._killsTotal     = 0;
        this._itemsFound     = 0;
        this._itemsTotal     = 0;
        this._levelTimeMs    = 0;
        this._levelClockLast = null;

        return this;
    }

    // The totals come with the built level.
    setTotals(secretsTotal, killsTotal, itemsTotal) {
        this._secretsTotal = secretsTotal;
        this._killsTotal   = killsTotal;
        this._itemsTotal   = itemsTotal;

        return this;
    }

    // What a save brings back: the totals come from the rebuilt level.
    restoreProgress(secretsFound, killsCount, itemsFound, levelTimeMs) {
        this._secretsFound = secretsFound;
        this._killsCount   = killsCount;
        this._itemsFound   = itemsFound;
        this._levelTimeMs  = levelTimeMs;

        return this;
    }

    addSecretFound() {
        this._secretsFound++;
    }

    getSecretsFound() {
        return this._secretsFound;
    }

    getSecretsTotal() {
        return this._secretsTotal;
    }

    addKill() {
        this._killsCount++;
    }

    // A resurrected monster counts again in the total (A_VileChase / Revive).
    addKillTotal() {
        this._killsTotal++;
    }

    getKillsCount() {
        return this._killsCount;
    }

    getKillsTotal() {
        return this._killsTotal;
    }

    addItem() {
        this._itemsFound++;
    }

    getItemsFound() {
        return this._itemsFound;
    }

    getItemsTotal() {
        return this._itemsTotal;
    }

    getLevelTimeMs() {
        return this._levelTimeMs;
    }

    /**
     * Real time, not the engine delta, which is clamped to 50 ms and would lag
     * below 20 fps. Backgrounded-tab gaps are not counted.
     *
     * @param {number}  timestamp
     * @param {boolean} counting - false on frozen frames (pause, tally)
     */
    tickLevelClock(timestamp, counting) {
        const step = ((this._levelClockLast !== null) ? (timestamp - this._levelClockLast) : 0);
        if (counting && (step > 0) && (step <= DoomLevelStats.LEVEL_CLOCK_MAX_STEP_MS)) {
            this._levelTimeMs += step;
        }
        this._levelClockLast = timestamp;
    }
}

// Longest gap between two frames the level clock still counts (ms): well above
// the slowest playable frame, well below a tab switch.
DoomLevelStats.LEVEL_CLOCK_MAX_STEP_MS = 1000;
