// Player sector-light lookup, used to shade the weapon view sprite from the
// sector the player stands in (gzdoom lights the weapon by the view sector).
// Built from the world builder's sector polygon cache (Doom light 0..255) which
// would otherwise be dropped after the level loads; queried once per frame.
// The face light (light/255, times the live flicker/strobe/glow factor of the
// sector so the weapon pulses with the room) is then remapped by the weapon
// brightness curve: like the psprite boost of the software renderer (a psprite
// is lit at distance zero, so it reads brighter than the walls), the weapon
// follows a straight line from WEAPON_LIGHT_FLOOR in a black sector up to full
// brightness at WEAPON_LIGHT_FULL_AT of face light, then saturates — it is
// never fully black. Fullbright frames skip this entirely.
class DoomSectorLight {
    // Weapon light in a fully black sector (bottom anchor of the curve).
    static get WEAPON_LIGHT_FLOOR() {
        return 0.1;
    }

    // Face light at which the weapon reaches full brightness (top anchor).
    static get WEAPON_LIGHT_FULL_AT() {
        return 0.6;
    }

    constructor(sectorPolys, lightInteraction = null) {
        this._polys  = sectorPolys;
        this._lights = lightInteraction;
    }

    // Weapon light factor (0..1) at a world position; 1 (fullbright) when the
    // point falls outside every sector polygon.
    factorAt(worldX, worldZ) {
        const sec = this._sectorAt(worldX / WadConstants.SCALE, worldZ / WadConstants.SCALE);
        if (sec === null) {
            return 1;
        }
        const dynamic = ((this._lights !== null) ? this._lights.getFactor(sec.si) : 1);
        return this._weaponFactor((sec.light / 255) * dynamic);
    }

    // Straight line through (0, FLOOR) and (FULL_AT, 1), saturated at 1.
    _weaponFactor(faceLight) {
        const floor = DoomSectorLight.WEAPON_LIGHT_FLOOR;
        const slope = (1 - floor) / DoomSectorLight.WEAPON_LIGHT_FULL_AT;
        return Math.min(1, floor + (slope * faceLight));
    }

    // Smallest containing sector polygon wins (nested sectors), matching
    // WadWorldBuilder._findSector.
    _sectorAt(doomX, doomY) {
        let bestArea = null;
        let best     = null;
        for (const sec of this._polys) {
            for (const outer of sec.outers) {
                if (!WadGeometry.pointInPolygon2d(doomX, doomY, outer)) {
                    continue;
                }
                const area = Math.abs(WadGeometry.polygonAreaSign(outer));
                if ((bestArea === null) || (area < bestArea)) {
                    bestArea = area;
                    best     = sec;
                }
            }
        }
        return best;
    }
}
