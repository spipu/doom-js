/**
 * Player sector-light lookup, used to shade the weapon view sprite from the
 * sector the player stands in (gzdoom lights the weapon by the view sector).
 * Built on the world builder's point-to-sector lookup, shared with the other
 * runtime services that ask what a world point stands on; queried once per frame.
 * The face light (light/255, times the live flicker/strobe/glow factor of the
 * sector so the weapon pulses with the room) is then remapped by the weapon
 * brightness curve: like the psprite boost of the software renderer (a psprite
 * is lit at distance zero, so it reads brighter than the walls), the weapon
 * follows a straight line from WEAPON_LIGHT_FLOOR in a black sector up to full
 * brightness at WEAPON_LIGHT_FULL_AT of face light, then saturates — it is
 * never fully black. Fullbright frames skip this entirely.
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
     * @param {function}      siAt             (doomX, doomY) → sector index | null
     * @param {object|null}   lightInteraction live flicker/strobe factors
     * @param {object[]}      sectors          live parsed sectors
     */
    constructor(siAt, lightInteraction, sectors) {
        this._siAt    = siAt;
        this._lights  = lightInteraction;
        this._sectors = sectors;
    }

    // Weapon light factor (0..1) at a world position; 1 (fullbright) when the
    // point falls outside every sector.
    factorAt(worldX, worldZ) {
        const si = this._siAt(worldX / WadConstants.SCALE, worldZ / WadConstants.SCALE);
        if (si === null) {
            return 1;
        }
        const dynamic = ((this._lights !== null) ? this._lights.getFactor(si) : 1);
        return this._weaponFactor((this._sectors[si].light / 255) * dynamic);
    }

    // Straight line through (0, FLOOR) and (FULL_AT, 1), saturated at 1.
    _weaponFactor(faceLight) {
        const floor = DoomSectorLight.WEAPON_LIGHT_FLOOR;
        const slope = (1 - floor) / DoomSectorLight.WEAPON_LIGHT_FULL_AT;
        return Math.min(1, floor + (slope * faceLight));
    }
}
