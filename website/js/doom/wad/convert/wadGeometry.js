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
     * Camera-facing billboard quad of a decoded sprite, in world units — the
     * R_ProjectSprite convention shared by world things, projectiles and
     * weapon effects: leftOffset centres the sprite horizontally on its
     * anchor. The vertical anchoring differs per consumer (floor-clip,
     * flight centre, vanilla offset box) and stays on the caller.
     *
     * @param {object} spr decoded sprite {width, height, leftOffset, …}
     * @returns {{halfWidth: number, height: number, anchorOffsetX: number}}
     */
    static spriteBillboardData(spr) {
        const scale = WadConstants.SCALE;
        return {
            halfWidth:     (spr.width * scale) / 2,
            height:        spr.height * scale,
            anchorOffsetX: ((spr.width / 2) - spr.leftOffset) * scale
        };
    }

    /**
     * Impact point pulled back off its surface along the shot direction, so
     * the effect never clips into the wall or the body — vanilla backs off
     * 4 map units on walls and 10 on flesh (PTR_ShootTraverse bleedpos).
     *
     * @param {number[]} point [x, y, z] impact
     * @param {number[]} dir   [dx, dy, dz] normalized shot direction
     * @param {number}   units map units to back off
     * @returns {number[]} pulled-back [x, y, z]
     */
    static pullBack(point, dir, units = 4) {
        const back = units * WadConstants.SCALE;
        return [point[0] - dir[0] * back, point[1] - dir[1] * back, point[2] - dir[2] * back];
    }

    /**
     * 2D length of a wall segment in Doom units.
     */
    static wallLengthDoom(vertexes, v1, v2) {
        const dx = vertexes[v2][0] - vertexes[v1][0];
        const dy = vertexes[v2][1] - vertexes[v1][1];

        return Math.sqrt(dx * dx + dy * dy);
    }

    // Doom-style square blocker overlap (PIT_CheckThing: axis distances under
    // the summed radii, no sqrt). Same-unit inputs (world or Doom).
    static boxesOverlap2d(x1, z1, r1, x2, z2, r2) {
        return ((Math.abs(x1 - x2) < r1 + r2) && (Math.abs(z1 - z2) < r1 + r2));
    }

    // Doom angle ↔ engine yaw conversion — the mapping is involutive
    // (a = 90 − y mod 360 both ways).
    static doomAngleYaw(value) {
        return (((90 - value) % 360) + 360) % 360;
    }

    // Proper 2D segment intersection (walk-line crossings).
    static segmentsCross(ax, ay, bx, by, cx, cy, dx, dy) {
        const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
        const d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
        const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
        const d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
        return (((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0)));
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
