/**
 * Per-level secret counting (sector special 9). Vanilla: P_SpawnSpecials adds
 * every secret sector to the level total, then P_PlayerInSpecialSector credits
 * the player the first time his feet rest on the sector floor and clears the
 * special. Here a found zone is dropped from the list (same one-shot dedup)
 * and the counters live on DoomGame — level stats, reset by startFromWad.
 */
class DoomSecretInteraction extends AbstractInteraction {
    /**
     * @param {object[]}      zones    - [{si, floorY (world), outers?}]
     * @param {DoomGame}      game
     * @param {function|null} sectorAt - (doomX, doomY) → si|null (BSP); null = the
     *                                   zones carry polygon outers and test them
     */
    constructor(zones, game, sectorAt = null) {
        super();
        this._zones    = zones;
        this._game     = game;
        this._sectorAt = sectorAt;
        // Deterministic identity of each zone (the build order), so a save can
        // record which secrets are still pending across a level rebuild.
        this._zones.forEach((zone, index) => {
            zone.buildIndex = index;
        });
    }

    get code() {
        return 'secretSectors';
    }

    exportState() {
        return {pending: this._zones.map((zone) => zone.buildIndex)};
    }

    importState(state) {
        const pending = new Set(state.pending);
        this._zones = this._zones.filter((zone) => pending.has(zone.buildIndex));
    }

    triggered(instance) {
    }

    update(dt) {
        if (this._zones.length === 0) {
            return;
        }
        const user = loader.world().get().getUser();
        if (user.isDead()) {
            return;
        }

        const doomX = user.x / WadConstants.SCALE;
        const doomZ = user.z / WadConstants.SCALE;
        // Feet on the sector floor, like the damage sectors (vanilla checks
        // mo->z == floorheight before crediting the secret)
        if (this._sectorAt !== null) {
            const si  = this._sectorAt(doomX, doomZ);
            const idx = this._zones.findIndex((zone) => (zone.si === si));
            if ((idx >= 0) && (Math.abs(user.y - this._zones[idx].floorY) <= 0.02)) {
                this._zones.splice(idx, 1);
                this._game.addSecretFound();
            }
            return;
        }
        for (let i = 0; i < this._zones.length; i++) {
            const zone = this._zones[i];
            if (Math.abs(user.y - zone.floorY) > 0.02) {
                continue;
            }
            for (const outer of zone.outers) {
                if (WadGeometry.pointInPolygon2d(doomX, doomZ, outer)) {
                    this._zones.splice(i, 1);
                    this._game.addSecretFound();
                    return;
                }
            }
        }
    }
}
