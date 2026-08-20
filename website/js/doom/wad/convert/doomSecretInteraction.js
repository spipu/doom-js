/**
 * Per-level secret counting (sector special 9). Vanilla: P_SpawnSpecials adds
 * every secret sector to the level total, then P_PlayerInSpecialSector credits
 * the player the first time his feet rest on the sector floor and clears the
 * special. Here a found zone is dropped from the list (same one-shot dedup)
 * and the counters live on DoomGame — level stats, reset by startFromWad.
 */
class DoomSecretInteraction extends AbstractInteraction {
    /**
     * @param {DoomSectorZones} zones - [{si, floorY (world)}] behind the shared locator
     * @param {DoomGame}        game
     */
    constructor(zones, game) {
        super();
        this._zones = zones;
        this._game  = game;
    }

    get code() {
        return 'secretSectors';
    }

    // Zone identity in a save: the sector index — stable whatever lookup mode
    // (BSP or polygon fallback) enumerated the zones at rebuild.
    exportState() {
        return {pending: this._zones.list.map((zone) => zone.si)};
    }

    importState(state) {
        const pending = new Set(state.pending);
        this._zones.retain((zone) => pending.has(zone.si));
    }

    triggered(instance) {
    }

    update(dt) {
        if (this._zones.list.length === 0) {
            return;
        }
        const user = loader.world().get().getUser();
        if (user.isDead()) {
            return;
        }

        // Feet on the sector floor, like the damage sectors (vanilla checks
        // mo->z == floorheight before crediting the secret)
        const zone = this._zones.zoneUnderFeet(user.x, user.y, user.z);
        if (zone !== null) {
            this._zones.remove(zone);
            this._game.addSecretFound();
        }
    }
}
