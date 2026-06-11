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
}
