/**
 * Lift / moving floor instances builder (transposition of the lift generation
 * phase of convert_wad.py main()).
 */
class WadLiftBuilder {
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
        const sortedIds = [...this._analysis.movingFloorDownIds].sort((a, b) => a - b);
        for (const si of sortedIds) {
            const lift = this._buildLift(si);
            if (lift !== null) {
                result.push(lift);
            }
        }

        return result;
    }

    // --- Internal ---

    _buildLift(si) {
        const {liftOriginalFh, liftMinAdjFh} = this._analysis;
        const sec    = this._level.sectors[si];
        const origFh = liftOriginalFh[si];
        const minFh  = liftMinAdjFh[si];

        if (origFh <= minFh) {
            return null;
        }

        const liftName = 'lift_' + si;
        const mesh = WadMeshBuilder.newMesh();

        this._buildTopFlat(mesh, si, sec, origFh);
        this._buildRisers(mesh, si, origFh, minFh);

        if (mesh.points.length === 0) {
            return null;
        }

        const localIndices = WadMeshBuilder.remapLocalTextures(mesh.faces);
        const groups = this._animBank.buildAnimGroups(localIndices);
        WadMeshBuilder.applyAnimMap(mesh.faces, groups.animMap);

        return {
            code:         liftName,
            textures:     groups.newList,
            mesh:         mesh,
            instanceData: this._buildInstanceData(liftName, si, origFh, minFh, mesh)
        };
    }

    // Top flat: floor surface of the platform at its original height
    _buildTopFlat(mesh, si, sec, origFh) {
        const {vertexes, linedefs, sidedefs} = this._level;

        const ft = this._bank.ensureFlatTex(sec.ft);
        if (ft < 0) {
            return;
        }

        const chains = WadSectorPolygons.buildSectorPolygons(si, linedefs, sidedefs, vertexes);
        for (const chain of chains) {
            const polyDoom = chain.map((vi) => vertexes[vi]);
            WadMeshBuilder.addFlatQuad(mesh, ft, polyDoom, origFh, true, sec.light);
        }
    }

    // Side walls: riser from minFh to origFh, moves with the platform.
    // Same convention as the doors: corridor sidedef + matching flip.
    _buildRisers(mesh, si, origFh, minFh) {
        const {vertexes, linedefs, sidedefs, sectors} = this._level;
        const {doorSectorIds, movingFloorDownIds} = this._analysis;
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
            if (movingFloorDownIds.has(rSi2) && movingFloorDownIds.has(lSi2)) {
                continue;
            }

            const [dx1, dy1] = vertexes[ld.v1];
            const [dx2, dy2] = vertexes[ld.v2];
            const [wx1, wz1] = WadGeometry.doomToWorld(dx1, dy1);
            const [wx2, wz2] = WadGeometry.doomToWorld(dx2, dy2);
            const wallLen = WadGeometry.wallLengthDoom(vertexes, ld.v1, ld.v2);
            const lowerUnpeg = ((ld.flags & WadConstants.ML_DONTPEGBOTTOM) !== 0);

            if (rSi2 === si && !doorSectorIds.has(lSi2)) {
                // Lift on right, corridor on left — l_sd + flip=false
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
                    minFh * SCALE, origFh * SCALE,
                    wallLen, tw, th,
                    {xOff: lSd2.xo, yOff: yo, flip: false, light: lSec2.light});
            } else if (lSi2 === si && !doorSectorIds.has(rSi2)) {
                // Lift on left, corridor on right — r_sd + flip=true
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
                    minFh * SCALE, origFh * SCALE,
                    wallLen, tw, th,
                    {xOff: rSd2.xo, yOff: yo, flip: true, light: rSec2.light});
            }
        }
    }

    _buildInstanceData(liftName, si, origFh, minFh, mesh) {
        const special = this._analysis.liftSectorSpecial[si] ?? 88;
        const speed   = WadConstants.LIFT_SPEED_BY_SPECIAL[special] ?? 4;

        const xs = mesh.points.map((p) => p[0]);
        const zs = mesh.points.map((p) => p[2]);
        const dx = Math.max(...xs) - Math.min(...xs);
        const dz = Math.max(...zs) - Math.min(...zs);
        const radius = Math.sqrt(dx * dx + dz * dz) / 2.0 + WadConstants.DOOR_ACTION_RADIUS;

        const travelY = (origFh - minFh) * WadConstants.SCALE;
        const moveS   = (origFh - minFh) / (speed * 35.0);
        const waitS   = WadConstants.LIFT_WAIT_TICS / 35.0;

        const anim     = WadConstants.LIFT_ANIM_BY_SPECIAL[special] ?? 'round-trip';
        const trigger  = WadConstants.LIFT_TRIGGER_BY_SPECIAL[special] ?? 'action';
        const loop     = WadConstants.LIFT_LOOP_BY_SPECIAL[special] ?? false;
        const onlyOnce = WadConstants.LIFT_ONLY_ONCE_BY_SPECIAL[special] ?? false;

        let keyframes;
        if (anim === 'one-way') {
            keyframes = [
                {t: 0.0,   translate: [0, 0, 0],        rotate: [0, 0, 0]},
                {t: moveS, translate: [0, -travelY, 0], rotate: [0, 0, 0]}
            ];
        } else {
            const tRest = moveS + waitS + moveS;
            keyframes = [
                {t: 0.0,           translate: [0, 0, 0],        rotate: [0, 0, 0]},
                {t: moveS,         translate: [0, -travelY, 0], rotate: [0, 0, 0]},
                {t: moveS + waitS, translate: [0, -travelY, 0], rotate: [0, 0, 0]},
                {t: tRest,         translate: [0, 0, 0],        rotate: [0, 0, 0]},
                {t: tRest + 1.0,   translate: [0, 0, 0],        rotate: [0, 0, 0]}
            ];
        }

        return {
            code:       liftName,
            position:   [0, 0, 0],
            rotation:   [0, 0, 0],
            trigger:    trigger,
            loop:       loop,
            onlyOnce:   onlyOnce,
            collidable: true,
            radius:     ((trigger === 'none') ? null : radius),
            damage:     null,
            keyframes:  keyframes
        };
    }
}
