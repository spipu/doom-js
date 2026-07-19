/**
 * An inventory item definition: keys and power-ups. type is one of
 * 'key' | 'powerupPermanent' | 'powerupTimed'. duration (ms) only matters for
 * the timed power-ups. pickupHeal (health points, healed up to that value on
 * every pickup, BEFORE the already-owned check — Doom's berserk) is null for
 * regular items. Items reset on a new level by default (keys are not carried
 * over).
 */
class DoomItem extends AbstractDoomObject {
    constructor(data) {
        super(data, true);
        this._type       = data.type;
        this._effect     = data.effect ?? null;
        this._duration   = data.duration ?? 0;
        this._pickupHeal = data.pickupHeal ?? null;
    }

    getType() {
        return this._type;
    }

    getEffect() {
        return this._effect;
    }

    getDuration() {
        return this._duration;
    }

    getPickupHeal() {
        return this._pickupHeal;
    }
}
