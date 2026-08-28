/**
 * The Icon of Sin's own bookkeeping: which spot the next cube is aimed at, and
 * what that cube hatches.
 *
 * Both answers are level STATE, not behaviour — the rotation must survive a
 * save, and the two verbs that consume it (A_BrainSpit through the attack
 * layer) stay three lines long. Same shape as DoomBossDeath: one service per
 * level, built by the world builder, handed the profile's data.
 */
class DoomBossBrain {
    /**
     * @param {object[]} targets - spots of the 'bossTarget' group, in map order
     * @param {object[]} spawns  - profile's bossCubeSpawns ladder [{below, kind}]
     * @param {boolean}  easy    - EasyBossBrain skill flag: one spit in two is
     *                             skipped (skills baby and easy)
     */
    constructor(targets, spawns, easy) {
        this._targets   = targets;
        this._spawns    = spawns;
        this._skipEvery = ((easy === true) ? 1 : 0);
        this._index     = 0;
        this._skipCount = 0;
    }

    /**
     * Spot the next cube goes to, taken in map order and looping — or null when
     * this spit is skipped, which is the whole of EasyBossBrain (SkipCount of
     * FSpotList::GetNextInList: the counter rises on every CALL, and only a
     * call past the skip count consumes a spot).
     *
     * @returns {{x, y, z, angle}|null}
     */
    nextTarget() {
        if (this._targets.length === 0) {
            return null;
        }
        this._skipCount++;
        if (this._skipCount <= this._skipEvery) {
            return null;
        }
        this._skipCount = 0;
        const spot = this._targets[this._index];
        this._index = ((this._index + 1) % this._targets.length);

        return spot;
    }

    /**
     * Monster a cube hatches, drawn on the vanilla weighted ladder (SpawnFly).
     * The roll comes from the shared P_Random table, like every other decision.
     *
     * @param {DoomRandom} rng
     * @returns {string} catalog key of the body to spawn
     */
    pickSpawn(rng) {
        const roll = rng.next();
        for (const entry of this._spawns) {
            if (roll < entry.below) {
                return entry.kind;
            }
        }

        return this._spawns[this._spawns.length - 1].kind;
    }

    // The rotation is the only state: the spots themselves are rebuilt with the
    // level, and the random table has its own index in the snapshot.
    exportState() {
        return {index: this._index, skipCount: this._skipCount};
    }

    importState(state) {
        if ((state ?? null) === null) {
            return;
        }
        this._index     = (state.index ?? 0);
        this._skipCount = (state.skipCount ?? 0);
    }
}
