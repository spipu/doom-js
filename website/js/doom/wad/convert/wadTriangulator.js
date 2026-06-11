/**
 * Polygon triangulation: ear-clipping + hole merging via bridge cuts
 * (transposition of convert_wad.py — earcut/Eberly algorithm).
 */
class WadTriangulator {
    /**
     * Return true if vertex i is a convex ear of polygon poly (CCW winding).
     * Coordinate-duplicate vertices (bridge seam copies) are skipped in the
     * interior test so the duplicated seam doesn't block valid ears.
     */
    static isEar(poly, i) {
        const count = poly.length;
        const a = poly[(i - 1 + count) % count];
        const b = poly[i];
        const c = poly[(i + 1) % count];

        if (WadGeometry.cross2d(a, b, c) <= 0) {
            return false;
        }

        for (let j = 0; j < count; j++) {
            if (j === (i - 1 + count) % count || j === i || j === (i + 1) % count) {
                continue;
            }
            const p = poly[j];
            if (WadTriangulator._samePoint(p, a) || WadTriangulator._samePoint(p, b) || WadTriangulator._samePoint(p, c)) {
                continue;
            }
            if (WadGeometry.pointInTriangle(p, a, b, c)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Ear-clipping triangulation. polygon = [[x,z], ...] must be CCW.
     * Returns a list of [i, j, k] index triples into the original polygon array.
     * Stops early on degenerate polygons.
     */
    static triangulate(polygon) {
        const poly = [...polygon];
        const tris = [];
        const indices = poly.map((p, i) => i);

        while (indices.length > 3) {
            let progress = false;
            for (let k = 0; k < indices.length; k++) {
                const sub = indices.map((idx) => poly[idx]);
                if (WadTriangulator.isEar(sub, k)) {
                    tris.push([
                        indices[(k - 1 + indices.length) % indices.length],
                        indices[k],
                        indices[(k + 1) % indices.length]
                    ]);
                    indices.splice(k, 1);
                    progress = true;
                    break;
                }
            }
            if (!progress) {
                break;
            }
        }

        if (indices.length === 3) {
            tris.push([indices[0], indices[1], indices[2]]);
        }

        return tris;
    }

    /**
     * Merge hole polygons into the outer polygon via bridge cuts.
     * Both bridge vertices are duplicated (earcut splitPolygon convention).
     */
    static mergeHolesIntoPolygon(outer, holes) {
        let result = [...outer];

        const sortedHoles = [...holes].sort((h1, h2) => {
            const x1 = Math.min(...h1.map((v) => v[0]));
            const x2 = Math.min(...h2.map((v) => v[0]));

            return x1 - x2;
        });

        for (const hole of sortedHoles) {
            // M = leftmost vertex of the hole (lexicographic min by x then y)
            let m = 0;
            for (let i = 1; i < hole.length; i++) {
                if (hole[i][0] < hole[m][0] || (hole[i][0] === hole[m][0] && hole[i][1] < hole[m][1])) {
                    m = i;
                }
            }
            const mx = hole[m][0];
            const mz = hole[m][1];

            // Cast ray leftward from M; find nearest intersecting outer edge
            let bestX  = -Infinity;
            let bestVi = -1;
            const n = result.length;
            for (let i = 0; i < n; i++) {
                const [ax, az] = result[i];
                const [bx, bz] = result[(i + 1) % n];
                if (Math.abs(bz - az) < 1e-9) {
                    continue;
                }
                const s = (mz - az) / (bz - az);
                if (s < 0.0 || s > 1.0) {
                    continue;
                }
                const ix = ax + s * (bx - ax);
                if (ix > mx) {
                    continue;
                }
                if (ix > bestX) {
                    bestX  = ix;
                    bestVi = ((Math.abs(ax - ix) < Math.abs(bx - ix)) ? i : (i + 1) % n);
                }
            }

            if (bestVi < 0) {
                continue;
            }

            // Refinement (Eberly): outer vertex inside triangle (M, I, P) minimising the angle from M
            let px = result[bestVi][0];
            let pz = result[bestVi][1];
            let bestAngle = Math.atan2(pz - mz, px - mx);
            for (let i = 0; i < n; i++) {
                const [vx, vz] = result[i];
                if (vx >= mx || vx < bestX) {
                    continue;
                }
                if (!WadGeometry.pointInPolygon2d(vx, vz, result)) {
                    continue;
                }
                const angle = Math.atan2(vz - mz, vx - mx);
                if (Math.abs(angle - bestAngle) < 1e-9) {
                    if (vx > px) {
                        bestVi = i;
                        px = vx;
                        pz = vz;
                        bestAngle = angle;
                    }
                }
            }

            // Merge with both bridge endpoints duplicated
            const holeVerts = hole.map((v, j) => hole[(m + j) % hole.length]);
            result = [
                ...result.slice(0, bestVi + 1),
                ...holeVerts,
                hole[m],
                result[bestVi],
                ...result.slice(bestVi + 1)
            ];
        }

        return result;
    }

    // --- Internal ---

    static _samePoint(a, b) {
        return (a[0] === b[0] && a[1] === b[1]);
    }
}
