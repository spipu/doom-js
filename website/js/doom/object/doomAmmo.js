/**
 * An ammo type definition (bullets, shells, rockets, cells…). maxNormal is the
 * standard cap; maxPack is the higher cap unlocked by the backpack. clip is the
 * base unit the game hands out (small pickup amount), also used to compute the
 * ammo given when picking up a weapon of this type (2 × clip). packGive is what
 * the backpack pickup grants on top of raising the cap (defaults to clip —
 * Heretic's Bag of Holding gives no mace spheres). The actual counters are held
 * per type on DoomUser (shared pool across weapons).
 */
class DoomAmmo extends AbstractDoomObject {
    constructor(definition) {
        super(definition, false);
        this._maxNormal = definition.maxNormal ?? 0;
        this._maxPack   = definition.maxPack ?? 0;
        this._clip      = definition.clip ?? 0;
        this._packGive  = definition.packGive ?? this._clip;
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

    getPackGive() {
        return this._packGive;
    }
}
