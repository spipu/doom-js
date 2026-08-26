/**
 * Automap geometry of a level, built once: the linedefs as a plan-view line
 * list, plus the BSP arrays the reveal walks. Pure data, like the analyzer's
 * output — which lines have been seen is state, and lives on the lines
 * themselves under DoomAutomap.
 *
 * Coordinates stay in DOOM units: the automap is a plan of the map, and the
 * world scale only ever concerns the player marker.
 */
class WadAutomapBuilder {
    /**
     * @param {object} level - output of WadLevelParser.parse(), already patched
     *                         by the analyzer (its BSP lumps must be valid, see
     *                         the caller's WadBspTree guard)
     */
    constructor(level) {
        this._level = level;
    }

    /**
     * @returns {object} {lines, byLdIdx, bounds, lineCount, bsp}
     *          lines   - the drawable ones, in linedef order
     *          byLdIdx - the same objects indexed by linedef index (the reveal
     *                    marks through it, the save keys on it)
     *          bounds  - [minX, minY, maxX, maxY] over every vertex, like the
     *                    vanilla AM_findMinMaxBoundaries
     */
    build() {
        const {vertexes, linedefs, sidedefs} = this._level;
        const lines   = [];
        const byLdIdx = [];

        for (let ldIdx = 0; ldIdx < linedefs.length; ldIdx++) {
            const ld = linedefs[ldIdx];
            // A line with a single sidedef is one-sided whichever side carries
            // it; one with none belongs to no sector and is not drawable.
            const front = ((ld.right >= 0) ? ld.right : ld.left);
            if (front < 0) {
                continue;
            }
            const back = (((ld.right >= 0) && (ld.left >= 0)) ? ld.left : -1);
            const [x1, y1] = vertexes[ld.v1];
            const [x2, y2] = vertexes[ld.v2];
            const line = {
                ldIdx:    ldIdx,
                x1:       x1,
                y1:       y1,
                x2:       x2,
                y2:       y2,
                siFront:  sidedefs[front].sector,
                siBack:   ((back >= 0) ? sidedefs[back].sector : null),
                secret:   ((ld.flags & WadConstants.ML_SECRET) !== 0),
                dontDraw: ((ld.flags & WadConstants.ML_DONTDRAW) !== 0),
                keyCode:  (WadConstants.DOOR_BY_SPECIAL[ld.special]?.key ?? null),
                // A WAD may ship a line already revealed.
                seen:     ((ld.flags & WadConstants.ML_MAPPED) !== 0)
            };
            lines.push(line);
            byLdIdx[ldIdx] = line;
        }

        return {
            lines:     lines,
            byLdIdx:   byLdIdx,
            bounds:    WadGeometry.pointsBbox(vertexes),
            // Guard of the saved state: a different count means the WAD file
            // changed under the same id.
            lineCount: linedefs.length,
            bsp:       {nodes: this._level.bsp.nodes, ssectors: this._level.bsp.ssectors, segs: this._buildSegs()}
        };
    }

    // --- Internal ---

    // Resolved once so the reveal never reads the raw lumps. Every index was
    // validated by WadBspTree.build(), which the caller required.
    _buildSegs() {
        const {vertexes, linedefs, sidedefs, bsp} = this._level;
        const segs = [];
        for (const seg of bsp.segs) {
            const ld    = linedefs[seg.linedef];
            const front = ((seg.direction === 0) ? ld.right : ld.left);
            const back  = ((seg.direction === 0) ? ld.left : ld.right);
            const [x1, y1] = vertexes[seg.v1];
            const [x2, y2] = vertexes[seg.v2];
            segs.push({
                x1:      x1,
                y1:      y1,
                x2:      x2,
                y2:      y2,
                ldIdx:   seg.linedef,
                siFront: ((front >= 0) ? sidedefs[front].sector : null),
                siBack:  ((back >= 0) ? sidedefs[back].sector : null)
            });
        }

        return segs;
    }
}
