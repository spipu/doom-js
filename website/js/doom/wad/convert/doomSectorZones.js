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
        this._bySi     = ((sectorAt !== null) ? new Map(zones.map((zone) => [zone.si, zone])) : null);
        if (sectorAt === null) {
            for (const zone of zones) {
                zone.bbox = DoomSectorZones._bboxOf(zone.outers);
            }
        }
    }

    get list() {
        return this._zones;
    }

    bySi(si) {
        if (this._bySi !== null) {
            return (this._bySi.get(si) ?? null);
        }
        for (const zone of this._zones) {
            if (zone.si === si) {
                return zone;
            }
        }

        return null;
    }

    /**
     * First zone containing the point and passing match (BSP mode: the point's
     * own sector zone or none). Zones failing match do not stop the search.
     */
    zoneAt(doomX, doomY, match = null) {
        let found = null;
        this.eachZoneAt(doomX, doomY, (zone) => {
            if ((found === null) && ((match === null) || match(zone))) {
                found = zone;
            }
        });

        return found;
    }

    // Every zone containing the point — at most one in BSP mode, every
    // containing outer in polygon mode (nested sectors overlap there).
    eachZoneAt(doomX, doomY, callback) {
        if (this._sectorAt !== null) {
            const zone = this._bySi.get(this._sectorAt(doomX, doomY));
            if (zone !== undefined) {
                callback(zone);
            }
            return;
        }
        for (const zone of this._zones) {
            if ((doomX < zone.bbox[0]) || (doomX > zone.bbox[2])
                || (doomY < zone.bbox[1]) || (doomY > zone.bbox[3])) {
                continue;
            }
            if (this._inOuters(zone, doomX, doomY)) {
                callback(zone);
            }
        }
    }

    remove(zone) {
        const idx = this._zones.indexOf(zone);
        if (idx >= 0) {
            this._zones.splice(idx, 1);
        }
        if (this._bySi !== null) {
            this._bySi.delete(zone.si);
        }
    }

    retain(predicate) {
        for (const zone of [...this._zones]) {
            if (!predicate(zone)) {
                this.remove(zone);
            }
        }
    }

    _inOuters(zone, doomX, doomY) {
        for (const outer of zone.outers) {
            if (WadGeometry.pointInPolygon2d(doomX, doomY, outer)) {
                return true;
            }
        }

        return false;
    }

    static _bboxOf(outers) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const outer of outers) {
            for (const [x, y] of outer) {
                minX = Math.min(minX, x); maxX = Math.max(maxX, x);
                minY = Math.min(minY, y); maxY = Math.max(maxY, y);
            }
        }

        return [minX, minY, maxX, maxY];
    }
}
