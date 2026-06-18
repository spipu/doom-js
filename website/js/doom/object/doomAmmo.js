/**
 * An ammo type definition (bullets, shells, rockets, cells). maxNormal is the
 * standard cap; maxPack is the higher cap unlocked by the backpack. The actual
 * counters are held per type on DoomUser (shared pool across weapons).
 */
class DoomAmmo extends AbstractDoomObject {
    constructor(data) {
        super(data, false);
        this._maxNormal = data.maxNormal ?? 0;
        this._maxPack   = data.maxPack ?? 0;
    }

    getMaxNormal() {
        return this._maxNormal;
    }

    getMaxPack() {
        return this._maxPack;
    }
}
