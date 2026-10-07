/**
 * Light of the sectors as the presentation draws it: a sector's light times
 * its live flicker or strobe, for the bodies and the effects standing in it
 * and for the weapon view sprite (gzdoom lights the weapon by the view
 * sector). The weapon remaps that light by a brightening curve, like the
 * software renderer's psprite boost (a psprite is lit at distance zero): it
 * is never fully black. Fullbright frames skip all of this.
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
     * @param {function}    sectorIndexAt      (doomX, doomY) → sector index | null
     * @param {object|null} lightInteraction   live flicker/strobe factors
     * @param {object[]}    sectors            live parsed sectors
     * @param {Set<int>}    lightEffectSectors sectors running a light effect
     */
    constructor(sectorIndexAt, lightInteraction, sectors, lightEffectSectors) {
        this._sectorIndexAt      = sectorIndexAt;
        this._lights             = lightInteraction;
        this._sectors            = sectors;
        this._lightEffectSectors = lightEffectSectors;
    }

    /**
     * @returns {int|null} the sector under a world point, null outside every sector
     */
    sectorAt(worldX, worldZ) {
        return this._sectorIndexAt(worldX / WadConstants.SCALE, worldZ / WadConstants.SCALE);
    }

    /**
     * @param {int|null} sectorIndex
     * @returns {number} 0..1, full light when the sector is unknown
     */
    lightOf(sectorIndex) {
        if ((sectorIndex === null) || (this._sectors[sectorIndex] === undefined)) {
            return 1;
        }
        const liveFactor = ((this._lights !== null) ? this._lights.getFactor(sectorIndex) : 1);
        return (this._sectors[sectorIndex].light / 255) * liveFactor;
    }

    // What stands in such a sector must be re-lit every frame, not on change only.
    hasLightEffect(sectorIndex) {
        return ((sectorIndex !== null) && this._lightEffectSectors.has(sectorIndex));
    }

    // 1 (fullbright) when the point falls outside every sector.
    factorAt(worldX, worldZ) {
        const sectorIndex = this.sectorAt(worldX, worldZ);
        if (sectorIndex === null) {
            return 1;
        }
        return this._weaponFactor(this.lightOf(sectorIndex));
    }

    // Straight line through (0, FLOOR) and (FULL_AT, 1), saturated at 1.
    _weaponFactor(faceLight) {
        const floor = DoomSectorLight.WEAPON_LIGHT_FLOOR;
        const slope = (1 - floor) / DoomSectorLight.WEAPON_LIGHT_FULL_AT;
        return Math.min(1, floor + (slope * faceLight));
    }
}
