/**
 * The drawable state of a player's weapon, in plain data: which weapon, which
 * frame of the weapon and of its muzzle flash, where the motion puts them, and
 * the flash extralight. The weapon controller writes it every tic on the
 * simulating device; a replica writes the same object on any other device, and
 * the presentation draws it without knowing which.
 */
class DoomWeaponView {
    constructor() {
        this.clear();
    }

    // No weapon: nothing drawn, no extralight.
    clear() {
        this._weapon       = null;   // weapon code
        this._weaponLump   = null;   // weapon frame sprite, null when the psprite is off
        this._weaponBright = false;
        this._flashLump    = null;   // flash frame sprite, null when no flash runs (always bright)
        this._offsetX      = 0;      // psprite offset in the 320x200 reference screen
        this._offsetY      = 0;
        this._lowered      = false;  // dropped out of sight (death)
        this._extraLight   = 0;      // A_Light1/2 level of the muzzle flash

        return this;
    }

    setWeapon(code) {
        this._weapon = code;

        return this;
    }

    getWeapon() {
        return this._weapon;
    }

    setWeaponFrame(lump, bright) {
        this._weaponLump   = lump;
        this._weaponBright = bright;

        return this;
    }

    getWeaponLump() {
        return this._weaponLump;
    }

    isWeaponBright() {
        return this._weaponBright;
    }

    setFlashFrame(lump) {
        this._flashLump = lump;

        return this;
    }

    getFlashLump() {
        return this._flashLump;
    }

    setOffset(x, y) {
        this._offsetX = x;
        this._offsetY = y;

        return this;
    }

    getOffsetX() {
        return this._offsetX;
    }

    getOffsetY() {
        return this._offsetY;
    }

    setLowered(lowered) {
        this._lowered = lowered;

        return this;
    }

    isLowered() {
        return this._lowered;
    }

    setExtraLight(level) {
        this._extraLight = level;

        return this;
    }

    getExtraLight() {
        return this._extraLight;
    }
}
