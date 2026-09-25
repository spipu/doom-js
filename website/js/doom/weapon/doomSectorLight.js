/**
 * Light of the weapon view sprite, taken from the sector the player stands in
 * (gzdoom lights the weapon by the view sector), live flicker included.
 * The sector light is remapped by a brightening curve, like the software
 * renderer's psprite boost (a psprite is lit at distance zero): the weapon
 * is never fully black. Fullbright frames skip this entirely.
 */
class DoomSectorLight {
    // Weapon light in a fully black sector (bottom anchor of the curve).
    static get WEAPON_LIGHT_FLOOR() {
        return 0.1;
    }

    // Face light at which the weapon reaches full brightness (top anchor).
    static get WEAPON_LIGHT_FULL_AT() {
        return 0.6;
    }

    /**
     * @param {function}    sectorIndexAt    (doomX, doomY) → sector index | null
     * @param {object|null} lightInteraction live flicker/strobe factors
     * @param {object[]}    sectors          live parsed sectors
     */
    constructor(sectorIndexAt, lightInteraction, sectors) {
        this._sectorIndexAt = sectorIndexAt;
        this._lights        = lightInteraction;
        this._sectors       = sectors;
    }

    // 1 (fullbright) when the point falls outside every sector.
    factorAt(worldX, worldZ) {
        const sectorIndex = this._sectorIndexAt(worldX / WadConstants.SCALE, worldZ / WadConstants.SCALE);
        if (sectorIndex === null) {
            return 1;
        }
        const liveFactor = ((this._lights !== null) ? this._lights.getFactor(sectorIndex) : 1);
        return this._weaponFactor((this._sectors[sectorIndex].light / 255) * liveFactor);
    }

    // Straight line through (0, FLOOR) and (FULL_AT, 1), saturated at 1.
    _weaponFactor(faceLight) {
        const floor = DoomSectorLight.WEAPON_LIGHT_FLOOR;
        const slope = (1 - floor) / DoomSectorLight.WEAPON_LIGHT_FULL_AT;
        return Math.min(1, floor + (slope * faceLight));
    }
}
