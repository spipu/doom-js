// Player sector-light lookup, used to shade the weapon view sprite like the
// walls around it (gzdoom lights the weapon by the sector the player stands in).
// Built from the world builder's sector polygon cache (Doom light 0..255) which
// would otherwise be dropped after the level loads; queried once per frame.
// World faces shade linearly as light/255 (see the WebGL fragment shader), so
// the weapon uses the same factor to match. Fullbright frames skip this. When
// the player's sector runs a light effect (flicker/strobe/glow), the same live
// factor its walls use is applied, so the weapon pulses with the room.
class DoomSectorLight {
    constructor(sectorPolys, lightInteraction = null) {
        this._polys  = sectorPolys;
        this._lights = lightInteraction;
    }

    // Light factor (0..1) at a world position; 1 (fullbright) when the point
    // falls outside every sector polygon, so the weapon is never left black.
    factorAt(worldX, worldZ) {
        const sec = this._sectorAt(worldX / WadConstants.SCALE, worldZ / WadConstants.SCALE);
        if (sec === null) {
            return 1;
        }
        const dynamic = ((this._lights !== null) ? this._lights.getFactor(sec.si) : 1);
        return (sec.light / 255) * dynamic;
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
