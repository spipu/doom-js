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

        // The map references the whole bank built so far: its faces already hold
        // global indices.
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
        const {doorSectorIds, doorHeights, switchLinedefIds, switchWalls, floorMovers} = this._analysis;
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

            const rSd     = sidedefs[ld.right];
            const rSec    = sectors[rSd.sector];
            const rIsDoor = doorSectorIds.has(rSd.sector);

            // Scrolling wall (48): vanilla scrolls the front sidedef only.
            const uScroll = (WadConstants.SCROLL_WALL_BY_SPECIAL[ld.special] ?? 0);

            if (ld.left < 0) {
                this._buildOneSidedJumpGuard(mesh, rSd.sector, wx1, wz1, wx2, wz2, wallLen);
                if (switchLinedefIds.has(ldIdx)) {
                    continue;
                }
                if (rIsDoor) {
                    // Door track (DOORTRAK)
                    if (doorHeights[rSd.sector] === undefined) {
                        continue;
                    }
                    const {floorH, ceilH} = doorHeights[rSd.sector];
                    const texName = rSd.middle;
                    if (WadTextureBank.isBlank(texName)) {
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
                const texName = rSd.middle;
                const ti = this._bank.ensureWallTex(texName);
                if (ti >= 0) {
                    const {width: tw, height: th} = this._bank.getDims(ti);
                    const uv = WadMeshBuilder.floorPeggedWallUv(ld, rSd, rSec, rSec.ch, floorMovers, th);
                    WadMeshBuilder.addWallQuad(mesh, ti,
                        wx1, wz1, wx2, wz2,
                        rSec.fh * SCALE, rSec.ch * SCALE,
                        wallLen, tw, th,
                        {xOff: rSd.xo, yOff: uv.yOff, flip: true, light: rSec.light, uScrollTexelsPerSec: uScroll, lightGroup: this._lightGroupOf(rSd.sector),
                            uvAnchor: uv.uvAnchor});
                }
                continue;
            }

            const lSd     = sidedefs[ld.left];
            const lSec    = sectors[lSd.sector];
            const lIsDoor = doorSectorIds.has(lSd.sector);

            // The switch builder rebuilds the switch face.
            const switchWall = switchWalls.get(ldIdx) ?? null;
            const isSwitchFace = (side, slot) => ((switchWall !== null) && (switchWall.side === side) && (switchWall.slot === slot));

            const rFh = rSec.fh;
            const rCh = rSec.ch;
            const lFh = lSec.fh;
            const lCh = lSec.ch;

            const upperUnpeg = ((ld.flags & WadConstants.ML_DONTPEGTOP) !== 0);
            const lowerUnpeg = ((ld.flags & WadConstants.ML_DONTPEGBOTTOM) !== 0);

            // Doom sky rule: no upper wall between two sky ceilings.
            const bothCeilingsSky = (WadConstants.isSkyFlat(rSec.ct) && WadConstants.isSkyFlat(lSec.ct));

            // Lower walls are built on door lines too: a door on a step up needs
            // its riser. Upper walls are left to the door panel.
            if ((lFh > rFh) && !isSwitchFace('right', 'lower')) {
                const tex = this._wallTexOrFlat(rSd.lower, lSec.ft);
                if (tex !== null) {
                    // Lower-unpegged: the texture hangs from the front ceiling.
                    const yo = rSd.yo + ((lowerUnpeg) ? (rCh - lFh) : 0);
                    WadMeshBuilder.addWallQuad(mesh, tex.index,
                        wx1, wz1, wx2, wz2,
                        rFh * SCALE, lFh * SCALE,
                        wallLen, tex.width, tex.height,
                        {xOff: rSd.xo, yOff: yo, flip: true, light: rSec.light, uScrollTexelsPerSec: uScroll, lightGroup: this._lightGroupOf(rSd.sector)});
                }
            }

            if ((rFh > lFh) && !isSwitchFace('left', 'lower')) {
                const tex = this._wallTexOrFlat(lSd.lower, rSec.ft);
                if (tex !== null) {
                    const yo = lSd.yo + ((lowerUnpeg) ? (lCh - rFh) : 0);
                    WadMeshBuilder.addWallQuad(mesh, tex.index,
                        wx1, wz1, wx2, wz2,
                        lFh * SCALE, rFh * SCALE,
                        wallLen, tex.width, tex.height,
                        {xOff: lSd.xo, yOff: yo, flip: false, light: lSec.light, lightGroup: this._lightGroupOf(lSd.sector)});
                }
            }

            // Skipped only when the low-ceiling side is a door (its panel covers
            // the band); a door on the tall side keeps a static wall.
            if ((lCh < rCh) && !lIsDoor && !bothCeilingsSky && !isSwitchFace('right', 'upper')) {
                const tex = this._wallTexOrFlat(rSd.upper, lSec.ct);
                if (tex !== null) {
                    // Default: bottom of texture at lower ceiling. DONTPEGTOP: top of texture at higher ceiling.
                    const yo = rSd.yo + ((upperUnpeg) ? 0 : (tex.height - (rCh - lCh)));
                    WadMeshBuilder.addWallQuad(mesh, tex.index,
                        wx1, wz1, wx2, wz2,
                        lCh * SCALE, rCh * SCALE,
                        wallLen, tex.width, tex.height,
                        {xOff: rSd.xo, yOff: yo, flip: true, light: rSec.light, uScrollTexelsPerSec: uScroll, lightGroup: this._lightGroupOf(rSd.sector)});
                }
            }

            if ((rCh < lCh) && !rIsDoor && !bothCeilingsSky && !isSwitchFace('left', 'upper')) {
                const tex = this._wallTexOrFlat(lSd.upper, rSec.ct);
                if (tex !== null) {
                    const yo = lSd.yo + ((upperUnpeg) ? 0 : (tex.height - (lCh - rCh)));
                    WadMeshBuilder.addWallQuad(mesh, tex.index,
                        wx1, wz1, wx2, wz2,
                        rCh * SCALE, lCh * SCALE,
                        wallLen, tex.width, tex.height,
                        {xOff: lSd.xo, yOff: yo, flip: false, light: lSec.light, lightGroup: this._lightGroupOf(lSd.sector)});
                }
            }

            if (!rIsDoor && !lIsDoor) {
                this._buildUpperJumpGuard(mesh, rSec, lSec, wx1, wz1, wx2, wz2, wallLen);
            }

            this._buildMiddleWalls(mesh, ld, rSd, rSec, lSd, lSec, wx1, wz1, wx2, wz2, wallLen, switchWall);

            // ML_BLOCKING stops walkers at any height, not shots (PIT_CheckLine);
            // a door side uses its open ceiling, its static ch being the closed one.
            if ((ld.flags & WadConstants.ML_BLOCKING) !== 0) {
                const rChEff = ((rIsDoor && (doorHeights[rSd.sector] !== undefined)) ? doorHeights[rSd.sector].ceilH : rCh);
                const lChEff = ((lIsDoor && (doorHeights[lSd.sector] !== undefined)) ? doorHeights[lSd.sector].ceilH : lCh);
                this._buildBlockingWall(mesh, rFh, rChEff, lFh, lChEff, wx1, wz1, wx2, wz2, wallLen);
            }
        }
    }

    // Upper/lower texture, else the GZDoom texture fill: the flat of the sector
    // across the line (a HOM in vanilla); a sky flat leaves the gap to the dome.
    _wallTexOrFlat(wallName, flatName) {
        const wallIndex = this._bank.ensureWallTex(wallName);
        if (wallIndex >= 0) {
            return {index: wallIndex, ...this._bank.getDims(wallIndex)};
        }
        if (WadConstants.isSkyFlat(flatName)) {
            return null;
        }
        const flatIndex = this._bank.ensureFlatTex(flatName);
        if (flatIndex < 0) {
            return {index: -1, width: WadConstants.MISSING_TEXTURE_SIZE, height: WadConstants.MISSING_TEXTURE_SIZE};
        }
        return {index: flatIndex, ...this._bank.getDims(flatIndex)};
    }

    // Middle textures: shown once (no vertical tiling), from the side whose
    // sidedef carries it only, like vanilla. Without ML_BLOCKING: a passable
    // "false wall".
    _buildMiddleWalls(mesh, ld, rSd, rSec, lSd, lSec, wx1, wz1, wx2, wz2, wallLen, switchWall) {
        const {doorSectorIds} = this._analysis;
        const SCALE = WadConstants.SCALE;

        const lowerUnpeg       = ((ld.flags & WadConstants.ML_DONTPEGBOTTOM) !== 0);
        const midPassableUser  = ((ld.flags & WadConstants.ML_BLOCKING) === 0);
        const midPassableEnemy = (midPassableUser && ((ld.flags & WadConstants.ML_BLOCKMONSTERS) === 0));

        const rFh = rSec.fh;
        const rCh = rSec.ch;
        const lFh = lSec.fh;
        const lCh = lSec.ch;

        for (const [mSd, mSec, side] of [[rSd, rSec, 'right'], [lSd, lSec, 'left']]) {
            if ((switchWall !== null) && (switchWall.side === side) && (switchWall.slot === 'middle')) {
                continue;
            }
            if (WadTextureBank.isBlank(mSd.middle)) {
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
                ybot = botDu;
                ytop = Math.min(topDu, botDu + th);
                yo = mSd.yo + (th - (ytop - ybot));
            } else {
                ytop = topDu;
                ybot = Math.max(botDu, topDu - th);
                yo = mSd.yo;
            }
            if (ytop <= ybot) {
                continue;
            }

            const uScroll = ((side === 'right') ? (WadConstants.SCROLL_WALL_BY_SPECIAL[ld.special] ?? 0) : 0);

            // Shots never test middle textures (P_ShootTraverse checks the opening only).
            WadMeshBuilder.addWallQuad(mesh, ti,
                wx1, wz1, wx2, wz2,
                ybot * SCALE, ytop * SCALE,
                wallLen, tw, th,
                {xOff: mSd.xo, yOff: yo, flip: (side === 'right'), light: mSec.light, clampV: true,
                 passableUser: midPassableUser, passableEnemy: midPassableEnemy, passableShot: true,
                 uScrollTexelsPerSec: uScroll, lightGroup: this._lightGroupOf(mSd.sector)});
        }
    }

    // Collision-only quad over the whole opening band of an ML_BLOCKING line.
    // Also emitted over a blocking middle texture: the texture covers its own
    // height only, the flag blocks the full gap. A single facing is enough —
    // the wall resolution is side-agnostic and the raycast skips the face.
    _buildBlockingWall(mesh, rFh, rCh, lFh, lCh, wx1, wz1, wx2, wz2, wallLen) {
        const botDu = Math.max(rFh, lFh);
        const topDu = Math.min(rCh, lCh);
        if (topDu <= botDu) {
            return;
        }
        this._addCollisionBand(mesh, botDu, topDu, wx1, wz1, wx2, wz2, wallLen);
    }

    // A one-sided wall under a sky ceiling has nothing above it to cap a jump,
    // while vanilla blocks the line at any height (PIT_CheckLine): the guard
    // above its top keeps it out of the step exemption at the apex of a jump,
    // where only the void waits behind.
    _buildOneSidedJumpGuard(mesh, si, wx1, wz1, wx2, wz2, wallLen) {
        const sec = this._level.sectors[si];
        if (!WadConstants.isSkyFlat(sec.ct)) {
            return;
        }
        const {doorSectorIds, doorHeights} = this._analysis;
        const topDu = ((doorSectorIds.has(si)) ? (doorHeights[si]?.ceilH ?? null) : sec.ch);
        if (topDu === null) {
            return;
        }
        this._addJumpGuard(mesh, topDu, wx1, wz1, wx2, wz2, wallLen, true);
    }

    // Above the upper wall's top the low-ceiling side is rock: for a jump the
    // line caps like a one-sided wall, and only a sky on the tall side leaves
    // room to jump over it. Callers keep door lines out: their upper wall is
    // the panel, which rises.
    _buildUpperJumpGuard(mesh, rSec, lSec, wx1, wz1, wx2, wz2, wallLen) {
        if (rSec.ch === lSec.ch) {
            return;
        }
        const rightIsTall = (rSec.ch > lSec.ch);
        const tall        = ((rightIsTall) ? rSec : lSec);
        const low         = ((rightIsTall) ? lSec : rSec);
        if (!WadConstants.isSkyFlat(tall.ct) || WadConstants.isSkyFlat(low.ct)) {
            return;
        }
        this._addJumpGuard(mesh, tall.ch, wx1, wz1, wx2, wz2, wallLen, rightIsTall);
    }

    // Guard band above a wall top, oriented like the wall it caps.
    _addJumpGuard(mesh, topDu, wx1, wz1, wx2, wz2, wallLen, flip) {
        this._addCollisionBand(mesh, topDu, topDu + WadConstants.JUMP_GUARD_HEIGHT, wx1, wz1, wx2, wz2, wallLen, flip);
    }

    // Invisible, shot-transparent collision band; 64×64 only passes the
    // addWallQuad size guard, a textureless face has no UVs.
    _addCollisionBand(mesh, botDu, topDu, wx1, wz1, wx2, wz2, wallLen, flip = false) {
        const SCALE = WadConstants.SCALE;
        WadMeshBuilder.addWallQuad(mesh, -1,
            wx1, wz1, wx2, wz2,
            botDu * SCALE, topDu * SCALE,
            wallLen, 64, 64,
            {collisionOnly: true, passableShot: true, flip: flip});
    }

    // --- Flats ---

    _buildFlats(mesh) {
        const {sectors} = this._level;
        const {doorSectorIds, liftIds, risingFloorIds, stairIds} = this._analysis;

        for (let si = 0; si < sectors.length; si++) {
            const sec = sectors[si];

            if (doorSectorIds.has(si)) {
                // A ceiling raiser (40) is also a lift, whose top flat covers the floor.
                if (!liftIds.has(si)) {
                    this._buildDoorSectorFlat(mesh, si, sec);
                }
                continue;
            }

            const floorSky = WadConstants.isSkyFlat(sec.ft);
            const ft = ((floorSky) ? -1 : this._bank.ensureFlatTex(sec.ft));
            const ceilingSky = WadConstants.isSkyFlat(sec.ct);
            const ct = ((ceilingSky) ? -1 : this._bank.ensureFlatTex(sec.ct));

            // Heretic eastward flat scroll: map units per tic → UV per second
            // (64 units per tile); the negative sign makes it flow east.
            const flatScroll = (WadConstants.SECTOR_FLAT_SCROLL_BY_SPECIAL[sec.special] ?? 0);
            const uScroll    = ((flatScroll !== 0) ? (-flatScroll / WadConstants.SECONDS_PER_TIC / 64) : 0);

            // Floor movers draw their own top flat.
            if (!liftIds.has(si) && !risingFloorIds.has(si) && !stairIds.has(si)) {
                if (floorSky) {
                    // Sky floor (MAP20's exit pit): solid but invisible, vanilla
                    // draws the sky there (R_Subsector).
                    WadMeshBuilder.addSectorFlat(mesh, this._level, -1, si, sec.fh, true, sec.light, {collisionOnly: true});
                } else if (ft >= 0) {
                    WadMeshBuilder.addSectorFlat(mesh, this._level, ft, si, sec.fh, true, sec.light,
                        {lightGroup: this._lightGroupOf(si), uScroll: uScroll, noDecal: this._bank.isLiquidFlat(sec.ft)});
                }
            }
            if (ct >= 0) {
                WadMeshBuilder.addSectorFlat(mesh, this._level, ct, si, sec.ch, false, sec.light,
                    {lightGroup: this._lightGroupOf(si), noDecal: this._bank.isLiquidFlat(sec.ct)});
            }
        }
    }

    // Door sector: floor only (fh already patched by the analyzer), the door
    // instance covers the ceiling.
    _buildDoorSectorFlat(mesh, si, sec) {
        const ft = this._bank.ensureFlatTex(sec.ft);
        if (ft < 0) {
            return;
        }
        WadMeshBuilder.addSectorFlat(mesh, this._level, ft, si, sec.fh, true, sec.light,
            {lightGroup: this._lightGroupOf(si), noDecal: this._bank.isLiquidFlat(sec.ft)});
    }
}
