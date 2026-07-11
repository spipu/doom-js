/**
 * A weapon definition. A weapon references the ammo type it consumes
 * (ammoType), it does not own the ammo: the pool of counters lives on
 * DoomUser. perShot/damage are the base numbers the shooting subsystem will
 * consume (fire rate, hitscan/projectile and pellet data will come with it).
 */
class DoomWeapon extends AbstractDoomObject {
    constructor(data) {
        super(data, false);
        this._ammoType = data.ammoType ?? null;
        this._perShot  = data.perShot ?? 0;
        this._damage   = data.damage ?? 0;
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
