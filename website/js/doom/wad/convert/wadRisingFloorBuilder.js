/**
 * Rising floor instances builder: a floor that moves UP once toward its target
 * (one-way) when its walk-trigger zone or switch fires. Mirrors WadLiftBuilder,
 * but the static floor is NOT patched down — the moving top-flat sits at the
 * WAD floor height (origFh) and rises by +delta, where delta comes from the
 * target computed in the analysis (fixed +24/+32, lowest surrounding ceiling,
 * or next-higher floor — vanilla rules, see FLOOR_UP_BY_SPECIAL). The
 * riser is built as a "skirt" from origFh-delta to origFh: hidden below the
 * adjacent corridor floor at rest, it emerges as the origFh→origFh+delta step
 * once the floor has risen.
 */
class WadRisingFloorBuilder {
    /**
     * @param {object}           level
     * @param {object}           analysis
     * @param {WadTextureBank}   bank
     * @param {WadAnimationBank} animBank
     */
    constructor(level, analysis, bank, animBank) {
        this._level    = level;
        this._analysis = analysis;
        this._bank     = bank;
        this._animBank = animBank;
    }

    /**
     * @returns {object[]} [{code, textures (bank indices), mesh, instanceData}]
     */
    buildAll() {
        const result = [];
        const sortedIds = [...this._analysis.risingFloorIds].sort((a, b) => a - b);
        for (const si of sortedIds) {
            const floor = this._buildRisingFloor(si);
            if (floor !== null) {
                result.push(floor);
            }
        }

        return result;
    }

    // --- Internal ---

    _buildRisingFloor(si) {
        const sec     = this._level.sectors[si];
        const special = this._analysis.risingFloorSpecial[si] ?? 58;
        const origFh  = sec.fh;
        // Travel toward the target computed in the analysis (vanilla rules).
        const targetFh = this._analysis.risingFloorTargetFh[si] ?? (origFh + 24);
        const delta    = targetFh - origFh;
        // Skirt base: where the riser starts so that, once raised, it covers
        // exactly the origFh → origFh+delta step.
        const baseFh  = origFh - delta;

        const floorName = 'risingfloor_' + si;
        const mesh = WadMeshBuilder.newMesh();

        WadMeshBuilder.addSectorTopFlat(mesh, this._level, this._bank, this._analysis, si, origFh);
        this._buildRisers(mesh, si, origFh, baseFh);

        if (mesh.points.length === 0) {
            return null;
        }

        const localIndices = WadMeshBuilder.remapLocalTextures(mesh.faces);
        const groups = this._animBank.buildAnimGroups(localIndices);
        WadMeshBuilder.applyAnimMap(mesh.faces, groups.animMap);

        return {
            code:         floorName,
            textures:     groups.newList,
            mesh:         mesh,
            instanceData: this._buildInstanceData(floorName, special, delta, this._analysis.risingFloorInstantIds.has(si))
        };
    }

    // Side skirt: riser from baseFh to origFh, moves with the floor. Same
    // convention as the lifts: corridor sidedef lower texture + matching flip.
    _buildRisers(mesh, si, origFh, baseFh) {
        const {vertexes, linedefs, sidedefs, sectors} = this._level;
        const {risingFloorIds} = this._analysis;
        const SCALE = WadConstants.SCALE;

        for (const ld of linedefs) {
            if (ld.right < 0 || ld.left < 0) {
                continue;
            }
            const rSi2 = sidedefs[ld.right].sector;
            const lSi2 = sidedefs[ld.left].sector;
            if (rSi2 !== si && lSi2 !== si) {
                continue;
            }
            if (risingFloorIds.has(rSi2) && risingFloorIds.has(lSi2)) {
                continue;
            }

            const [dx1, dy1] = vertexes[ld.v1];
            const [dx2, dy2] = vertexes[ld.v2];
            const [wx1, wz1] = WadGeometry.doomToWorld(dx1, dy1);
            const [wx2, wz2] = WadGeometry.doomToWorld(dx2, dy2);
            const wallLen = WadGeometry.wallLengthDoom(vertexes, ld.v1, ld.v2);
            const lowerUnpeg = ((ld.flags & WadConstants.ML_DONTPEGBOTTOM) !== 0);

            if (rSi2 === si && !risingFloorIds.has(lSi2)) {
                const lSd2  = sidedefs[ld.left];
                const lSec2 = sectors[lSi2];
                const tex = lSd2.lower;
                if (!tex || tex === '-') {
                    continue;
                }
                const ti = this._bank.ensureWallTex(tex);
                if (ti < 0) {
                    continue;
                }
                const {width: tw, height: th} = this._bank.getDims(ti);
                const yo = lSd2.yo + ((lowerUnpeg) ? (lSec2.ch - origFh) : 0);
                WadMeshBuilder.addWallQuad(mesh, ti,
                    wx1, wz1, wx2, wz2,
                    baseFh * SCALE, origFh * SCALE,
                    wallLen, tw, th,
                    {xOff: lSd2.xo, yOff: yo, flip: false, light: lSec2.light, lightGroup: WadMapAnalyzer.lightGroupOf(this._analysis, lSi2)});
            } else if (lSi2 === si && !risingFloorIds.has(rSi2)) {
                const rSd2  = sidedefs[ld.right];
                const rSec2 = sectors[rSi2];
                const tex = rSd2.lower;
                if (!tex || tex === '-') {
                    continue;
                }
                const ti = this._bank.ensureWallTex(tex);
                if (ti < 0) {
                    continue;
                }
                const {width: tw, height: th} = this._bank.getDims(ti);
                const yo = rSd2.yo + ((lowerUnpeg) ? (rSec2.ch - origFh) : 0);
                WadMeshBuilder.addWallQuad(mesh, ti,
                    wx1, wz1, wx2, wz2,
                    baseFh * SCALE, origFh * SCALE,
                    wallLen, tw, th,
                    {xOff: rSd2.xo, yOff: yo, flip: true, light: rSec2.light, lightGroup: WadMapAnalyzer.lightGroupOf(this._analysis, rSi2)});
            }
        }
    }

    _buildInstanceData(floorName, special, delta, instant = false) {
        const travelY = delta * WadConstants.SCALE;

        // One-way, upward. Driven externally (walk-trigger zone or switch),
        // never by self-proximity. onlyOnce stays true even for WR/SR specials:
        // a one-way floor that reached its target must not replay from the
        // start (vanilla: re-triggering a raised floor does nothing); the
        // repeatable part lives on the zone/switch, whose extra start() calls
        // are harmless (idempotent).
        let keyframes;
        if (instant) {
            // Vanilla instant-raise (EV_DoFloor lower toward a destination
            // ABOVE the floor: T_MovePlane jumps to it on the first tic) —
            // the pop-up bridge trick. One tic, no walk-up pre-frame.
            keyframes = [
                {t: 0.0,                          translate: [0, 0, 0],       rotate: [0, 0, 0]},
                {t: WadConstants.SECONDS_PER_TIC, translate: [0, travelY, 0], rotate: [0, 0, 0]}
            ];
        } else {
            // A static pre-frame delays the raise so the player can step onto
            // the platform (FLOOR_UP_START_DELAY_S).
            const speed = WadConstants.FLOOR_UP_BY_SPECIAL[special].speed;
            keyframes = WadConstants.raiseLegKeyframes(0, travelY, WadConstants.moveDurationS(delta, speed));
        }

        const press = WadConstants.floorUpPressProfile(special);

        return {
            code:              floorName,
            position:          [0, 0, 0],
            rotation:          [0, 0, 0],
            trigger:           'none',
            loop:              false,
            onlyOnce:          true,
            collisionShape:    'faces',
            interactionRadius: null,
            damage:            null,
            ...WadConstants.pressCycleFields(press),
            keyframes:         keyframes
        };
    }
}
