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
    static buildSectorChains(sectorId, linedefs, sidedefs, vertexes) {
        return WadSectorPolygons.buildChains(sectorId, linedefs, sidedefs, vertexes).chains;
    }

    /**
     * Walk the sector's boundary into simple closed loops, counting the walks
     * that hit a dead end: such a sector needs the BSP carve (doom2 MAP21's
     * sector 50).
     *
     * Edges are directed with the sector on their right, so at a vertex with
     * several exits the sharpest right turn follows the incoming edge's region.
     * A loop passing a vertex twice is cut into its simple loops.
     *
     * @returns {{chains: number[][], openCount: number}}
     */
    static buildChains(sectorId, linedefs, sidedefs, vertexes) {
        const edges = [];
        for (const ld of linedefs) {
            if ((ld.right >= 0) && (ld.right < sidedefs.length)) {
                if (sidedefs[ld.right].sector === sectorId) {
                    edges.push([ld.v1, ld.v2]);
                }
            }
            if ((ld.left >= 0) && (ld.left < sidedefs.length)) {
                if (sidedefs[ld.left].sector === sectorId) {
                    edges.push([ld.v2, ld.v1]);
                }
            }
        }

        if (edges.length === 0) {
            return {chains: [], openCount: 0};
        }

        const outEdges = new Map();
        for (const [a, b] of edges) {
            if (!outEdges.has(a)) {
                outEdges.set(a, []);
            }
            outEdges.get(a).push(b);
        }

        const used = new Set();
        const chains = [];
        let openCount = 0;
        for (const [startA, startB] of edges) {
            if (used.has(startA + ',' + startB)) {
                continue;
            }
            const {chain, closed} = WadSectorPolygons._walkFrom(startA, startB, outEdges, used, vertexes);
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
     * Outer polygons of a sector with their holes, as [x, y] Doom coords.
     *
     * @returns {{outer: number[][], holes: number[][][]|null}[]}
     */
    static outersWithHoles(si, linedefs, sidedefs, vertexes) {
        return WadSectorPolygons._outersOf(
            WadSectorPolygons.buildChains(si, linedefs, sidedefs, vertexes).chains, vertexes);
    }

    /**
     * Same outers, but null unless every chain closes: only the BSP carve can
     * then shape the flats.
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

    // Cache entry ([{outers, ...}]) of the smallest outer containing the point:
    // outers keep their holes inside, so a parent contains its nested sectors.
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
    static _walkFrom(a, b, outEdges, used, vertexes) {
        const chain = [a, b];
        used.add(a + ',' + b);
        let prev = a;
        let cur  = b;
        while (true) {
            const next = WadSectorPolygons._nextVertex(prev, cur, outEdges, used, vertexes);
            if (next === null) {
                return {chain: chain, closed: false};
            }
            used.add(cur + ',' + next);
            if (next === a) {
                return {chain: chain, closed: true};
            }
            chain.push(next);
            prev = cur;
            cur  = next;
        }
    }

    // A contour needs three vertices and some area: a slit walked there and
    // back (a linedef with the sector on both sides) is neither.
    static _isLoop(loop, vertexes) {
        return ((loop.length >= 3) && (WadGeometry.polygonAreaSign(loop.map((vi) => vertexes[vi])) !== 0));
    }

    // Unused exit of cur making the sharpest right turn, a U-turn last.
    static _nextVertex(prev, cur, outEdges, used, vertexes) {
        const exits = (outEdges.get(cur) ?? []).filter((v) => !used.has(cur + ',' + v));
        if (exits.length === 0) {
            return null;
        }
        if (exits.length === 1) {
            return exits[0];
        }
        const inX    = vertexes[cur][0] - vertexes[prev][0];
        const inY    = vertexes[cur][1] - vertexes[prev][1];
        let best     = null;
        let bestTurn = Infinity;
        for (const v of exits) {
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

    // Tested on a point strictly inside the hole: its vertices may sit on the
    // outer's boundary. The area check rules out an island inside the hole.
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
