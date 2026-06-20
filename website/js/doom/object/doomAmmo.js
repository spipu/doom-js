/**
 * An ammo type definition (bullets, shells, rockets, cells). maxNormal is the
 * standard cap; maxPack is the higher cap unlocked by the backpack. clip is the
 * base unit Doom hands out (small pickup amount), also used to compute the ammo
 * given when picking up a weapon of this type (2 × clip). The actual counters
 * are held per type on DoomUser (shared pool across weapons).
 */
class DoomAmmo extends AbstractDoomObject {
    constructor(data) {
        super(data, false);
        this._maxNormal = data.maxNormal ?? 0;
        this._maxPack   = data.maxPack ?? 0;
        this._clip      = data.clip ?? 0;
    }

    getMaxNormal() {
        return this._maxNormal;
    }

    getMaxPack() {
        return this._maxPack;
    }

    getClip() {
        return this._clip;
    }
}
