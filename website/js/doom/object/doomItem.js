/**
 * An inventory item definition: keys and power-ups. type is one of
 * 'key' | 'powerupPermanent' | 'powerupTimed'. duration (ms) only matters for
 * the timed power-ups. pickupHeal (health points, healed up to that value on
 * every pickup, BEFORE the already-owned check — Doom's berserk) and
 * pickupWeapon (weapon code raised on pickup — the berserk draws the fist)
 * are null for regular items. Items reset on a new level by default (keys are
 * not carried over).
 */
class DoomItem extends AbstractDoomObject {
    constructor(definition) {
        super(definition, true);
        this._type         = definition.type;
        this._effect       = definition.effect ?? null;
        this._duration     = definition.duration ?? 0;
        this._pickupHeal   = definition.pickupHeal ?? null;
        this._pickupWeapon = definition.pickupWeapon ?? null;
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

    getPickupWeapon() {
        return this._pickupWeapon;
    }
}
