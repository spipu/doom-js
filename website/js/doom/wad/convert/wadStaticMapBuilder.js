/**
 * Static map geometry builder (transposition of the wall and flat generation
 * phases of convert_wad.py main()).
 */
class WadStaticMapBuilder {
    /**
     * @param {object}           level    - output of WadLevelParser.parse() (already patched by the analyzer)
     * @param {object}           analysis - output of WadMapAnalyzer.analyze()
     * @param {WadTextureBank}   bank
     * @param {WadAnimationBank} animBank
     */
    constructor(level, analysis, bank, animBank) {
        this._level    = level;
        this._analysis = analysis;
        this._bank     = bank;
        this._animBank = animBank;
    }

    _lightGroupOf(si) {
        return WadMapAnalyzer.lightGroupOf(this._analysis, si);
    }

    /**
     * @returns {{textures: int[], mesh: object}} textures as bank indices (0-based)
     */
    build() {
        const mesh = WadMeshBuilder.newMesh();

        this._buildWalls(mesh);
        this._buildFlats(mesh);

        // The map references the whole bank as built so far (like the Python
        // tex_paths snapshot); faces already hold global 1-based indices.
        const allIndices = [];
        for (let i = 0; i < this._bank.count(); i++) {
            allIndices.push(i);
        }

        const groups = this._animBank.buildAnimGroups(allIndices);
        WadMeshBuilder.applyAnimMap(mesh.faces, groups.animMap);

        return {textures: groups.newList, mesh: mesh};
    }

    // --- Walls ---

    _buildWalls(mesh) {
        const {vertexes, linedefs, sidedefs, sectors} = this._level;
        const {doorSectorIds, doorHeights, switchLinedefIds, switchWalls} = this._analysis;
        const SCALE = WadConstants.SCALE;

        for (let ldIdx = 0; ldIdx < linedefs.length; ldIdx++) {
            const ld = linedefs[ldIdx];
            const [dx1, dy1] = vertexes[ld.v1];
            const [dx2, dy2] = vertexes[ld.v2];
            const [wx1, wz1] = WadGeometry.doomToWorld(dx1, dy1);
            const [wx2, wz2] = WadGeometry.doomToWorld(dx2, dy2);
            const wallLen = WadGeometry.wallLengthDoom(vertexes, ld.v1, ld.v2);

            if (ld.right < 0) {
                continue;
            }

            const rSd  = sidedefs[ld.right];
            const rSec = sectors[rSd.sector];
            const rIsDoor = doorSectorIds.has(rSd.sector);

            // Scrolling wall (48): vanilla animates the FRONT sidedef's texture
            // offset only, so the scroll rate applies to right-side faces alone
            const uScroll = (WadConstants.SCROLL_WALL_BY_SPECIAL[ld.special] ?? 0);

            if (ld.left < 0) {
                if (switchLinedefIds.has(ldIdx)) {
                    continue;
                }
                if (rIsDoor) {
                    // One-sided lateral wall of a door sector (DOORTRAK)
                    if (doorHeights[rSd.sector] === undefined) {
                        continue;
                    }
                    const {floorH, ceilH} = doorHeights[rSd.sector];
                    const texName = rSd.middle;
                    if (!texName || texName === '-') {
                        continue;
                    }
                    const ti = this._bank.ensureWallTex(texName);
                    if (ti < 0) {
                        continue;
                    }
                    const {width: tw, height: th} = this._bank.getDims(ti);
                    const lowerUnpegLd = ((ld.flags & WadConstants.ML_DONTPEGBOTTOM) !== 0);
                    const yo = rSd.yo + ((lowerUnpegLd) ? ((th - (ceilH - floorH) % th) % th) : 0);
                    WadMeshBuilder.addWallQuad(mesh, ti,
                        wx1, wz1, wx2, wz2,
                        floorH * SCALE, ceilH * SCALE,
                        wallLen, tw, th,
                        {xOff: rSd.xo, yOff: yo, flip: true, light: rSec.light, uScrollTexelsPerSec: uScroll, lightGroup: this._lightGroupOf(rSd.sector)});
                    continue;
                }
                // One-sided linedef → solid wall
                const texName = rSd.middle;
                const ti = this._bank.ensureWallTex(texName);
                if (ti >= 0) {
                    const {width: tw, height: th} = this._bank.getDims(ti);
                    const hDoom = rSec.ch - rSec.fh;
                    // ML_DONTPEGBOTTOM: texture bottom at floor instead of texture top at ceiling
                    const yo = rSd.yo + (((ld.flags & WadConstants.ML_DONTPEGBOTTOM) !== 0) ? (th - hDoom) : 0);
                    WadMeshBuilder.addWallQuad(mesh, ti,
                        wx1, wz1, wx2, wz2,
                        rSec.fh * SCALE, rSec.ch * SCALE,
                        wallLen, tw, th,
                        {xOff: rSd.xo, yOff: yo, flip: true, light: rSec.light, uScrollTexelsPerSec: uScroll, lightGroup: this._lightGroupOf(rSd.sector)});
                }
                continue;
            }

            // --- Two-sided linedef ---
            const lSd  = sidedefs[ld.left];
            const lSec = sectors[lSd.sector];
            const lIsDoor = doorSectorIds.has(lSd.sector);

            // A two-sided switch graphic (on a lower/upper) is rebuilt as an
            // interactive instance, so drop that exact face here to avoid a
            // double draw / z-fighting (mirrors the one-sided skip above).
            const swWall = switchWalls.get(ldIdx) ?? null;
            const isSwitchFace = (side, slot) => ((swWall !== null) && (swWall.side === side) && (swWall.slot === slot));

            const rFh = rSec.fh;
            const rCh = rSec.ch;
            const lFh = lSec.fh;
            const lCh = lSec.ch;

            const upperUnpeg = ((ld.flags & WadConstants.ML_DONTPEGTOP) !== 0);
            const lowerUnpeg = ((ld.flags & WadConstants.ML_DONTPEGBOTTOM) !== 0);

            // Doom sky rule: when BOTH ceilings are sky, the upper between them
            // is not drawn — the sky is continuous (no band above the opening).
            const ceilSky = (rSec.ct.startsWith('F_SKY') && lSec.ct.startsWith('F_SKY'));

            // Lower wall: step up from right sector floor to left sector floor.
            // Door sectors are allowed here (no !isDoor guard): a door on a step
            // up (own fh patched above its lowest neighbour) needs this riser on
            // the door line — flush doors give lFh == rFh and build nothing. The
            // upper walls below stay door-guarded (the door panel covers them).
            if (lFh > rFh && !isSwitchFace('right', 'lower')) {
                const ti = this._bank.ensureWallTex(rSd.lower);
                const {width: tw, height: th} = ((ti < 0) ? {width: 128, height: 128} : this._bank.getDims(ti));
                // lower_unpeg: texture hangs from the front ceiling (rCh) rather than the floor
                const yo = rSd.yo + ((lowerUnpeg) ? (rCh - lFh) : 0);
                WadMeshBuilder.addWallQuad(mesh, ti,
                    wx1, wz1, wx2, wz2,
                    rFh * SCALE, lFh * SCALE,
                    wallLen, tw, th,
                    {xOff: rSd.xo, yOff: yo, flip: true, light: rSec.light, uScrollTexelsPerSec: uScroll, lightGroup: this._lightGroupOf(rSd.sector)});
            }

            // Lower wall from left side (door sectors allowed, see above)
            if (rFh > lFh && !isSwitchFace('left', 'lower')) {
                const ti = this._bank.ensureWallTex(lSd.lower);
                const {width: tw, height: th} = ((ti < 0) ? {width: 128, height: 128} : this._bank.getDims(ti));
                const yo = lSd.yo + ((lowerUnpeg) ? (lCh - rFh) : 0);
                WadMeshBuilder.addWallQuad(mesh, ti,
                    wx1, wz1, wx2, wz2,
                    lFh * SCALE, rFh * SCALE,
                    wallLen, tw, th,
                    {xOff: lSd.xo, yOff: yo, flip: false, light: lSec.light, lightGroup: this._lightGroupOf(lSd.sector)});
            }

            // Upper wall: ceiling step down from right sector to left sector.
            // Skipped only when the LOWER-ceiling side is a door — its panel
            // covers the band. When the door side has the HIGHER ceiling (a
            // crusher next to a closed spacer sector), the band between the
            // neighbour's ceiling and the door's open ceiling is a static wall
            // (DOORTRAK precedent: the descending panel occludes it).
            if (lCh < rCh && !lIsDoor && !ceilSky && !isSwitchFace('right', 'upper')) {
                const ti = this._bank.ensureWallTex(rSd.upper);
                const {width: tw, height: th} = ((ti < 0) ? {width: 128, height: 128} : this._bank.getDims(ti));
                // Default: bottom of texture at lower ceiling. DONTPEGTOP: top of texture at higher ceiling.
                const yo = rSd.yo + ((upperUnpeg) ? 0 : (th - (rCh - lCh)));
                WadMeshBuilder.addWallQuad(mesh, ti,
                    wx1, wz1, wx2, wz2,
                    lCh * SCALE, rCh * SCALE,
                    wallLen, tw, th,
                    {xOff: rSd.xo, yOff: yo, flip: true, light: rSec.light, uScrollTexelsPerSec: uScroll, lightGroup: this._lightGroupOf(rSd.sector)});
            }

            // Upper wall from left side (same door rule, mirrored)
            if (rCh < lCh && !rIsDoor && !ceilSky && !isSwitchFace('left', 'upper')) {
                const ti = this._bank.ensureWallTex(lSd.upper);
                const {width: tw, height: th} = ((ti < 0) ? {width: 128, height: 128} : this._bank.getDims(ti));
                const yo = lSd.yo + ((upperUnpeg) ? 0 : (th - (lCh - rCh)));
                WadMeshBuilder.addWallQuad(mesh, ti,
                    wx1, wz1, wx2, wz2,
                    rCh * SCALE, lCh * SCALE,
                    wallLen, tw, th,
                    {xOff: lSd.xo, yOff: yo, flip: false, light: lSec.light, lightGroup: this._lightGroupOf(lSd.sector)});
            }

            this._buildMiddleWalls(mesh, ld, rSd, rSec, lSd, lSec, wx1, wz1, wx2, wz2, wallLen, swWall);

            // ML_BLOCKING two-sided line (windows, balustrades): impassable
            // for players and monsters whatever the opening heights, shots
            // and projectiles exempt (PIT_CheckLine, p_map.c). A door side
            // uses its OPEN ceiling: the flag still blocks under a raised
            // panel (the sector's static ch is the closed height).
            if ((ld.flags & WadConstants.ML_BLOCKING) !== 0) {
                const rChEff = ((rIsDoor && doorHeights[rSd.sector] !== undefined) ? doorHeights[rSd.sector].ceilH : rCh);
                const lChEff = ((lIsDoor && doorHeights[lSd.sector] !== undefined) ? doorHeights[lSd.sector].ceilH : lCh);
                this._buildBlockingWall(mesh, rFh, rChEff, lFh, lChEff, wx1, wz1, wx2, wz2, wallLen);
            }
        }
    }

    // Middle textures: transparent fence/grating, rendered from both sides,
    // shown exactly once (no vertical tiling). Without ML_BLOCKING it is a
    // "false wall": visible but passable.
    _buildMiddleWalls(mesh, ld, rSd, rSec, lSd, lSec, wx1, wz1, wx2, wz2, wallLen, swWall) {
        const {doorSectorIds} = this._analysis;
        const SCALE = WadConstants.SCALE;

        const lowerUnpeg = ((ld.flags & WadConstants.ML_DONTPEGBOTTOM) !== 0);
        const midPassableUser  = ((ld.flags & WadConstants.ML_BLOCKING) === 0);
        const midPassableEnemy = (midPassableUser && ((ld.flags & WadConstants.ML_BLOCKMONSTERS) === 0));

        const rFh = rSec.fh;
        const rCh = rSec.ch;
        const lFh = lSec.fh;
        const lCh = lSec.ch;

        for (const [mSd, mSec, otherSec, side] of [[rSd, rSec, lSec, 'right'], [lSd, lSec, rSec, 'left']]) {
            if ((swWall !== null) && (swWall.side === side) && (swWall.slot === 'middle')) {
                continue;
            }
            if (!(mSd.middle && mSd.middle !== '-')) {
                continue;
            }
            if (doorSectorIds.has(mSd.sector)) {
                continue;
            }
            const ti = this._bank.ensureWallTex(mSd.middle);
            if (ti < 0) {
                continue;
            }
            const {width: tw, height: th} = this._bank.getDims(ti);
            const botDu = Math.max(rFh, lFh);
            const topDu = Math.min(rCh, lCh);
            if (topDu <= botDu) {
                continue;
            }

            let ybot;
            let ytop;
            let yo;
            if (lowerUnpeg) {
                // DONTPEGBOTTOM: texture bottom anchored at floor, extends upward once
                ybot = botDu;
                ytop = Math.min(topDu, botDu + th);
                yo = mSd.yo + (th - (ytop - ybot));
            } else {
                // Default: texture top anchored at ceiling, hangs down once
                ytop = topDu;
                ybot = Math.max(botDu, topDu - th);
                yo = mSd.yo;
            }
            if (ytop <= ybot) {
                continue;
            }

            // Scrolling wall (48): only the FRONT (right) sidedef's offset is
            // animated in vanilla — both flip quads show that same texture
            const uScroll = ((side === 'right') ? (WadConstants.SCROLL_WALL_BY_SPECIAL[ld.special] ?? 0) : 0);

            // Shots never test middle textures in vanilla (P_ShootTraverse
            // only checks the line opening)
            WadMeshBuilder.addWallQuad(mesh, ti,
                wx1, wz1, wx2, wz2,
                ybot * SCALE, ytop * SCALE,
                wallLen, tw, th,
                {xOff: mSd.xo, yOff: yo, flip: true, light: mSec.light, clampV: true,
                 passableUser: midPassableUser, passableEnemy: midPassableEnemy, passableShot: true, uScrollTexelsPerSec: uScroll});
            WadMeshBuilder.addWallQuad(mesh, ti,
                wx1, wz1, wx2, wz2,
                ybot * SCALE, ytop * SCALE,
                wallLen, tw, th,
                {xOff: mSd.xo, yOff: yo, flip: false, light: otherSec.light, clampV: true,
                 passableUser: midPassableUser, passableEnemy: midPassableEnemy, passableShot: true, uScrollTexelsPerSec: uScroll});
            break;   // both sides already covered by the flip pair above
        }
    }

    // Collision-only quad over the whole opening band of an ML_BLOCKING line.
    // Also emitted over a blocking middle texture: the texture covers its own
    // height only, the flag blocks the full gap. A single facing is enough —
    // the wall resolution is side-agnostic and the raycast skips the face.
    _buildBlockingWall(mesh, rFh, rCh, lFh, lCh, wx1, wz1, wx2, wz2, wallLen) {
        const SCALE = WadConstants.SCALE;
        const botDu = Math.max(rFh, lFh);
        const topDu = Math.min(rCh, lCh);
        if (topDu <= botDu) {
            return;
        }
        // 64×64 = dummy texture dims (only there to pass the addWallQuad
        // guard; the UVs are dropped on a textureless face)
        WadMeshBuilder.addWallQuad(mesh, -1,
            wx1, wz1, wx2, wz2,
            botDu * SCALE, topDu * SCALE,
            wallLen, 64, 64,
            {collisionOnly: true, passableShot: true});
    }

    // --- Flats ---

    _buildFlats(mesh) {
        const {vertexes, linedefs, sidedefs, sectors} = this._level;
        const {doorSectorIds, movingFloorDownIds, risingFloorIds, stairIds} = this._analysis;

        for (let si = 0; si < sectors.length; si++) {
            const sec = sectors[si];
            const polys = WadSectorPolygons.outersWithHoles(si, linedefs, sidedefs, vertexes);
            if (polys.length === 0) {
                continue;
            }

            if (doorSectorIds.has(si)) {
                // Ceiling-raiser also claimed as a moving floor (40): the lift's
                // moving top-flat covers the floor — only the ceiling side is
                // door-handled, so skip the static floor flat (z-fighting).
                if (!movingFloorDownIds.has(si)) {
                    this._buildDoorSectorFlat(mesh, si, sec, polys);
                }
                continue;
            }

            const floorSky = sec.ft.startsWith('F_SKY');
            const ft = ((floorSky) ? -1 : this._bank.ensureFlatTex(sec.ft));
            const hasSky = sec.ct.startsWith('F_SKY');
            const ct = ((hasSky) ? -1 : this._bank.ensureFlatTex(sec.ct));

            // Visual eastward flat drift (Heretic scrolling lava / east
            // conveyors): map units per tic → UV fraction per second (a flat
            // texel = 1 map unit, 64 per tile); negative offset = the pattern
            // flows toward +x (east).
            const flatScroll = (WadConstants.SECTOR_FLAT_SCROLL_BY_SPECIAL[sec.special] ?? 0);
            const uScroll    = ((flatScroll !== 0) ? (-flatScroll / WadConstants.SECONDS_PER_TIC / 64) : 0);

            for (const p of polys) {
                // Skip the static floor for lifts, rising floors AND stairs — in
                // every case a moving top-flat covers it (otherwise z-fighting).
                if (!movingFloorDownIds.has(si) && !risingFloorIds.has(si) && !stairIds.has(si)) {
                    if (floorSky) {
                        // Sky floor (MAP20's exit pit): vanilla draws the SKY
                        // there (R_Subsector floorpic == skyflatnum) — the flat
                        // stays solid but invisible, the sky shows through.
                        WadMeshBuilder.addFlatQuad(mesh, -1, p.outer, sec.fh, true, sec.light, p.holes, null, 0, true);
                    } else if (ft >= 0) {
                        WadMeshBuilder.addFlatQuad(mesh, ft, p.outer, sec.fh, true, sec.light, p.holes, this._lightGroupOf(si), uScroll);
                    }
                }
                // Sky flats skipped — outdoor areas have no ceiling geometry
                if (ct >= 0) {
                    WadMeshBuilder.addFlatQuad(mesh, ct, p.outer, sec.ch, false, sec.light, p.holes, this._lightGroupOf(si));
                }
            }
        }
    }

    // Door sector: floor only. sec.fh was already patched by the analyzer to the
    // door's effective floor (max of own fh and the lowest walkable neighbour),
    // so the threshold sits at its real height and the step up to it is rendered
    // as a riser on the door line. The ceiling is omitted — the door instance
    // covers it.
    _buildDoorSectorFlat(mesh, si, sec, polys) {
        const ft = this._bank.ensureFlatTex(sec.ft);
        if (ft < 0) {
            return;
        }

        for (const p of polys) {
            WadMeshBuilder.addFlatQuad(mesh, ft, p.outer, sec.fh, true, sec.light, p.holes, this._lightGroupOf(si));
        }
    }
}
