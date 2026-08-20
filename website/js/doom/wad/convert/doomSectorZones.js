/**
 * Sector-zone membership shared by the runtime sector interactions (damage /
 * push / secret): one zone per sector carrying the special, located either
 * through the BSP sectorAt lookup (exact, unclosed sectors included) or, when
 * the level has no usable BSP, through the zones' own chain-polygon outers
 * (with an AABB broadphase). The dual mode lives HERE only — the interactions
 * just ask for the zone(s) at a point.
 */
class DoomSectorZones {
    /**
     * @param {object[]}      zones    - [{si, floorY (world), outers?, ...}] — outers
     *                                   required when sectorAt is null
     * @param {function|null} sectorAt - (doomX, doomY) → si|null (BSP)
     */
    constructor(zones, sectorAt = null) {
        this._zones    = zones;
        this._sectorAt = sectorAt;
        this._bySi     = new Map(zones.map((zone) => [zone.si, zone]));
        if (sectorAt === null) {
            for (const zone of zones) {
                zone.bbox = [Infinity, Infinity, -Infinity, -Infinity];
                for (const outer of zone.outers) {
                    WadGeometry.pointsBbox(outer, zone.bbox);
                }
            }
        }
    }

    get list() {
        return this._zones;
    }

    bySi(si) {
        return (this._bySi.get(si) ?? null);
    }

    /**
     * The zone under an actor's FEET (world coordinates): containing the
     * position AND with the actor standing on its floor — the vanilla
     * mo->z == floorheight gate of the damage and secret sectors. Zones
     * failing the floor gate do not stop the search (nested outers overlap
     * in polygon mode).
     */
    zoneUnderFeet(worldX, worldY, worldZ) {
        const doomX = worldX / WadConstants.SCALE;
        const doomY = worldZ / WadConstants.SCALE;
        const onFloor = (zone) => (Math.abs(worldY - zone.floorY) <= WadConstants.ON_FLOOR_TOLERANCE);
        if (this._sectorAt !== null) {
            const zone = this._bySi.get(this._sectorAt(doomX, doomY));
            return (((zone !== undefined) && onFloor(zone)) ? zone : null);
        }
        for (const zone of this._zones) {
            if (this._containsPoint(zone, doomX, doomY) && onFloor(zone)) {
                return zone;
            }
        }

        return null;
    }

    // Every zone containing the point (world coordinates) — at most one in
    // BSP mode, every containing outer in polygon mode (nested sectors
    // overlap there).
    eachZoneAt(worldX, worldZ, callback) {
        const doomX = worldX / WadConstants.SCALE;
        const doomY = worldZ / WadConstants.SCALE;
        if (this._sectorAt !== null) {
            const zone = this._bySi.get(this._sectorAt(doomX, doomY));
            if (zone !== undefined) {
                callback(zone);
            }
            return;
        }
        for (const zone of this._zones) {
            if (this._containsPoint(zone, doomX, doomY)) {
                callback(zone);
            }
        }
    }

    remove(zone) {
        const idx = this._zones.indexOf(zone);
        if (idx >= 0) {
            this._zones.splice(idx, 1);
        }
        this._bySi.delete(zone.si);
    }

    retain(predicate) {
        for (const zone of [...this._zones]) {
            if (!predicate(zone)) {
                this.remove(zone);
            }
        }
    }

    _containsPoint(zone, doomX, doomY) {
        if ((doomX < zone.bbox[0]) || (doomX > zone.bbox[2])
            || (doomY < zone.bbox[1]) || (doomY > zone.bbox[3])) {
            return false;
        }
        for (const outer of zone.outers) {
            if (WadGeometry.pointInPolygon2d(doomX, doomY, outer)) {
                return true;
            }
        }

        return false;
    }
}
