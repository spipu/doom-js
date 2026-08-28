/**
 * BSP tree of a level (SEGS/SSECTORS/NODES lumps): the vanilla renderer's own
 * spatial structure, reused here for what polygons cannot give us —
 * per-subsector convex flats (a sector's floor/ceiling = the fan union of its
 * subsectors, GZDoom hw_vertexbuilder style) that stay correct on UNCLOSED
 * sectors (doom2 MAP21's sector 50 has 2 linedefs and 4 open endpoints), and
 * the O(log n) R_PointInSubsector sector lookup.
 *
 * Vanilla nodes carry no miniseg geometry, so each subsector polygon is
 * reconstructed by CARVING: the map bounding box is clipped by every node
 * partition half-plane on the path root → leaf, then by the subsector's own
 * seg lines (interior on the RIGHT of v1→v2), Sutherland-Hodgman on a convex
 * polygon at every step.
 */
class WadBspTree {
    /**
     * @param {object} level - output of WadLevelParser.parse()
     * @returns {WadBspTree|null} null when the BSP lumps are absent or
     *          inconsistent — callers fall back to the linedef-chain polygons.
     */
    static build(level) {
        const bsp = level.bsp;
        if ((bsp === null) || (bsp === undefined) || (bsp.nodes.length === 0)) {
            return null;
        }
        const {segs, ssectors, nodes} = bsp;
        // Above NF_SUBSECTOR records the root index itself would parse as a
        // leaf reference (the vanilla format cannot address them anyway).
        if (nodes.length > WadBspTree.NF_SUBSECTOR) {
            return null;
        }
        for (const seg of segs) {
            if ((seg.v1 >= level.vertexes.length) || (seg.v2 >= level.vertexes.length)
                || (seg.linedef >= level.linedefs.length)) {
                return null;
            }
            // The carve clips along the linedef's own vertexes (exact line),
            // so they must be in range too (hexen-format LINEDEFS parsed as
            // doom yield garbage indexes — that WAD falls back gracefully).
            const ld = level.linedefs[seg.linedef];
            if ((ld.v1 >= level.vertexes.length) || (ld.v2 >= level.vertexes.length)) {
                return null;
            }
        }
        for (const ss of ssectors) {
            if (ss.firstSeg + ss.segCount > segs.length) {
                return null;
            }
        }
        for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i];
            // A zero-length partition would descend the WRONG side (vanilla
            // R_PointOnSide special-cases dx == 0 to the front, our cross
            // lands on the back) and carve overlapping flats — reject.
            if ((n.dx === 0) && (n.dy === 0)) {
                return null;
            }
            for (const child of [n.rightChild, n.leftChild]) {
                if (WadBspTree.isLeaf(child)) {
                    if (WadBspTree.leafIndex(child) >= ssectors.length) {
                        return null;
                    }
                } else if (child >= i) {
                    // Vanilla nodebuilders emit children before their parent
                    // (the root is last): a forward or self reference means a
                    // cyclic/garbage lump — the descent would never terminate.
                    return null;
                }
            }
        }

        const tree = new WadBspTree(level, bsp);
        tree._carveAll();
        return tree;
    }

    constructor(level, bsp) {
        this._level             = level;
        this._bsp               = bsp;
        this._nodes             = bsp.nodes;
        this._sectorOfSubsector = bsp.ssectors.map((ss) => this._attributeSector(ss));
        this._sectorPolys       = level.sectors.map(() => []);
    }

    // Convex polygons ([x, y] Doom units) covering the sector, one per
    // subsector. Empty for a sector the BSP never reaches (callers fall back
    // to the chain polygons for it), and after releaseBuildData.
    polysOfSector(si) {
        return ((this._sectorPolys !== null) ? this._sectorPolys[si] : []);
    }

    // The carved polygons and the raw lumps only serve the build; findSector
    // needs the nodes and the subsector→sector table alone. Frees the carved
    // per-subsector polygons and this tree's own level/lump references — the
    // parsed level itself stays alive through the monster system's runtime
    // findSector (its polygon fallback needs it).
    releaseBuildData() {
        this._level       = null;
        this._bsp         = null;
        this._sectorPolys = null;
    }

    // R_PointInSubsector (r_main.c): iterative descent, on-line goes to the
    // left child (vanilla back side). Returns the sector index, or null on a
    // subsector no seg could attribute (the polygon fallback decides).
    findSector(x, y) {
        let child = this._nodes.length - 1;
        while (!WadBspTree.isLeaf(child)) {
            const n    = this._nodes[child];
            const back = (WadGeometry.pointOnLineSide(x, y, n.x, n.y, n.x + n.dx, n.y + n.dy) === 1);
            child = ((back) ? n.leftChild : n.rightChild);
        }
        const si = this._sectorOfSubsector[WadBspTree.leafIndex(child)];
        return ((si >= 0) ? si : null);
    }

    // Leaf encoding of a node child: part of the lump format this class owns,
    // and the map reveal walks the same nodes.
    static isLeaf(child) {
        return ((child & WadBspTree.NF_SUBSECTOR) !== 0);
    }

    static leafIndex(child) {
        return (child & (WadBspTree.NF_SUBSECTOR - 1));
    }

    // --- Internal ---

    // The subsector's sector: first seg whose sidedef (front for direction 0,
    // back for 1) points to a real sector — iterated, one corrupt seg must not
    // drop the leaf.
    _attributeSector(ss) {
        const {linedefs, sidedefs, sectors} = this._level;
        const segs = this._bsp.segs;
        for (let i = 0; i < ss.segCount; i++) {
            const seg = segs[ss.firstSeg + i];
            const ld  = linedefs[seg.linedef];
            const sd  = ((seg.direction === 0) ? ld.right : ld.left);
            if ((sd >= 0) && (sd < sidedefs.length) && (sidedefs[sd].sector < sectors.length)) {
                return sidedefs[sd].sector;
            }
        }
        return -1;
    }

    _carveAll() {
        const [minX, minY, maxX, maxY] = WadGeometry.pointsBbox(this._level.vertexes);
        const bbox = [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]];
        this._carve(this._bsp.nodes.length - 1, bbox);
    }

    _carve(child, poly) {
        if (poly.length < 3) {
            return;
        }
        if (WadBspTree.isLeaf(child)) {
            const ssIdx = WadBspTree.leafIndex(child);
            const si = this._sectorOfSubsector[ssIdx];
            if (si < 0) {
                return;
            }
            const {vertexes, linedefs} = this._level;
            const ss   = this._bsp.ssectors[ssIdx];
            const segs = this._bsp.segs;
            let clipped = poly;
            for (let i = 0; i < ss.segCount; i++) {
                const seg = segs[ss.firstSeg + i];
                // Clip along the LINEDEF's exact line, not the seg's: split
                // segs carry INTEGER-rounded vertexes (vanilla format), so a
                // diagonal seg's own line deviates from the true boundary and
                // the carve would leave "slime trail" slivers on the neighbour.
                // Only the seg's extent is rounded — its supporting line is
                // the linedef's; direction 1 runs the linedef backward.
                const ld = linedefs[seg.linedef];
                const [x1, y1] = vertexes[ld.v1];
                const [x2, y2] = vertexes[ld.v2];
                clipped = WadBspTree._clipHalfPlane(clipped, x1, y1, x2 - x1, y2 - y1, (seg.direction === 1));
                if (clipped.length < 3) {
                    return;
                }
            }
            clipped = WadBspTree._dedupe(clipped);
            if (clipped.length < 3) {
                return;
            }
            // Sliver guard: the node partition planes stay integer-rounded, so
            // hairline strips (long but sub-unit wide) can survive the area
            // floor — width = 2·area / longest edge.
            const area = Math.abs(WadGeometry.polygonAreaSign(clipped)) / 2;
            if ((area >= WadBspTree.AREA_EPS) && (WadBspTree._width(clipped, area) >= WadBspTree.SLIVER_MIN_WIDTH)) {
                this._sectorPolys[si].push(clipped);
            }
            return;
        }
        const n = this._bsp.nodes[child];
        this._carve(n.rightChild, WadBspTree._clipHalfPlane(poly, n.x, n.y, n.dx, n.dy, false));
        this._carve(n.leftChild,  WadBspTree._clipHalfPlane(poly, n.x, n.y, n.dx, n.dy, true));
    }

    // Convex polygon clipped by a half-plane of the directed line (px, py) +
    // t·(dx, dy): keepLeft keeps cross >= 0 (vanilla R_PointOnSide back side),
    // else the right side. The signed distance is NORMALIZED by the line
    // length so LINE_EPS is in map units whatever the partition length, and
    // the ±EPS band is symmetric — an on-line vertex survives on BOTH sides,
    // closing hairline gaps where a partition is collinear with a seg (very
    // common: nodebuilders split along seg lines).
    static _clipHalfPlane(poly, px, py, dx, dy, keepLeft) {
        const len = Math.hypot(dx, dy);
        if (len < 1e-9) {
            return poly;
        }
        const sign = ((keepLeft) ? 1 : -1);
        const dist = (p) => (sign * ((p[1] - py) * dx - (p[0] - px) * dy) / len);
        const out = [];
        for (let i = 0; i < poly.length; i++) {
            const a = poly[i];
            const b = poly[(i + 1) % poly.length];
            const fa = dist(a);
            const fb = dist(b);
            if (fa >= -WadBspTree.LINE_EPS) {
                out.push(a);
            }
            if (((fa > WadBspTree.LINE_EPS) && (fb < -WadBspTree.LINE_EPS))
                || ((fa < -WadBspTree.LINE_EPS) && (fb > WadBspTree.LINE_EPS))) {
                const t = fa / (fa - fb);
                out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
            }
        }
        return out;
    }

    static _width(poly, area) {
        let longest = 0;
        for (let i = 0; i < poly.length; i++) {
            const a = poly[i];
            const b = poly[(i + 1) % poly.length];
            longest = Math.max(longest, Math.hypot(b[0] - a[0], b[1] - a[1]));
        }
        return ((longest > 0) ? (2 * area / longest) : 0);
    }

    static _dedupe(poly) {
        const out = [];
        for (const p of poly) {
            const prev = ((out.length > 0) ? out[out.length - 1] : null);
            if ((prev !== null) && (Math.abs(p[0] - prev[0]) < WadBspTree.LINE_EPS)
                && (Math.abs(p[1] - prev[1]) < WadBspTree.LINE_EPS)) {
                continue;
            }
            out.push(p);
        }
        if (out.length > 1) {
            const first = out[0];
            const last  = out[out.length - 1];
            if ((Math.abs(first[0] - last[0]) < WadBspTree.LINE_EPS)
                && (Math.abs(first[1] - last[1]) < WadBspTree.LINE_EPS)) {
                out.pop();
            }
        }
        return out;
    }
}

// Vanilla NF_SUBSECTOR (doomdata.h): bit 15 of a node child marks a leaf,
// the low 15 bits are the subsector index.
WadBspTree.NF_SUBSECTOR = 0x8000;

// Clipping tolerance (map units), minimum polygon area (map units²) and
// minimum polygon width (map units): the on-line band and the sliver guards
// of the carve — no legitimate Doom geometry is half a unit wide.
WadBspTree.LINE_EPS = 0.01;
WadBspTree.AREA_EPS = 0.5;
WadBspTree.SLIVER_MIN_WIDTH = 0.5;
