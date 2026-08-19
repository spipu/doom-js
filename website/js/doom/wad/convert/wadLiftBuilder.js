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

        WadMeshBuilder.addSectorTopFlat(mesh, this._level, this._bank, this._analysis, si, origFh);
        // The riser band must span the full travel amplitude: when the plat
        // sits at its highest point (maxFh, or a raise-cycle top above it),
        // its skirt still has to reach down to minFh.
        const raiseTops  = Object.values(this._analysis.liftRaiseVariants[si] ?? {}).map((r) => r.targetFh);
        const highestFh  = Math.max(maxFh, ...raiseTops);
        this._buildRisers(mesh, si, origFh, origFh - (highestFh - minFh));

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

            const ownSd        = sidedefs[((liftOnRight) ? ld.right : ld.left)];
            const neighbourSd  = sidedefs[((liftOnRight) ? ld.left : ld.right)];
            const neighbourSec = sectors[((liftOnRight) ? lSi2 : rSi2)];

            // Texture: neighbour lower first, then own lower. Record the source
            // sidedef (for xo/yo) and its sector (for light/ch). null = bare edge.
            let tex    = validLower(neighbourSd);
            let srcSd  = neighbourSd;
            let srcSec = neighbourSec;
            let srcSi  = ((liftOnRight) ? lSi2 : rSi2);
            if (tex === null) {
                tex    = validLower(ownSd);
                srcSd  = ownSd;
                srcSec = sectors[si];
                srcSi  = si;
            }
            if ((tex !== null) && (fallbackTex === null)) {
                fallbackTex = tex;
            }

            const [dx1, dy1] = vertexes[ld.v1];
            const [dx2, dy2] = vertexes[ld.v2];
            const [wx1, wz1] = WadGeometry.doomToWorld(dx1, dy1);
            const [wx2, wz2] = WadGeometry.doomToWorld(dx2, dy2);
            edges.push({
                tex, srcSd, srcSec, srcSi,
                wx1, wz1, wx2, wz2,
                wallLen: WadGeometry.wallLengthDoom(vertexes, ld.v1, ld.v2),
                lowerUnpeg: ((ld.flags & WadConstants.ML_DONTPEGBOTTOM) !== 0),
                flip: !liftOnRight
            });
        }

        for (const e of edges) {
            const tex = ((e.tex !== null) ? e.tex : fallbackTex);
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
                {xOff: e.srcSd.xo, yOff: yo, flip: e.flip, light: e.srcSec.light, lightGroup: WadMapAnalyzer.lightGroupOf(this._analysis, e.srcSi)});
        }
    }

    _buildInstanceData(liftName, si, origFh, minFh, maxFh, mesh) {
        const special = this._analysis.liftSectorSpecial[si] ?? 88;
        const floor   = WadConstants.FLOOR_DOWN_BY_SPECIAL[special];
        const speed   = floor.speed;

        const radius = WadMeshBuilder.xzActionRadius(mesh);

        const travelY = (origFh - minFh) * WadConstants.SCALE;
        const moveS   = WadConstants.moveDurationS(origFh - minFh, speed);
        const waitS   = WadConstants.LIFT_WAIT_TICS * WadConstants.SECONDS_PER_TIC;

        // Every floor-down element is driven externally (switch / walk zone),
        // never by self-proximity — the instance trigger is always 'none'.
        const anim     = floor.anim;
        const trigger  = 'none';
        const loop     = floor.loop;
        const onlyOnce = floor.onlyOnce;

        let keyframes;
        if (anim === 'perpetual') {
            // Looping cycle through the full low↔high amplitude, starting at
            // the rest position (down first, like most vanilla plats). Zero-
            // length segments (rest position AT an end of the travel) are
            // skipped to keep the keyframes strictly increasing.
            const relLow  = -(origFh - minFh) * WadConstants.SCALE;
            const relHigh = (maxFh - origFh) * WadConstants.SCALE;
            const downS   = WadConstants.moveDurationS(origFh - minFh, speed);
            const fullS   = WadConstants.moveDurationS(maxFh - minFh, speed);
            const topS    = WadConstants.moveDurationS(maxFh - origFh, speed);
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
            keyframes = WadLiftBuilder._liftKeyframes(anim, 0, -travelY, moveS, waitS);
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
            // Lift blocked while rising = go back down and re-wait (T_PlatRaise)
            ...WadConstants.pressCycleFields(WadConstants.floorDownPressProfile(anim)),
            keyframes:         keyframes,
            keyframeVariants:  this._buildRaiseVariants(si, origFh, minFh, anim, speed, waitS),
            defaultVariant:    null
        };
    }

    // Timeline of the lift's own shape between two poses: a one-way lower
    // stays at the low end, a round-trip waits there and comes back up. The
    // base cycle runs it on 0 ↔ −travel, a ':then' cycle on the raised span.
    static _liftKeyframes(anim, topY, lowY, moveS, waitS) {
        if (anim === 'one-way') {
            return [
                {t: 0.0,   translate: [0, topY, 0], rotate: [0, 0, 0]},
                {t: moveS, translate: [0, lowY, 0], rotate: [0, 0, 0]}
            ];
        }
        const tUp = moveS + waitS + moveS;

        return [
            {t: 0.0,           translate: [0, topY, 0], rotate: [0, 0, 0]},
            {t: moveS,         translate: [0, lowY, 0], rotate: [0, 0, 0]},
            {t: moveS + waitS, translate: [0, lowY, 0], rotate: [0, 0, 0]},
            {t: tUp,           translate: [0, topY, 0], rotate: [0, 0, 0]},
            {t: tUp + 1.0,     translate: [0, topY, 0], rotate: [0, 0, 0]}
        ];
    }

    // Named raise cycles of a hybrid lift (analysis.liftRaiseVariants), one
    // pair per raise special: the raise leg, then a ':then' cycle on the
    // raised span that the completed raise installs as the new default — the
    // plain lift presses that follow run between the raised top and the low
    // point, since vanilla plats compute their high from the LIVE floor.
    _buildRaiseVariants(si, origFh, minFh, anim, speed, waitS) {
        const raises = this._analysis.liftRaiseVariants[si];
        if (raises === undefined) {
            return null;
        }
        const variants = {};
        for (const [key, raise] of Object.entries(raises)) {
            const thenKey = (key + ':then');
            variants[key]     = this._buildRaiseCycle(raise, origFh, thenKey);
            variants[thenKey] = this._buildPostRaiseCycle(raise, origFh, minFh, anim, speed, waitS);
        }

        return variants;
    }

    // The raise leg starts at the pose the analyzer baked (the lift's actual
    // resting pose — the pose gate of start() arbitrates), with the
    // rising-floor boarding delay. onlyOnce: a same-variant restart would
    // snap the floor back to the start pose.
    _buildRaiseCycle(raise, origFh, thenKey) {
        const SCALE  = WadConstants.SCALE;
        const startY = (raise.startFh - origFh) * SCALE;
        const endY   = (raise.targetFh - origFh) * SCALE;
        const moveS  = WadConstants.moveDurationS(raise.targetFh - raise.startFh, raise.speed);

        return {
            keyframes:          WadConstants.raiseLegKeyframes(startY, endY, moveS),
            onlyOnce:           true,
            loop:               false,
            nextDefaultVariant: thenKey,
            ...WadConstants.pressCycleFields(WadConstants.floorUpPressProfile(raise.special))
        };
    }

    // The lift's own shape replayed on the raised span (targetFh ↔ minFh) at
    // the lift's own speed. A round-trip starts and ends on the raised top, so
    // its same-variant replay is safe (first pose = last pose); a one-way
    // lower is once — its raise special re-arms it by switching cycles.
    _buildPostRaiseCycle(raise, origFh, minFh, anim, speed, waitS) {
        const SCALE = WadConstants.SCALE;
        const topY  = (raise.targetFh - origFh) * SCALE;
        const lowY  = (minFh - origFh) * SCALE;
        const moveS = WadConstants.moveDurationS(raise.targetFh - minFh, speed);

        return {
            keyframes: WadLiftBuilder._liftKeyframes(anim, topY, lowY, moveS, waitS),
            onlyOnce:  (anim === 'one-way'),
            loop:      false,
            ...WadConstants.pressCycleFields(WadConstants.floorDownPressProfile(anim))
        };
    }
}
