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
            return [];
        }

        // Adjacency: start vertex → list of end vertices
        const adj = new Map();
        for (const [a, b] of edges) {
            if (!adj.has(a)) {
                adj.set(a, []);
            }
            adj.get(a).push(b);
        }

        // Walk chains greedily, consuming each directed edge at most once
        const used = new Set();
        const chains = [];
        for (const [startA, startB] of edges) {
            if (used.has(startA + ',' + startB)) {
                continue;
            }
            const chain = [startA, startB];
            used.add(startA + ',' + startB);
            let cur = startB;
            while (true) {
                const nexts = (adj.get(cur) ?? []).filter((v) => !used.has(cur + ',' + v));
                if (nexts.length === 0) {
                    break;
                }
                const nxt = nexts[0];
                used.add(cur + ',' + nxt);
                if (nxt === chain[0]) {
                    break;
                }
                chain.push(nxt);
                cur = nxt;
            }
            if (chain.length >= 3) {
                chains.push(chain);
            }
        }

        return chains;
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
     * Return the holes geometrically inside the given outer polygon.
     */
    static assignHoles(outer, holes) {
        return holes.filter((h) => WadGeometry.pointInPolygon2d(h[0][0], h[0][1], outer));
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
        const chains = WadSectorPolygons.buildSectorPolygons(si, linedefs, sidedefs, vertexes);
        if (chains.length === 0) {
            return [];
        }
        const {outers, holes} = WadSectorPolygons.splitOutersAndHoles(chains, vertexes);

        return outers.map((outer) => {
            const own = WadSectorPolygons.assignHoles(outer, holes);
            return {outer: outer, holes: ((own.length > 0) ? own : null)};
        });
    }
}
