/**
 * The running level's statistics — vanilla totalsecret / totalkills /
 * totalitems, what has been found of them, and leveltime — and what each
 * player found of them (a kill with no player responsible counts for the
 * level alone), and the frags each player scored against each other one.
 * The simulation counts them on the main; the HUD, the tally and the saves
 * read them without knowing who fills them.
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
        this._matchTimeMs    = 0;
        this._players        = new Map();   // player id → {kills, items, secrets}
        this._frags          = new Map();   // killer id → Map(victim id → frags), player_t frags[]

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

    // The counts a sub shows, as the turn state and the intermission carry them.
    exportCounts() {
        return {
            secrets:      this._secretsFound,
            secretsTotal: this._secretsTotal,
            kills:        this._killsCount,
            killsTotal:   this._killsTotal,
            items:        this._itemsFound,
            itemsTotal:   this._itemsTotal,
            timeMs:       this._levelTimeMs,
            matchMs:      this._matchTimeMs,
            frags:        this._exportFrags()
        };
    }

    importCounts(counts) {
        this.setTotals(counts.secretsTotal, counts.killsTotal, counts.itemsTotal);
        this._matchTimeMs = counts.matchMs;
        this._frags       = new Map();
        for (const entry of counts.frags) {
            this._fragsOf(entry.killer).set(entry.victim, entry.count);
        }

        return this.restoreProgress(counts.secrets, counts.kills, counts.items, counts.timeMs);
    }

    _exportFrags() {
        const frags = [];
        for (const [killer, victims] of this._frags) {
            for (const [victim, count] of victims) {
                frags.push({killer: killer, victim: victim, count: count});
            }
        }

        return frags;
    }

    /**
     * A player died of another player's blow, or of its own (killer = victim).
     *
     * @param {int} killerId
     * @param {int} victimId
     */
    addFrag(killerId, victimId) {
        const victims = this._fragsOf(killerId);
        victims.set(victimId, (victims.get(victimId) ?? 0) + 1);
    }

    /**
     * ST_calcFrags: the frags against the other players, less those against oneself.
     *
     * @param {int} playerId
     * @returns {int}
     */
    fragScore(playerId) {
        const victims = this._frags.get(playerId);
        if (victims === undefined) {
            return 0;
        }
        let score = 0;
        for (const [victim, count] of victims) {
            score += ((victim === playerId) ? -count : count);
        }

        return score;
    }

    /**
     * @returns {int} the frags killerId scored against victimId (against itself when they are one)
     */
    fragsAgainst(killerId, victimId) {
        const victims = this._frags.get(killerId);

        return ((victims !== undefined) ? (victims.get(victimId) ?? 0) : 0);
    }

    // A seat given to another player: what its last player scored is not the newcomer's.
    forgetPlayer(playerId) {
        this._players.delete(playerId);
        this._frags.delete(playerId);
    }

    _fragsOf(killerId) {
        let victims = this._frags.get(killerId);
        if (victims === undefined) {
            victims = new Map();
            this._frags.set(killerId, victims);
        }

        return victims;
    }

    /**
     * @param {int|null} playerId - the finder
     */
    addSecretFound(playerId = null) {
        this._secretsFound++;
        this._countFor(playerId).secrets++;
    }

    getSecretsFound() {
        return this._secretsFound;
    }

    getSecretsTotal() {
        return this._secretsTotal;
    }

    /**
     * @param {int|null} playerId - the player responsible, null for none (infighting, a crusher)
     */
    addKill(playerId = null) {
        this._killsCount++;
        this._countFor(playerId).kills++;
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

    /**
     * @param {int|null} playerId - who picked it up
     */
    addItem(playerId = null) {
        this._itemsFound++;
        this._countFor(playerId).items++;
    }

    /**
     * @param {int[]} playerIds
     * @returns {{playerId: int, kills: int, items: int, secrets: int}[]} what each of those players found, in that order
     */
    playerCounts(playerIds) {
        return playerIds.map((playerId) => Object.assign({playerId: playerId}, this._countFor(playerId)));
    }

    // A null player collects the counts nobody is credited with, never read.
    _countFor(playerId) {
        let counts = this._players.get(playerId);
        if (counts === undefined) {
            counts = {kills: 0, items: 0, secrets: 0};
            this._players.set(playerId, counts);
        }

        return counts;
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
     * The level's simulated time (vanilla leveltime): the clock of the match's
     * time limit and of the deathmatch HUD, advanced by the simulation alone.
     *
     * @param {number} dt - ms
     */
    addMatchTime(dt) {
        this._matchTimeMs += dt;
    }

    getMatchTimeMs() {
        return this._matchTimeMs;
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
