/**
 * A weapon definition. A weapon references the ammo type it consumes
 * (ammoType), it does not own the ammo: the pool of counters lives on
 * DoomUser.
 */
class DoomWeapon extends AbstractDoomObject {
    constructor(definition) {
        super(definition, false);
        this._ammoType = definition.ammoType ?? null;
        this._perShot  = definition.perShot ?? 0;
        this._damage   = definition.damage ?? 0;
    }

    getAmmoType() {
        return this._ammoType;
    }

    getPerShot() {
        return this._perShot;
    }

    getDamage() {
        return this._damage;
    }
}
