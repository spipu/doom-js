/**
 * Uniform 2D index over the XZ plane for a set of triangles that never moves
 * (the static world colliders). A query returns only the triangles of the cells
 * it actually touches, so the collision scans stop being O(whole level): on a
 * mid-size level, a floor query goes from a few thousand candidates to a few
 * dozen.
 *
 * Generic engine structure: it only reads the axis-aligned bounds every triangle
 * already carries (xMin/xMax/zMin/zMax) and knows nothing of what they are.
 *
 * Buckets are stored as two typed arrays (offset table + item list) rather than
 * an array of arrays: one allocation for the whole index and none per query. A
 * triangle overlapping several cells is listed in each of them, so a query
 * dedups through a stamp table — a triangle already collected carries the
 * current query id.
 */
class SpatialGrid {
    /**
     * @param {object[]} triangles - triangles carrying xMin/xMax/zMin/zMax
     */
    constructor(triangles) {
        this._tris    = triangles;
        this._cols    = 0;
        this._rows    = 0;
        this._cell    = 1;
        this._minX    = 0;
        this._minZ    = 0;
        this._maxX    = 0;
        this._maxZ    = 0;
        this._start   = null;   // Int32Array(cells + 1): first item index of each cell
        this._items   = null;   // Int32Array: triangle indexes, grouped by cell
        this._stamp   = null;   // Int32Array(triangles.length): last query that collected each triangle
        this._queryId = 0;
        this._bounds  = [0, 0, 0, 0];   // scratch of _cellBounds
        this._build();
    }

    // An empty set (a level with no ceiling geometry) indexes nothing; every
    // query answers 0 and the caller simply finds no candidate.
    isEmpty() {
        return (this._start === null);
    }

    // --- Queries: append the candidates into `out` from index n, return the
    // new count. `out` belongs to the caller and is reused across queries, so
    // entries past the returned count are stale leftovers. Appending (rather
    // than filling from 0) lets a caller gather several indexes into one buffer.

    queryCircle(px, pz, r, out, n = 0) {
        return this._collectRange(px - r, pz - r, px + r, pz + r, out, n);
    }

    // Swept circle of a wall resolution: the bounding box of the whole sweep.
    querySegment(cx, cz, vx, vz, r, out, n = 0) {
        return this._collectRange(
            Math.min(cx, cx + vx) - r, Math.min(cz, cz + vz) - r,
            Math.max(cx, cx + vx) + r, Math.max(cz, cz + vz) + r,
            out, n);
    }

    // Cells crossed by a ray, walked one by one (DDA) instead of taking the
    // bounding box of the whole segment — over a long shot the box covers a
    // large part of the level while the walk visits a handful of cells.
    //
    // The direction is the 3D one: only its XZ part drives the walk, and the
    // distance travelled on the plane is maxDist scaled by that part.
    queryRay(ox, oz, dx, dz, maxDist, out, n = 0) {
        if (this.isEmpty()) {
            return n;
        }
        const len = Math.sqrt(dx * dx + dz * dz);
        // Vertical shot: the XZ projection degenerates to a point, so the whole
        // ray lives in the single cell above/below the origin.
        if (len < 1e-9) {
            if ((ox < this._minX) || (ox > this._maxX) || (oz < this._minZ) || (oz > this._maxZ)) {
                return n;
            }
            this._nextQuery();
            return this._collectCell(this._col(ox), this._row(oz), out, n);
        }

        const ux = dx / len;
        const uz = dz / len;
        // An unbounded ray (raycast defaults to Infinity) is clamped to the
        // grid span: past it there is nothing left to hit.
        const span   = this._cell * (this._cols + this._rows);
        const travel = Math.min(maxDist * len, span);
        const clip   = this._clipToGrid(ox, oz, ux, uz, travel);
        if (clip === null) {
            return n;
        }

        const sx = ox + ux * clip.t0;
        const sz = oz + uz * clip.t0;
        let col = this._col(sx);
        let row = this._row(sz);
        const stepCol = ((ux > 0) ? 1 : -1);
        const stepRow = ((uz > 0) ? 1 : -1);
        // Distance to the next boundary on each axis, then one full cell each time
        const boundX = this._minX + (col + ((ux > 0) ? 1 : 0)) * this._cell;
        const boundZ = this._minZ + (row + ((uz > 0) ? 1 : 0)) * this._cell;
        let tNextCol = ((ux !== 0) ? (clip.t0 + (boundX - sx) / ux) : Infinity);
        let tNextRow = ((uz !== 0) ? (clip.t0 + (boundZ - sz) / uz) : Infinity);
        const tCol = ((ux !== 0) ? Math.abs(this._cell / ux) : Infinity);
        const tRow = ((uz !== 0) ? Math.abs(this._cell / uz) : Infinity);

        this._nextQuery();
        while (true) {
            n = this._collectCell(col, row, out, n);
            if (tNextCol < tNextRow) {
                if (tNextCol > clip.t1) {
                    break;
                }
                col += stepCol;
                if ((col < 0) || (col >= this._cols)) {
                    break;
                }
                tNextCol += tCol;
            } else {
                if (tNextRow > clip.t1) {
                    break;
                }
                row += stepRow;
                if ((row < 0) || (row >= this._rows)) {
                    break;
                }
                tNextRow += tRow;
            }
        }
        return n;
    }

    // --- Internal ---

    // Parametric clip of the ray against the grid rectangle: {t0, t1} of the
    // portion inside it, or null when it never enters (a shot fired outside the
    // indexed area, away from it).
    _clipToGrid(ox, oz, ux, uz, travel) {
        let t0 = 0;
        let t1 = travel;
        const axes = [[ox, ux, this._minX, this._maxX], [oz, uz, this._minZ, this._maxZ]];
        for (const [origin, dir, lo, hi] of axes) {
            if (Math.abs(dir) < 1e-12) {
                if ((origin < lo) || (origin > hi)) {
                    return null;
                }
                continue;
            }
            const a = (lo - origin) / dir;
            const b = (hi - origin) / dir;
            t0 = Math.max(t0, Math.min(a, b));
            t1 = Math.min(t1, Math.max(a, b));
            if (t0 > t1) {
                return null;
            }
        }
        return {t0: t0, t1: t1};
    }

    _collectRange(xMin, zMin, xMax, zMax, out, n) {
        if (this.isEmpty()) {
            return n;
        }
        if ((xMax < this._minX) || (xMin > this._maxX) || (zMax < this._minZ) || (zMin > this._maxZ)) {
            return n;
        }
        this._cellBounds(xMin, zMin, xMax, zMax);
        const [c0, r0, c1, r1] = this._bounds;

        this._nextQuery();
        for (let row = r0; row <= r1; row++) {
            for (let col = c0; col <= c1; col++) {
                n = this._collectCell(col, row, out, n);
            }
        }
        return n;
    }

    _collectCell(col, row, out, n) {
        const cell = col + row * this._cols;
        const end  = this._start[cell + 1];
        for (let i = this._start[cell]; i < end; i++) {
            const t = this._items[i];
            if (this._stamp[t] === this._queryId) {
                continue;
            }
            this._stamp[t] = this._queryId;
            out[n] = this._tris[t];
            n++;
        }
        return n;
    }

    // Query ids are the dedup key, so they must never wrap onto a stale stamp:
    // clearing the table on overflow costs one pass every few billion queries.
    _nextQuery() {
        this._queryId++;
        if (this._queryId === 0x7fffffff) {
            this._stamp.fill(0);
            this._queryId = 1;
        }
    }

    _col(x) {
        return Math.min(this._cols - 1, Math.max(0, Math.floor((x - this._minX) / this._cell)));
    }

    _row(z) {
        return Math.min(this._rows - 1, Math.max(0, Math.floor((z - this._minZ) / this._cell)));
    }

    // Clamped cell range covering a box, written into the shared scratch as
    // [c0, r0, c1, r1] (consume it immediately).
    _cellBounds(xMin, zMin, xMax, zMax) {
        this._bounds[0] = this._col(xMin);
        this._bounds[1] = this._row(zMin);
        this._bounds[2] = this._col(xMax);
        this._bounds[3] = this._row(zMax);
        return this._bounds;
    }

    _build() {
        const tris = this._tris;
        if (tris.length === 0) {
            return;
        }

        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (const tri of tris) {
            minX = Math.min(minX, tri.xMin);
            maxX = Math.max(maxX, tri.xMax);
            minZ = Math.min(minZ, tri.zMin);
            maxZ = Math.max(maxZ, tri.zMax);
        }
        const extentX = Math.max(maxX - minX, 1e-6);
        const extentZ = Math.max(maxZ - minZ, 1e-6);

        // Cell size aimed at TARGET_PER_CELL triangles per bucket, then widened
        // if needed so the grid itself stays small whatever the level size. It
        // is derived from the data, never from a game constant: the engine has
        // no idea what one world unit means.
        let cell = Math.sqrt((extentX * extentZ * SpatialGrid.TARGET_PER_CELL) / tris.length);
        cell = Math.max(cell, extentX / SpatialGrid.MAX_PER_AXIS, extentZ / SpatialGrid.MAX_PER_AXIS);
        if (!(cell > 0)) {
            cell = 1;
        }

        this._cell = cell;
        this._minX = minX;
        this._minZ = minZ;
        this._maxX = maxX;
        this._maxZ = maxZ;
        this._cols = Math.max(1, Math.ceil(extentX / cell));
        this._rows = Math.max(1, Math.ceil(extentZ / cell));

        const cells = this._cols * this._rows;
        const start = new Int32Array(cells + 1);
        for (const tri of tris) {
            const [c0, r0, c1, r1] = this._cellBounds(tri.xMin, tri.zMin, tri.xMax, tri.zMax);
            for (let row = r0; row <= r1; row++) {
                for (let col = c0; col <= c1; col++) {
                    start[col + row * this._cols + 1]++;
                }
            }
        }
        for (let i = 0; i < cells; i++) {
            start[i + 1] += start[i];
        }

        const items  = new Int32Array(start[cells]);
        const cursor = start.slice(0, cells);
        for (let t = 0; t < tris.length; t++) {
            const tri = tris[t];
            const [c0, r0, c1, r1] = this._cellBounds(tri.xMin, tri.zMin, tri.xMax, tri.zMax);
            for (let row = r0; row <= r1; row++) {
                for (let col = c0; col <= c1; col++) {
                    const cell = col + row * this._cols;
                    items[cursor[cell]] = t;
                    cursor[cell]++;
                }
            }
        }

        this._start = start;
        this._items = items;
        this._stamp = new Int32Array(tris.length);
    }
}

// Sizing target of _build: triangles per cell counted ONCE each. A bucket
// actually holds more, because a triangle overlapping several cells is listed in
// each of them — measured straddle factor ≈ 3.6 on a Doom level, so ~12 here
// gives buckets of ~20 and a circle query (1 to 4 cells) collects a few dozen
// candidates instead of the level's few thousand.
SpatialGrid.TARGET_PER_CELL = 12;
// Hard cap on the cell count per axis, so a huge level cannot blow up the index.
SpatialGrid.MAX_PER_AXIS = 256;
