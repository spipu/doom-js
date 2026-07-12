/**
 * Stair instances builder (build-stairs specials 7/8/100/127). Each stair sector
 * found by WadMapAnalyzer._identifyStairs becomes ONE one-way rising-floor
 * instance (code 'stair_<si>') that rises from its WAD floor height to its
 * cumulated target height. Mirrors WadRisingFloorBuilder, with two differences:
 *  - the rise is a per-step absolute target (target - origFh), not a fixed delta;
 *  - risers ARE built on edges shared with other stair steps — the step that
 *    ends HIGHER owns the shared riser (so inter-step faces are drawn exactly
 *    once, no z-fighting). The riser quad is authored so that, once translated
 *    up by the step's travel, it spans [neighbour final floor, this target].
 *
 * Like rising floors, fh is NOT patched: the static floor of stair sectors is
 * dropped by WadStaticMapBuilder and the moving top-flat sits at the WAD height.
 * The instances are trigger:'none' — they are start()ed together by the switch
 * (7/127) or the walk-zone (8/100); the staggered travel gives the ripple.
 */
class WadStairBuilder {
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
        const sortedIds = [...this._analysis.stairIds].sort((a, b) => a - b);
        for (const si of sortedIds) {
            const stair = this._buildStair(si);
            if (stair !== null) {
                result.push(stair);
            }
        }

        return result;
    }

    // --- Internal ---

    _buildStair(si) {
        const sec     = this._level.sectors[si];
        const info    = this._analysis.stairInfo[si];
        const origFh  = sec.fh;
        const targetFh = info.targetFh;
        const delta   = targetFh - origFh;
        if (delta <= 0) {
            return null;
        }

        const stairName = 'stair_' + si;
        const mesh = WadMeshBuilder.newMesh();

        this._buildTopFlat(mesh, si, sec, origFh);
        this._buildStairRisers(mesh, si, origFh, targetFh, delta);

        if (mesh.points.length === 0) {
            return null;
        }

        const localIndices = WadMeshBuilder.remapLocalTextures(mesh.faces);
        const groups = this._animBank.buildAnimGroups(localIndices);
        WadMeshBuilder.applyAnimMap(mesh.faces, groups.animMap);

        return {
            code:         stairName,
            textures:     groups.newList,
            mesh:         mesh,
            instanceData: this._buildInstanceData(stairName, info.special, delta)
        };
    }

    // Top flat: floor surface at the WAD floor height, normal up (isFloor=true).
    // Moving step top. Kept apart from WadMeshBuilder.addSectorTopFlat (lifts,
    // rising floors): the raw chains loop preserves the historical step
    // geometry — outersWithHoles would re-split/re-orient multi-chain sectors.
    _buildTopFlat(mesh, si, sec, origFh) {
        const {vertexes, linedefs, sidedefs} = this._level;

        const ft = this._bank.ensureFlatTex(sec.ft);
        if (ft < 0) {
            return;
        }

        const chains = WadSectorPolygons.buildSectorPolygons(si, linedefs, sidedefs, vertexes);
        for (const chain of chains) {
            const polyDoom = chain.map((vi) => vertexes[vi]);
            WadMeshBuilder.addFlatQuad(mesh, ft, polyDoom, origFh, true, sec.light, null, WadMapAnalyzer.lightGroupOf(this._analysis, si));
        }
    }

    // Final (rest) floor height of a neighbour sector: a stair step's target, or
    // the static (already-patched) floor of any other sector.
    _finalHeight(neighbourSi) {
        const {stairIds, stairInfo} = this._analysis;
        if (stairIds.has(neighbourSi)) {
            return stairInfo[neighbourSi].targetFh;
        }

        return this._level.sectors[neighbourSi].fh;
    }

    // Riser on each two-sided edge of the step, drawn only toward a neighbour
    // whose final floor is LOWER (this higher step owns the shared face). The
    // quad is authored at [neighFinal - delta, origFh] so that after the +delta
    // instance translate it covers exactly [neighFinal, targetFh] — valid for an
    // arbitrarily lower neighbour. Same texture/flip convention as the lifts and
    // rising floors: the lower (corridor/neighbour) sidedef lower texture.
    _buildStairRisers(mesh, si, origFh, targetFh, delta) {
        const {vertexes, linedefs, sidedefs, sectors} = this._level;
        const SCALE = WadConstants.SCALE;

        for (const ld of linedefs) {
            if (ld.right < 0 || ld.left < 0) {
                continue;
            }
            const rSi = sidedefs[ld.right].sector;
            const lSi = sidedefs[ld.left].sector;
            if (rSi !== si && lSi !== si) {
                continue;
            }
            const neighbourSi = ((rSi === si) ? lSi : rSi);
            if (neighbourSi === si) {
                continue;
            }
            const neighFinal = this._finalHeight(neighbourSi);
            // The higher-ending step owns the shared riser.
            if (targetFh <= neighFinal) {
                continue;
            }

            const isRightFloor = (rSi === si);
            const corrSd  = ((isRightFloor) ? sidedefs[ld.left] : sidedefs[ld.right]);
            const ownSd   = ((isRightFloor) ? sidedefs[ld.right] : sidedefs[ld.left]);
            const corrSec = sectors[neighbourSi];

            let tex = corrSd.lower;
            if (!tex || tex === '-') {
                tex = ownSd.lower;
            }
            if (!tex || tex === '-') {
                continue;
            }
            const ti = this._bank.ensureWallTex(tex);
            if (ti < 0) {
                continue;
            }
            const {width: tw, height: th} = this._bank.getDims(ti);

            const [dx1, dy1] = vertexes[ld.v1];
            const [dx2, dy2] = vertexes[ld.v2];
            const [wx1, wz1] = WadGeometry.doomToWorld(dx1, dy1);
            const [wx2, wz2] = WadGeometry.doomToWorld(dx2, dy2);
            const wallLen = WadGeometry.wallLengthDoom(vertexes, ld.v1, ld.v2);
            const lowerUnpeg = ((ld.flags & WadConstants.ML_DONTPEGBOTTOM) !== 0);

            const botDu = neighFinal - delta;
            const topDu = origFh;
            const yo = corrSd.yo + ((lowerUnpeg) ? (corrSec.ch - origFh) : 0);

            WadMeshBuilder.addWallQuad(mesh, ti,
                wx1, wz1, wx2, wz2,
                botDu * SCALE, topDu * SCALE,
                wallLen, tw, th,
                {xOff: corrSd.xo, yOff: yo, flip: !isRightFloor, light: corrSec.light, lightGroup: WadMapAnalyzer.lightGroupOf(this._analysis, neighbourSi)});
        }
    }

    _buildInstanceData(stairName, special, delta) {
        const speed   = WadConstants.STAIR_BY_SPECIAL[special].speed;
        const travelY = delta * WadConstants.SCALE;
        const moveS   = delta / (speed * 35.0);

        // One-way, upward. Driven externally (switch 7/127 or walk-zone 8/100)
        // via start(), so trigger is 'none' (no self-proximity radius).
        const keyframes = [
            {t: 0.0,   translate: [0, 0, 0],       rotate: [0, 0, 0]},
            {t: moveS, translate: [0, travelY, 0], rotate: [0, 0, 0]}
        ];

        return {
            code:              stairName,
            position:          [0, 0, 0],
            rotation:          [0, 0, 0],
            trigger:           'none',
            loop:              false,
            onlyOnce:          true,
            collisionShape:    'faces',
            interactionRadius: null,
            damage:            null,
            keyframes:         keyframes
        };
    }
}
