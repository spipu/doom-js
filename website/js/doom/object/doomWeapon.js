/**
 * A weapon definition. The fire-related fields (fireTexture, fireSpeed,
 * explosion) are declared now but only consumed by the shooting subsystem in a
 * later round. A weapon references the ammo type it consumes (ammoType), it
 * does not own the ammo: the pool of counters lives on DoomUser.
 */
class DoomWeapon extends AbstractDoomObject {
    constructor(data) {
        super(data, false);
        this._hudPos      = data.hudPos ?? null;
        this._ammoType    = data.ammoType ?? null;
        this._perShot     = data.perShot ?? 0;
        this._damage      = data.damage ?? 0;
        this._fireTexture = data.fireTexture ?? null;
        this._fireSpeed   = data.fireSpeed ?? 0;
        this._explosion   = data.explosion ?? null;
    }

    getHudPos() {
        return this._hudPos;
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

    getFireTexture() {
        return this._fireTexture;
    }

    getFireSpeed() {
        return this._fireSpeed;
    }

    getExplosion() {
        return this._explosion;
    }
}
