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

    /**
     * Robust triangulation with native hole support — port of the earcut
     * algorithm (Mapbox), without the z-order hashing (sector polygons stay
     * small). Used by addFlatQuad as a fallback ONLY when the legacy
     * ear-clipping above leaves a sector flat incomplete (complex donuts with
     * many holes, self-tangent rings). Handles collinear vertices and recovers
     * from local self-intersections (cure + split passes).
     *
     * @param {number[][]}        outerXz - [[x, z], ...] (world coords)
     * @param {number[][][]|null} holesXz - [[[x, z], ...], ...] or null
     * @returns {{vertices: number[][], tris: number[][]}}
     *          vertices = outer then each hole flattened in order (NOT
     *          reordered); tris = index triples into vertices.
     */
    static triangulateWithHoles(outerXz, holesXz) {
        const vertices = [...outerXz];
        const holeIndices = [];
        if (holesXz !== null && holesXz !== undefined && holesXz.length > 0) {
            for (const hole of holesXz) {
                holeIndices.push(vertices.length);
                for (const v of hole) {
                    vertices.push(v);
                }
            }
        }

        const tris = [];
        const hasHoles = (holeIndices.length > 0);
        const outerLen = ((hasHoles) ? holeIndices[0] : vertices.length);

        let outerNode = WadTriangulator._ecLinkedList(vertices, 0, outerLen, true);
        if (outerNode === null || outerNode.next === outerNode.prev) {
            return {vertices: vertices, tris: tris};
        }
        if (hasHoles) {
            outerNode = WadTriangulator._ecEliminateHoles(vertices, holeIndices, outerNode);
        }
        outerNode = WadTriangulator._ecFilterPoints(outerNode, null);

        WadTriangulator._ecEarcutLinked(outerNode, tris, 0);

        return {vertices: vertices, tris: tris};
    }

    // --- Internal ---

    static _samePoint(a, b) {
        return (a[0] === b[0] && a[1] === b[1]);
    }

    // --- Internal: earcut port (Mapbox), no z-order hashing ---

    static _ecNode(i, x, y) {
        return {i: i, x: x, y: y, prev: null, next: null, steiner: false};
    }

    static _ecSignedArea(vertices, start, end) {
        let sum = 0;
        let j = end - 1;
        for (let i = start; i < end; i++) {
            sum += (vertices[j][0] - vertices[i][0]) * (vertices[i][1] + vertices[j][1]);
            j = i;
        }

        return sum;
    }

    static _ecArea(p, q, r) {
        return (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
    }

    static _ecEquals(p1, p2) {
        return (p1.x === p2.x && p1.y === p2.y);
    }

    static _ecInsertNode(i, x, y, last) {
        const p = WadTriangulator._ecNode(i, x, y);
        if (last === null) {
            p.prev = p;
            p.next = p;
        } else {
            p.next = last.next;
            p.prev = last;
            last.next.prev = p;
            last.next = p;
        }

        return p;
    }

    static _ecRemoveNode(p) {
        p.next.prev = p.prev;
        p.prev.next = p.next;
    }

    static _ecLinkedList(vertices, start, end, clockwise) {
        let last = null;
        const area = WadTriangulator._ecSignedArea(vertices, start, end);
        if (clockwise === (area > 0)) {
            for (let i = start; i < end; i++) {
                last = WadTriangulator._ecInsertNode(i, vertices[i][0], vertices[i][1], last);
            }
        } else {
            for (let i = end - 1; i >= start; i--) {
                last = WadTriangulator._ecInsertNode(i, vertices[i][0], vertices[i][1], last);
            }
        }
        if (last !== null && WadTriangulator._ecEquals(last, last.next)) {
            WadTriangulator._ecRemoveNode(last);
            last = last.next;
        }

        return last;
    }

    static _ecFilterPoints(start, end) {
        if (start === null) {
            return start;
        }
        if (end === null) {
            end = start;
        }
        let p = start;
        let again;
        do {
            again = false;
            if (!p.steiner && (WadTriangulator._ecEquals(p, p.next) || WadTriangulator._ecArea(p.prev, p, p.next) === 0)) {
                WadTriangulator._ecRemoveNode(p);
                p = p.prev;
                end = p.prev;
                if (p === p.next) {
                    break;
                }
                again = true;
            } else {
                p = p.next;
            }
        } while (again || p !== end);

        return end;
    }

    static _ecEarcutLinked(ear, tris, pass) {
        if (ear === null) {
            return;
        }
        let stop = ear;
        let prev;
        let next;
        while (ear.prev !== ear.next) {
            prev = ear.prev;
            next = ear.next;
            if (WadTriangulator._ecIsEar(ear)) {
                tris.push([prev.i, ear.i, next.i]);
                WadTriangulator._ecRemoveNode(ear);
                ear = next.next;
                stop = next.next;
                continue;
            }
            ear = next;
            if (ear === stop) {
                if (pass === 0) {
                    WadTriangulator._ecEarcutLinked(WadTriangulator._ecFilterPoints(ear, null), tris, 1);
                } else if (pass === 1) {
                    ear = WadTriangulator._ecCureLocalIntersections(WadTriangulator._ecFilterPoints(ear, null), tris);
                    WadTriangulator._ecEarcutLinked(ear, tris, 2);
                } else if (pass === 2) {
                    WadTriangulator._ecSplitEarcut(ear, tris);
                }
                break;
            }
        }
    }

    static _ecIsEar(ear) {
        const a = ear.prev;
        const b = ear;
        const c = ear.next;
        if (WadTriangulator._ecArea(a, b, c) >= 0) {
            return false;
        }
        const ax = a.x, bx = b.x, cx = c.x, ay = a.y, by = b.y, cy = c.y;
        const x0 = ((ax < bx) ? ((ax < cx) ? ax : cx) : ((bx < cx) ? bx : cx));
        const y0 = ((ay < by) ? ((ay < cy) ? ay : cy) : ((by < cy) ? by : cy));
        const x1 = ((ax > bx) ? ((ax > cx) ? ax : cx) : ((bx > cx) ? bx : cx));
        const y1 = ((ay > by) ? ((ay > cy) ? ay : cy) : ((by > cy) ? by : cy));
        let p = c.next;
        while (p !== a) {
            if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1
                && WadTriangulator._ecPointInTriangle(ax, ay, bx, by, cx, cy, p.x, p.y)
                && WadTriangulator._ecArea(p.prev, p, p.next) >= 0) {
                return false;
            }
            p = p.next;
        }

        return true;
    }

    static _ecPointInTriangle(ax, ay, bx, by, cx, cy, px, py) {
        return (cx - px) * (ay - py) - (ax - px) * (cy - py) >= 0
            && (ax - px) * (by - py) - (bx - px) * (ay - py) >= 0
            && (bx - px) * (cy - py) - (cx - px) * (by - py) >= 0;
    }

    static _ecCureLocalIntersections(start, tris) {
        let p = start;
        do {
            const a = p.prev;
            const b = p.next.next;
            if (!WadTriangulator._ecEquals(a, b) && WadTriangulator._ecIntersects(a, p, p.next, b)
                && WadTriangulator._ecLocallyInside(a, b) && WadTriangulator._ecLocallyInside(b, a)) {
                tris.push([a.i, p.i, b.i]);
                WadTriangulator._ecRemoveNode(p);
                WadTriangulator._ecRemoveNode(p.next);
                p = b;
                start = b;
            }
            p = p.next;
        } while (p !== start);

        return WadTriangulator._ecFilterPoints(p, null);
    }

    static _ecSplitEarcut(start, tris) {
        let a = start;
        do {
            let b = a.next.next;
            while (b !== a.prev) {
                if (a.i !== b.i && WadTriangulator._ecIsValidDiagonal(a, b)) {
                    let c = WadTriangulator._ecSplitPolygon(a, b);
                    a = WadTriangulator._ecFilterPoints(a, a.next);
                    c = WadTriangulator._ecFilterPoints(c, c.next);
                    WadTriangulator._ecEarcutLinked(a, tris, 0);
                    WadTriangulator._ecEarcutLinked(c, tris, 0);
                    return;
                }
                b = b.next;
            }
            a = a.next;
        } while (a !== start);
    }

    static _ecIsValidDiagonal(a, b) {
        return a.next.i !== b.i && a.prev.i !== b.i && !WadTriangulator._ecIntersectsPolygon(a, b)
            && ((WadTriangulator._ecLocallyInside(a, b) && WadTriangulator._ecLocallyInside(b, a) && WadTriangulator._ecMiddleInside(a, b)
                && (WadTriangulator._ecArea(a.prev, a, b.prev) !== 0 || WadTriangulator._ecArea(a, b.prev, b) !== 0))
                || (WadTriangulator._ecEquals(a, b) && WadTriangulator._ecArea(a.prev, a, a.next) > 0 && WadTriangulator._ecArea(b.prev, b, b.next) > 0));
    }

    static _ecIntersects(p1, q1, p2, q2) {
        const o1 = WadTriangulator._ecSign(WadTriangulator._ecArea(p1, q1, p2));
        const o2 = WadTriangulator._ecSign(WadTriangulator._ecArea(p1, q1, q2));
        const o3 = WadTriangulator._ecSign(WadTriangulator._ecArea(p2, q2, p1));
        const o4 = WadTriangulator._ecSign(WadTriangulator._ecArea(p2, q2, q1));
        if (o1 !== o2 && o3 !== o4) {
            return true;
        }
        if (o1 === 0 && WadTriangulator._ecOnSegment(p1, p2, q1)) {
            return true;
        }
        if (o2 === 0 && WadTriangulator._ecOnSegment(p1, q2, q1)) {
            return true;
        }
        if (o3 === 0 && WadTriangulator._ecOnSegment(p2, p1, q2)) {
            return true;
        }
        if (o4 === 0 && WadTriangulator._ecOnSegment(p2, q1, q2)) {
            return true;
        }

        return false;
    }

    static _ecSign(num) {
        if (num > 0) {
            return 1;
        }
        if (num < 0) {
            return -1;
        }

        return 0;
    }

    static _ecOnSegment(p, q, r) {
        return q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x)
            && q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y);
    }

    static _ecIntersectsPolygon(a, b) {
        let p = a;
        do {
            if (p.i !== a.i && p.next.i !== a.i && p.i !== b.i && p.next.i !== b.i
                && WadTriangulator._ecIntersects(p, p.next, a, b)) {
                return true;
            }
            p = p.next;
        } while (p !== a);

        return false;
    }

    static _ecLocallyInside(a, b) {
        if (WadTriangulator._ecArea(a.prev, a, a.next) < 0) {
            return WadTriangulator._ecArea(a, b, a.next) >= 0 && WadTriangulator._ecArea(a, a.prev, b) >= 0;
        }

        return WadTriangulator._ecArea(a, b, a.prev) < 0 || WadTriangulator._ecArea(a, a.next, b) < 0;
    }

    static _ecMiddleInside(a, b) {
        let p = a;
        let inside = false;
        const px = (a.x + b.x) / 2;
        const py = (a.y + b.y) / 2;
        do {
            if (((p.y > py) !== (p.next.y > py)) && p.next.y !== p.y
                && (px < (p.next.x - p.x) * (py - p.y) / (p.next.y - p.y) + p.x)) {
                inside = !inside;
            }
            p = p.next;
        } while (p !== a);

        return inside;
    }

    static _ecSplitPolygon(a, b) {
        const a2 = WadTriangulator._ecNode(a.i, a.x, a.y);
        const b2 = WadTriangulator._ecNode(b.i, b.x, b.y);
        const an = a.next;
        const bp = b.prev;
        a.next = b;
        b.prev = a;
        a2.next = an;
        an.prev = a2;
        b2.next = a2;
        a2.prev = b2;
        bp.next = b2;
        b2.prev = bp;

        return b2;
    }

    static _ecEliminateHoles(vertices, holeIndices, outerNode) {
        const queue = [];
        const len = holeIndices.length;
        for (let i = 0; i < len; i++) {
            const start = holeIndices[i];
            const end = ((i < len - 1) ? holeIndices[i + 1] : vertices.length);
            const list = WadTriangulator._ecLinkedList(vertices, start, end, false);
            if (list === list.next) {
                list.steiner = true;
            }
            queue.push(WadTriangulator._ecGetLeftmost(list));
        }
        queue.sort((p1, p2) => p1.x - p2.x);
        let node = outerNode;
        for (let i = 0; i < queue.length; i++) {
            node = WadTriangulator._ecEliminateHole(queue[i], node);
        }

        return node;
    }

    static _ecEliminateHole(hole, outerNode) {
        const bridge = WadTriangulator._ecFindHoleBridge(hole, outerNode);
        if (bridge === null) {
            return outerNode;
        }
        const bridgeReverse = WadTriangulator._ecSplitPolygon(bridge, hole);
        WadTriangulator._ecFilterPoints(bridgeReverse, bridgeReverse.next);

        return WadTriangulator._ecFilterPoints(bridge, bridge.next);
    }

    static _ecGetLeftmost(start) {
        let p = start;
        let leftmost = start;
        do {
            if (p.x < leftmost.x || (p.x === leftmost.x && p.y < leftmost.y)) {
                leftmost = p;
            }
            p = p.next;
        } while (p !== start);

        return leftmost;
    }

    static _ecFindHoleBridge(hole, outerNode) {
        let p = outerNode;
        const hx = hole.x;
        const hy = hole.y;
        let qx = -Infinity;
        let m = null;
        do {
            if (hy <= p.y && hy >= p.next.y && p.next.y !== p.y) {
                const x = p.x + (hy - p.y) * (p.next.x - p.x) / (p.next.y - p.y);
                if (x <= hx && x > qx) {
                    qx = x;
                    if (x === hx) {
                        if (hy === p.y) {
                            return p;
                        }
                        if (hy === p.next.y) {
                            return p.next;
                        }
                    }
                    m = ((p.x < p.next.x) ? p : p.next);
                }
            }
            p = p.next;
        } while (p !== outerNode);
        if (m === null) {
            return null;
        }
        if (hx === qx) {
            return m.prev;
        }
        const stop = m;
        const mx = m.x;
        const my = m.y;
        let tanMin = Infinity;
        let tan;
        p = m.next;
        while (p !== stop) {
            if (hx >= p.x && p.x >= mx && hx !== p.x
                && WadTriangulator._ecPointInTriangle(((hy < my) ? hx : qx), hy, mx, my, ((hy < my) ? qx : hx), hy, p.x, p.y)) {
                tan = Math.abs(hy - p.y) / (hx - p.x);
                if ((tan < tanMin || (tan === tanMin && p.x > m.x)) && WadTriangulator._ecLocallyInside(p, hole)) {
                    m = p;
                    tanMin = tan;
                }
            }
            p = p.next;
        }

        return m;
    }
}
