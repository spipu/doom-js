/**
 * Progressive reveal of the automap, transcription of the vanilla mechanism: a
 * linedef is memorised when the renderer's BSP walk actually draws one of its
 * segs (ML_MAPPED, posed in hw_bsp.cpp AddLine and swrenderer r_line.cpp — in
 * both cases AFTER the occlusion test). Our renderers only know triangles, so
 * the walk is replayed here: front-to-back descent, backface cull, and the
 * angular clipper of hw_clipper.cpp, which swallows whatever a nearer solid
 * wall already covers. A wall hidden behind another one therefore stays dark,
 * exactly like the original.
 *
 * Angles are BAM integers like the engine's angle_t, absolute and never
 * relative to the view: a vertex shared by two walls then yields the very same
 * integer, so their covered ranges touch exactly and merge into one. In
 * floating degrees they miss each other by a rounding step, and since the
 * clipper only ever tests ONE range at a time (IsRangeVisible), a distant wall
 * straddling that seam was declared visible. The view window is itself a
 * covered range, inserted like CreateScene does with FrustumAngle.
 */
class DoomAutomapReveal {
    /**
     * @param {object}            bsp     - {nodes, ssectors, segs} of WadAutomapBuilder
     * @param {object[]}          byLdIdx - lines indexed by linedef index
     * @param {DoomSectorHeights} heights - live heights, for the solidity test
     */
    constructor(bsp, byLdIdx, heights) {
        this._bsp     = bsp;
        this._byLdIdx = byLdIdx;
        this._heights = heights;
        this._ranges  = [];       // covered angular spans, sorted and disjoint
        this._blocked = false;
        this._x       = 0;
        this._y       = 0;
    }

    /**
     * One pass from the player's spot, in Doom units and Doom angles. The
     * window is the game's CURRENT field of view, so a telezoom arrival reveals
     * exactly as wide as it renders.
     */
    revealFrom(doomX, doomY, viewAngle, halfWindow) {
        this._x = doomX;
        this._y = doomY;
        this._ranges.length = 0;
        this._blocked = false;

        const half = DoomAutomapReveal._bam(halfWindow);
        if (half < DoomAutomapReveal.ANGLE_180) {
            const view = DoomAutomapReveal._bam(viewAngle);
            this._addSafe(DoomAutomapReveal._wrap(view + half), DoomAutomapReveal._wrap(view - half));
        }
        this._descend(this._bsp.nodes.length - 1);
    }

    // --- Internal: the walk ---

    // R_RenderBSPNode: the near child first, so a wall is always met before
    // whatever it hides — the whole point of the clipper.
    _descend(child) {
        if (this._blocked) {
            return;
        }
        if (WadBspTree.isLeaf(child)) {
            this._leaf(WadBspTree.leafIndex(child));
            return;
        }
        const node = this._bsp.nodes[child];
        const back = (WadGeometry.pointOnLineSide(this._x, this._y, node.x, node.y,
            node.x + node.dx, node.y + node.dy) === 1);
        this._descend(((back) ? node.leftChild : node.rightChild));
        this._descend(((back) ? node.rightChild : node.leftChild));
    }

    _leaf(ssIdx) {
        const ss = this._bsp.ssectors[ssIdx];
        for (let i = 0; i < ss.segCount; i++) {
            this._seg(this._bsp.segs[ss.firstSeg + i]);
        }
    }

    _seg(seg) {
        // Like AddLine: a seg with no sidedef of its own neither reveals nor
        // occludes.
        if (seg.siFront === null) {
            return;
        }
        const start = this._angleTo(seg.x2, seg.y2);
        const end   = this._angleTo(seg.x1, seg.y1);
        // AddLine's backface test: less than half a turn and the seg shows us
        // its back. A seg too thin to span one BAM unit lands here too.
        if (DoomAutomapReveal._wrap(start - end) < DoomAutomapReveal.ANGLE_180) {
            return;
        }
        if (!this._checkRange(start, end)) {
            return;
        }
        const line = this._byLdIdx[seg.ldIdx];
        if (line !== undefined) {
            line.seen = true;
        }
        if (this._isSolid(seg)) {
            this._addSafe(start, end);
        }
    }

    // hw_CheckClip: a one-sided seg, or a two-sided one whose opening is closed
    // RIGHT NOW — a shut door hides what lies behind it, an open one lets the
    // map be drawn through it.
    _isSolid(seg) {
        if (seg.siBack === null) {
            return true;
        }
        const fh = Math.max(this._heights.floorOf(seg.siFront), this._heights.floorOf(seg.siBack));
        const ch = Math.min(this._heights.ceilingOf(seg.siFront), this._heights.ceilingOf(seg.siBack));

        return (ch <= fh);
    }

    // --- Internal: the angular clipper (hw_clipper.cpp) ---

    // SafeCheckRange: a span straddling the zero seam is tested in two parts,
    // and stays visible as soon as either part is.
    _checkRange(start, end) {
        if (start > end) {
            return (this._rangeVisible(start, DoomAutomapReveal.ANGLE_MAX) || this._rangeVisible(0, end));
        }

        return this._rangeVisible(start, end);
    }

    // IsRangeVisible: hidden only when a SINGLE covered range holds the whole
    // span — which is what makes the exact-touch merge below load-bearing.
    _rangeVisible(start, end) {
        if ((end === 0) && (this._ranges.length > 0) && (this._ranges[0].lo === 0)) {
            return false;
        }
        for (const range of this._ranges) {
            if (range.lo >= end) {
                break;
            }
            if ((start >= range.lo) && (end <= range.hi)) {
                return false;
            }
        }

        return true;
    }

    // SafeAddClipRange
    _addSafe(start, end) {
        if (start > end) {
            this._addRange(start, DoomAutomapReveal.ANGLE_MAX);
            this._addRange(0, end);
            return;
        }
        this._addRange(start, end);
    }

    // AddClipRange: merged with every range it overlaps or exactly touches.
    _addRange(lo, hi) {
        let first = 0;
        while ((first < this._ranges.length) && (this._ranges[first].hi < lo)) {
            first++;
        }
        let last = first;
        while ((last < this._ranges.length) && (this._ranges[last].lo <= hi)) {
            last++;
        }
        const mergedLo = ((last > first) ? Math.min(lo, this._ranges[first].lo) : lo);
        const mergedHi = ((last > first) ? Math.max(hi, this._ranges[last - 1].hi) : hi);
        this._ranges.splice(first, last - first, {lo: mergedLo, hi: mergedHi});
        // Nothing can be revealed once the whole turn is walled off.
        this._blocked = ((this._ranges.length === 1) && (this._ranges[0].lo === 0)
            && (this._ranges[0].hi === DoomAutomapReveal.ANGLE_MAX));
    }

    // --- Internal: angles ---

    _angleTo(x, y) {
        return DoomAutomapReveal._wrap(
            Math.round(Math.atan2(y - this._y, x - this._x) * DoomAutomapReveal.BAM_PER_RADIAN));
    }

    static _bam(degrees) {
        return DoomAutomapReveal._wrap(Math.round(degrees * DoomAutomapReveal.BAM_PER_DEGREE));
    }

    static _wrap(bam) {
        return (((bam % DoomAutomapReveal.TURN) + DoomAutomapReveal.TURN) % DoomAutomapReveal.TURN);
    }
}

// Binary angles of the engine (angle_t): a full turn is 2^32, so ANGLE_MAX and
// 0 are neighbours the clipper cannot join — hence the two-part ranges.
DoomAutomapReveal.TURN      = 4294967296;
DoomAutomapReveal.ANGLE_MAX = 4294967295;
DoomAutomapReveal.ANGLE_180 = 2147483648;
DoomAutomapReveal.BAM_PER_RADIAN = DoomAutomapReveal.TURN / (2 * Math.PI);
DoomAutomapReveal.BAM_PER_DEGREE = DoomAutomapReveal.TURN / 360;
