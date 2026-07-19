/**
 * 2D/3D geometry helpers of the WAD converter (transposition of convert_wad.py).
 * All static methods. 2D points are [x, y] arrays in Doom units or world units.
 */
class WadGeometry {
    /**
     * Convert Doom map coordinates to world (x, z) or (x, y, z).
     * Doom x → world x, Doom y → world z (same sign — not negated).
     */
    static doomToWorld(dx, dy, dzHeight = null) {
        const x = dx * WadConstants.SCALE;
        const z = dy * WadConstants.SCALE;
        if (dzHeight !== null) {
            return [x, dzHeight * WadConstants.SCALE, z];
        }

        return [x, z];
    }

    /**
     * 2D length of a wall segment in Doom units.
     */
    static wallLengthDoom(vertexes, v1, v2) {
        const dx = vertexes[v2][0] - vertexes[v1][0];
        const dy = vertexes[v2][1] - vertexes[v1][1];

        return Math.sqrt(dx * dx + dy * dy);
    }

    static cross2d(o, a, b) {
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    }

    /**
     * Shortest distance from point (px, py) to the segment (ax, ay)-(bx, by).
     */
    static distanceToSegment(px, py, ax, ay, bx, by) {
        const dx = bx - ax;
        const dy = by - ay;
        const len2 = dx * dx + dy * dy;
        let t = ((len2 > 0) ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0);
        t = Math.max(0, Math.min(1, t));
        const cx = ax + t * dx;
        const cy = ay + t * dy;
        return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
    }

    static pointInTriangle(p, a, b, c) {
        const d1 = WadGeometry.cross2d(p, a, b);
        const d2 = WadGeometry.cross2d(p, b, c);
        const d3 = WadGeometry.cross2d(p, c, a);
        const hasNeg = ((d1 < 0) || (d2 < 0) || (d3 < 0));
        const hasPos = ((d1 > 0) || (d2 > 0) || (d3 > 0));

        return !(hasNeg && hasPos);
    }

    /**
     * Ray-casting point-in-polygon test in 2D.
     */
    static pointInPolygon2d(px, pz, poly) {
        let inside = false;
        const n = poly.length;
        for (let i = 0; i < n; i++) {
            const [ax, az] = poly[i];
            const [bx, bz] = poly[(i + 1) % n];
            if (((az > pz) !== (bz > pz)) && (px < (bx - ax) * (pz - az) / (bz - az) + ax)) {
                inside = !inside;
            }
        }

        return inside;
    }

    /**
     * Shoelace sign: positive → CW winding, negative → CCW winding.
     */
    static polygonAreaSign(poly) {
        let s = 0;
        const n = poly.length;
        for (let i = 0; i < n; i++) {
            const [x0, z0] = poly[i];
            const [x1, z1] = poly[(i + 1) % n];
            s += (x1 - x0) * (z1 + z0);
        }

        return s;
    }

    /**
     * Squared 2D distance from a point to a segment (same coordinate space
     * for both).
     */
    static pointSegmentDistSq(px, pz, x1, z1, x2, z2) {
        const dx    = x2 - x1;
        const dz    = z2 - z1;
        const lenSq = (dx * dx) + (dz * dz);
        let t = ((lenSq > 0) ? ((((px - x1) * dx) + ((pz - z1) * dz)) / lenSq) : 0);
        t = Math.max(0, Math.min(1, t));
        const cx = x1 + (t * dx);
        const cz = z1 + (t * dz);

        return ((px - cx) * (px - cx)) + ((pz - cz) * (pz - cz));
    }
}
