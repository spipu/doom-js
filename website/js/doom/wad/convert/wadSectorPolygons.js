/**
 * Sector boundary polygon builder (transposition of build_sector_polygons of
 * convert_wad.py) + factorisation of the outers/holes splitting pattern.
 */
class WadSectorPolygons {
    /**
     * Return ordered vertex-index chains forming the boundary of a sector.
     * Each chain is a list of vertex indices forming a closed loop.
     *
     * @returns {number[][]}
     */
    static buildSectorPolygons(sectorId, linedefs, sidedefs, vertexes) {
        return WadSectorPolygons.buildChains(sectorId, linedefs, sidedefs, vertexes).chains;
    }

    /**
     * Walk the sector's boundary into simple closed loops, plus how many walks
     * ended in a DEAD END instead of closing back on their first vertex. An
     * open walk is not a contour: the sector's linedefs do not describe its
     * shape (doom2 MAP21's sector 50 has 2 linedefs and 4 loose endpoints),
     * and its flats need the BSP carve.
     *
     * Every edge is directed with the sector on its RIGHT, so the walk is the
     * face tracing of a planar graph: where a vertex offers several ways out
     * (two lobes pinched on one vertex, a hole touching its contour), the
     * sharpest right turn is the one that stays along the region the incoming
     * edge bounds. A loop that still comes back through a vertex (a hole
     * reached through its pinch) is cut there into its simple loops.
     *
     * @returns {{chains: number[][], openCount: number}}
     */
    static buildChains(sectorId, linedefs, sidedefs, vertexes) {
        const edges = [];
        for (const ld of linedefs) {
            if (ld.right >= 0 && ld.right < sidedefs.length) {
                if (sidedefs[ld.right].sector === sectorId) {
                    edges.push([ld.v1, ld.v2]);
                }
            }
            if (ld.left >= 0 && ld.left < sidedefs.length) {
                if (sidedefs[ld.left].sector === sectorId) {
                    edges.push([ld.v2, ld.v1]);
                }
            }
        }

        if (edges.length === 0) {
            return {chains: [], openCount: 0};
        }

        // Adjacency: start vertex → list of end vertices
        const adj = new Map();
        for (const [a, b] of edges) {
            if (!adj.has(a)) {
                adj.set(a, []);
            }
            adj.get(a).push(b);
        }

        // Walk chains, consuming each directed edge at most once
        const used = new Set();
        const chains = [];
        let openCount = 0;
        for (const [startA, startB] of edges) {
            if (used.has(startA + ',' + startB)) {
                continue;
            }
            const {chain, closed} = WadSectorPolygons._walkFrom(startA, startB, adj, used, vertexes);
            if (chain.length < 3) {
                continue;
            }
            if (!closed) {
                openCount++;
            }
            for (const loop of WadSectorPolygons._splitAtRepeats(chain)) {
                if (WadSectorPolygons._isLoop(loop, vertexes)) {
                    chains.push(loop);
                }
            }
        }

        return {chains, openCount};
    }

    /**
     * Split chains into outer polygons and hole polygons, based on the winding
     * sign of the dominant chain (largest absolute area).
     *
     * @returns {{outers: number[][][], holes: number[][][]}} polygons as [x, y] Doom coords
     */
    static splitOutersAndHoles(chains, vertexes) {
        if (chains.length === 0) {
            return {outers: [], holes: []};
        }

        const polys = chains.map((c) => c.map((vi) => vertexes[vi]));
        const signs = polys.map((p) => WadGeometry.polygonAreaSign(p));

        let mainSign = signs[0];
        for (const s of signs) {
            if (Math.abs(s) > Math.abs(mainSign)) {
                mainSign = s;
            }
        }

        const outers = [];
        const holes  = [];
        for (let i = 0; i < polys.length; i++) {
            if ((signs[i] > 0) === (mainSign > 0)) {
                outers.push(polys[i]);
            } else {
                holes.push(polys[i]);
            }
        }

        return {outers: outers, holes: holes};
    }

    /**
     * Outer polygons of a sector with their assigned holes — the shared shape
     * every flat builder needs (static map, moving lift/rising-floor tops,
     * door bottoms). Without the holes, a ring sector (donut) would get a
     * solid disc overlapping the inner sector. Polygons as [x, y] Doom coords.
     *
     * @returns {{outer: number[][], holes: number[][][]|null}[]}
     */
    static outersWithHoles(si, linedefs, sidedefs, vertexes) {
        return WadSectorPolygons._outersOf(
            WadSectorPolygons.buildChains(si, linedefs, sidedefs, vertexes).chains, vertexes);
    }

    /**
     * Same outers, but null when the sector's chains do not ALL close: such a
     * boundary is unusable and only the BSP carve can shape the flats. Where
     * they do close (all but 42 sectors over the five Doom-format IWADs) the
     * sector has a SINGLE exact boundary, so two neighbouring flats cannot
     * disagree — which per-subsector carving does.
     *
     * @returns {{outer: number[][], holes: number[][][]|null}[]|null}
     */
    static closedOutersWithHoles(si, linedefs, sidedefs, vertexes) {
        const {chains, openCount} = WadSectorPolygons.buildChains(si, linedefs, sidedefs, vertexes);
        if ((chains.length === 0) || (openCount > 0)) {
            return null;
        }
        return WadSectorPolygons._outersOf(chains, vertexes);
    }

    // Each hole goes to the SMALLEST outer containing it — its immediate
    // parent. An island of the sector inside one of its holes carries its own
    // holes, which the enclosing outer must not subtract a second time.
    static _outersOf(chains, vertexes) {
        if (chains.length === 0) {
            return [];
        }
        const {outers, holes} = WadSectorPolygons.splitOutersAndHoles(chains, vertexes);
        const areas = outers.map((outer) => Math.abs(WadGeometry.polygonAreaSign(outer)));
        const owned = outers.map(() => []);
        for (const hole of holes) {
            let parent = -1;
            for (let i = 0; i < outers.length; i++) {
                if (WadSectorPolygons._holeInside(hole, outers[i]) && ((parent < 0) || (areas[i] < areas[parent]))) {
                    parent = i;
                }
            }
            if (parent >= 0) {
                owned[parent].push(hole);
            }
        }

        return outers.map((outer, i) => ({outer: outer, holes: ((owned[i].length > 0) ? owned[i] : null)}));
    }

    // Point-in-sector over a polygon cache ([{outers, ...}]): the SMALLEST
    // containing outer wins — the cache outers keep the holes inside, so a
    // nested sector is contained by its parent's outer too and only the area
    // tie-break picks it. The shared no-BSP lookup (thing placement, weapon
    // sector light). Returns the cache entry, or null.
    static smallestContaining(sectorPolys, doomX, doomY) {
        let bestArea = null;
        let best     = null;
        for (const sec of sectorPolys) {
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

    // One walk from the directed edge a→b, until it comes back to a (closed)
    // or runs out of unused edges (dead end).
    static _walkFrom(a, b, adj, used, vertexes) {
        const chain = [a, b];
        used.add(a + ',' + b);
        let prev = a;
        let cur  = b;
        while (true) {
            const nxt = WadSectorPolygons._nextVertex(prev, cur, adj, used, vertexes);
            if (nxt === null) {
                return {chain: chain, closed: false};
            }
            used.add(cur + ',' + nxt);
            if (nxt === a) {
                return {chain: chain, closed: true};
            }
            chain.push(nxt);
            prev = cur;
            cur  = nxt;
        }
    }

    // A contour needs three vertices and some area: a slit walked there and
    // back (a linedef with the sector on both sides) is neither.
    static _isLoop(loop, vertexes) {
        return ((loop.length >= 3) && (WadGeometry.polygonAreaSign(loop.map((vi) => vertexes[vi])) !== 0));
    }

    // Next vertex of the walk out of cur, arrived at from prev: the unused
    // edge making the sharpest right turn, a straight-back U-turn last. With
    // a single way out the choice is forced.
    static _nextVertex(prev, cur, adj, used, vertexes) {
        const nexts = (adj.get(cur) ?? []).filter((v) => !used.has(cur + ',' + v));
        if (nexts.length === 0) {
            return null;
        }
        if (nexts.length === 1) {
            return nexts[0];
        }
        const inX = vertexes[cur][0] - vertexes[prev][0];
        const inY = vertexes[cur][1] - vertexes[prev][1];
        let best     = null;
        let bestTurn = Infinity;
        for (const v of nexts) {
            const outX  = vertexes[v][0] - vertexes[cur][0];
            const outY  = vertexes[v][1] - vertexes[cur][1];
            const cross = (inX * outY) - (inY * outX);
            const dot   = (inX * outX) + (inY * outY);
            // Collinear edges decided without atan2: a negative zero would
            // turn a straight-back U-turn into -π, the sharpest right turn.
            const turn = ((cross === 0) ? ((dot > 0) ? 0 : Math.PI) : Math.atan2(cross, dot));
            if (turn < bestTurn) {
                bestTurn = turn;
                best     = v;
            }
        }

        return best;
    }

    // Cut a closed walk at every vertex it passes twice: the sub-walk between
    // the two visits is a loop of its own, the rest continues without it.
    static _splitAtRepeats(chain) {
        const seen = new Map();
        for (let i = 0; i < chain.length; i++) {
            const first = seen.get(chain[i]);
            if (first !== undefined) {
                const lobe = chain.slice(first, i);
                const rest = chain.slice(0, first).concat(chain.slice(i));

                return [...WadSectorPolygons._splitAtRepeats(lobe), ...WadSectorPolygons._splitAtRepeats(rest)];
            }
            seen.set(chain[i], i);
        }

        return [chain];
    }

    // A hole lies inside an outer when a point strictly inside the hole is
    // inside the outer — its first vertex may sit ON the outer's boundary (a
    // hole touching its contour), where a point-in-polygon test answers either
    // way — and the outer is the larger of the two: boundary loops never
    // cross, so the same point test also holds for an island INSIDE the hole.
    static _holeInside(hole, outer) {
        if (Math.abs(WadGeometry.polygonAreaSign(hole)) >= Math.abs(WadGeometry.polygonAreaSign(outer))) {
            return false;
        }
        const [px, py] = WadSectorPolygons._interiorPoint(hole);

        return WadGeometry.pointInPolygon2d(px, py, outer);
    }

    // Centroid of an ear of the polygon: a triangle of three consecutive
    // vertices that turns the polygon's way and holds no other vertex.
    static _interiorPoint(poly) {
        const n    = poly.length;
        const sign = WadGeometry.polygonAreaSign(poly);
        for (let i = 0; i < n; i++) {
            const a = poly[(i + n - 1) % n];
            const b = poly[i];
            const c = poly[(i + 1) % n];
            const cross = WadGeometry.cross2d(a, b, c);
            if ((cross === 0) || ((cross > 0) === (sign > 0))) {
                continue;
            }
            if (WadSectorPolygons._earIsEmpty(poly, a, b, c)) {
                return [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3];
            }
        }

        return poly[0];
    }

    static _earIsEmpty(poly, a, b, c) {
        for (const p of poly) {
            if ((p === a) || (p === b) || (p === c)) {
                continue;
            }
            if (WadGeometry.pointInTriangle(p, a, b, c)) {
                return false;
            }
        }

        return true;
    }
}
