/**
 * Per-level secret counting (sector special 9). Vanilla: P_SpawnSpecials adds
 * every secret sector to the level total, then P_PlayerInSpecialSector credits
 * the player the first time his feet rest on the sector floor and clears the
 * special. Here a found zone is dropped from the list (same one-shot dedup)
 * and the counters live on DoomGame — level stats, reset by startFromWad.
 */
class DoomSecretInteraction extends AbstractInteraction {
    /**
     * @param {object[]} zones - [{si, outers (doom-coord polygons), floorY (world)}]
     * @param {DoomGame} game
     */
    constructor(zones, game) {
        super();
        this._zones = zones;
        this._game  = game;
    }

    get code() {
        return 'secretSectors';
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
        for (let i = 0; i < this._zones.length; i++) {
            const zone = this._zones[i];
            // Feet on the sector floor, like the damage sectors (vanilla checks
            // mo->z == floorheight before crediting the secret)
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
