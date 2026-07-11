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

            const ownSd      = sidedefs[((liftOnRight) ? ld.right : ld.left)];
            const neighborSd  = sidedefs[((liftOnRight) ? ld.left : ld.right)];
            const neighborSec = sectors[((liftOnRight) ? lSi2 : rSi2)];

            // Texture: neighbour lower first, then own lower. Record the source
            // sidedef (for xo/yo) and its sector (for light/ch). null = bare edge.
            let tex = validLower(neighborSd);
            let srcSd = neighborSd;
            let srcSec = neighborSec;
            let srcSi = ((liftOnRight) ? lSi2 : rSi2);
            if (tex === null) {
                tex = validLower(ownSd);
                srcSd = ownSd;
                srcSec = sectors[si];
                srcSi = si;
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
                flip: !liftOnRight   // lift on right → flip=false, on left → true
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
        const moveS   = (origFh - minFh) / (speed * 35.0);
        const waitS   = WadConstants.LIFT_WAIT_TICS / 35.0;

        // Every floor-down element is driven externally (switch / walk zone),
        // never by self-proximity — the instance trigger is always 'none'.
        const anim     = floor.anim;
        const trigger  = 'none';
        const loop     = floor.loop;
        const onlyOnce = floor.onlyOnce;

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
