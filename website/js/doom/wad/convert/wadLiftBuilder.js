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
        const {liftOriginalFh, liftMinAdjFh, liftMaxAdjFh, liftSectorSpecial} = this._analysis;
        const sec    = this._level.sectors[si];
        const origFh = liftOriginalFh[si];
        const minFh  = liftMinAdjFh[si];

        // High end of the travel: origFh for ordinary lifts (they never rise
        // above their rest position), highest surrounding floor for perpetual
        // plats (which may start at their LOW end and travel upward).
        const isPerpetual = WadConstants.FLOOR_PERPETUAL_SPECIALS.has(liftSectorSpecial[si]);
        const maxFh = ((isPerpetual) ? liftMaxAdjFh[si] : origFh);

        if (maxFh <= minFh) {
            return null;
        }

        const liftName = 'lift_' + si;
        const mesh = WadMeshBuilder.newMesh();

        this._buildTopFlat(mesh, si, sec, origFh);
        // The riser band must span the full travel amplitude: when the plat
        // sits at maxFh, its skirt still has to reach down to minFh.
        this._buildRisers(mesh, si, origFh, origFh - (maxFh - minFh));

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
            instanceData: this._buildInstanceData(liftName, si, origFh, minFh, maxFh, mesh)
        };
    }

    // Top flat: floor surface of the platform at its original height.
    // Holes preserved (a ring-shaped platform must not cover the inner sector).
    _buildTopFlat(mesh, si, sec, origFh) {
        const {vertexes, linedefs, sidedefs} = this._level;

        const ft = this._bank.ensureFlatTex(sec.ft);
        if (ft < 0) {
            return;
        }

        for (const p of WadSectorPolygons.outersWithHoles(si, linedefs, sidedefs, vertexes)) {
            WadMeshBuilder.addFlatQuad(mesh, ft, p.outer, origFh, true, sec.light, p.holes);
        }
    }

    // Side walls: a riser (minFh → origFh) on EVERY two-sided perimeter edge of
    // the lift, moving with the platform — the lift is a self-contained box, not
    // dependent on its neighbours. Texture priority per edge: the neighbour
    // sidedef's lower (preserves the shaft look, no regression), else the lift's
    // own sidedef lower, else a sibling edge's texture (so a bare shared edge
    // between two lifts still gets a wall). Two passes: resolve, then emit with
    // the fallback filled in. One-sided edges stay handled by the static map.
    _buildRisers(mesh, si, origFh, riserBaseFh) {
        const {vertexes, linedefs, sidedefs, sectors} = this._level;
        const SCALE = WadConstants.SCALE;

        // A usable lower texture name on a sidedef, or null.
        const validLower = (sd) => {
            if (!sd || !sd.lower || sd.lower === '-') {
                return null;
            }
            return ((this._bank.ensureWallTex(sd.lower) >= 0) ? sd.lower : null);
        };

        const edges = [];
        let fallbackTex = null;

        for (const ld of linedefs) {
            if (ld.right < 0 || ld.left < 0) {
                continue;
            }
            const rSi2 = sidedefs[ld.right].sector;
            const lSi2 = sidedefs[ld.left].sector;
            const liftOnRight = (rSi2 === si);
            const liftOnLeft  = (lSi2 === si);
            if (!liftOnRight && !liftOnLeft) {
                continue;
            }

            const ownSd      = sidedefs[liftOnRight ? ld.right : ld.left];
            const neighborSd  = sidedefs[liftOnRight ? ld.left : ld.right];
            const neighborSec = sectors[liftOnRight ? lSi2 : rSi2];

            // Texture: neighbour lower first, then own lower. Record the source
            // sidedef (for xo/yo) and its sector (for light/ch). null = bare edge.
            let tex = validLower(neighborSd);
            let srcSd = neighborSd;
            let srcSec = neighborSec;
            if (tex === null) {
                tex = validLower(ownSd);
                srcSd = ownSd;
                srcSec = sectors[si];
            }
            if ((tex !== null) && (fallbackTex === null)) {
                fallbackTex = tex;
            }

            const [dx1, dy1] = vertexes[ld.v1];
            const [dx2, dy2] = vertexes[ld.v2];
            const [wx1, wz1] = WadGeometry.doomToWorld(dx1, dy1);
            const [wx2, wz2] = WadGeometry.doomToWorld(dx2, dy2);
            edges.push({
                tex, srcSd, srcSec,
                wx1, wz1, wx2, wz2,
                wallLen: WadGeometry.wallLengthDoom(vertexes, ld.v1, ld.v2),
                lowerUnpeg: ((ld.flags & WadConstants.ML_DONTPEGBOTTOM) !== 0),
                flip: !liftOnRight   // lift on right → flip=false, on left → true
            });
        }

        for (const e of edges) {
            const tex = (e.tex !== null) ? e.tex : fallbackTex;
            if (tex === null) {
                continue;   // no texture anywhere on this lift — skip (very rare)
            }
            const ti = this._bank.ensureWallTex(tex);
            if (ti < 0) {
                continue;
            }
            const {width: tw, height: th} = this._bank.getDims(ti);
            const yo = e.srcSd.yo + ((e.lowerUnpeg) ? (e.srcSec.ch - origFh) : 0);
            WadMeshBuilder.addWallQuad(mesh, ti,
                e.wx1, e.wz1, e.wx2, e.wz2,
                riserBaseFh * SCALE, origFh * SCALE,
                e.wallLen, tw, th,
                {xOff: e.srcSd.xo, yOff: yo, flip: e.flip, light: e.srcSec.light});
        }
    }

    _buildInstanceData(liftName, si, origFh, minFh, maxFh, mesh) {
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
        } else if (anim === 'perpetual') {
            // Looping cycle through the full low↔high amplitude, starting at
            // the rest position (down first, like most vanilla plats). Zero-
            // length segments (rest position AT an end of the travel) are
            // skipped to keep the keyframes strictly increasing.
            const relLow  = -(origFh - minFh) * WadConstants.SCALE;
            const relHigh = (maxFh - origFh) * WadConstants.SCALE;
            const downS   = (origFh - minFh) / (speed * 35.0);
            const fullS   = (maxFh - minFh) / (speed * 35.0);
            const topS    = (maxFh - origFh) / (speed * 35.0);
            let t = 0.0;
            keyframes = [{t: t, translate: [0, 0, 0], rotate: [0, 0, 0]}];
            if (downS > 0) {
                t += downS;
                keyframes.push({t: t, translate: [0, relLow, 0], rotate: [0, 0, 0]});
            }
            t += waitS;
            keyframes.push({t: t, translate: [0, relLow, 0], rotate: [0, 0, 0]});
            t += fullS;
            keyframes.push({t: t, translate: [0, relHigh, 0], rotate: [0, 0, 0]});
            t += waitS;
            keyframes.push({t: t, translate: [0, relHigh, 0], rotate: [0, 0, 0]});
            if (topS > 0) {
                t += topS;
                keyframes.push({t: t, translate: [0, 0, 0], rotate: [0, 0, 0]});
            }
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
            code:              liftName,
            position:          [0, 0, 0],
            rotation:          [0, 0, 0],
            trigger:           trigger,
            loop:              loop,
            onlyOnce:          onlyOnce,
            collisionShape:    'faces',
            interactionRadius: ((trigger === 'none') ? null : radius),
            damage:            null,
            keyframes:         keyframes
        };
    }
}
