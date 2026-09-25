/**
 * Stair instances builder (build-stairs specials 7/8/100/127): one one-way
 * rising instance per step, rising from its WAD floor to its cumulated target.
 * Unlike a rising floor, the step ending higher owns the riser shared with
 * another step, so it is drawn once. All steps start together: their
 * different travels give the ripple.
 */
class WadStairBuilder extends AbstractMoverBuilder {
    _sectorIds() {
        return this._analysis.stairIds;
    }

    _buildOne(si) {
        const sec      = this._level.sectors[si];
        const step     = this._analysis.stairInfo[si];
        const origFh   = sec.fh;
        const targetFh = step.targetFh;
        const delta    = targetFh - origFh;
        const mover    = this._analysis.floorMovers.get(si) ?? null;
        if (mover === null) {
            return null;
        }

        const stairCode = mover.code;
        const mesh = WadMeshBuilder.newMesh();

        this._buildTopFlat(mesh, si, sec, origFh);
        this._buildStairRisers(mesh, si, origFh, targetFh, delta, stairCode);

        const textures = this._meshTextures(mesh);
        if (textures === null) {
            return null;
        }

        return {
            code:         stairCode,
            textures:     textures,
            mesh:         mesh,
            instanceData: this._buildInstanceData(stairCode, step.special, delta)
        };
    }

    // Raw chains rather than addSectorTopFlat: outersWithHoles would re-split
    // and re-orient multi-chain steps.
    _buildTopFlat(mesh, si, sec, origFh) {
        const {vertexes, linedefs, sidedefs} = this._level;

        const ft = this._bank.ensureFlatTex(sec.ft);
        if (ft < 0) {
            return;
        }

        const chains = WadSectorPolygons.buildSectorChains(si, linedefs, sidedefs, vertexes);
        for (const chain of chains) {
            const polyDoom = chain.map((vi) => vertexes[vi]);
            WadMeshBuilder.addFlatPolygon(mesh, ft, polyDoom, origFh, true, {
                light:      sec.light,
                lightGroup: WadMapAnalyzer.lightGroupOf(this._analysis, si),
                noDecal:    this._bank.isLiquidFlat(sec.ft)
            });
        }
    }

    // Final floor of a neighbour: a step's target, else its (patched) static floor.
    _finalHeight(neighbourSi) {
        const {stairIds, stairInfo} = this._analysis;
        if (stairIds.has(neighbourSi)) {
            return stairInfo[neighbourSi].targetFh;
        }

        return this._level.sectors[neighbourSi].fh;
    }

    // Riser toward each neighbour ending lower, authored at [neighbourFinalFh -
    // delta, origFh] so that once raised it covers [neighbourFinalFh, targetFh].
    _buildStairRisers(mesh, si, origFh, targetFh, delta, stairCode) {
        const {vertexes, linedefs, sidedefs, sectors} = this._level;
        const SCALE = WadConstants.SCALE;

        for (const ld of linedefs) {
            if ((ld.right < 0) || (ld.left < 0)) {
                continue;
            }
            const rSi = sidedefs[ld.right].sector;
            const lSi = sidedefs[ld.left].sector;
            if ((rSi !== si) && (lSi !== si)) {
                continue;
            }
            const neighbourSi = ((rSi === si) ? lSi : rSi);
            if (neighbourSi === si) {
                continue;
            }
            const neighbourFinalFh = this._finalHeight(neighbourSi);
            if (targetFh <= neighbourFinalFh) {
                continue;
            }

            const isRightFloor = (rSi === si);
            const neighbourSd  = ((isRightFloor) ? sidedefs[ld.left] : sidedefs[ld.right]);
            const ownSd        = ((isRightFloor) ? sidedefs[ld.right] : sidedefs[ld.left]);
            const neighbourSec = sectors[neighbourSi];

            let tex = neighbourSd.lower;
            if (WadTextureBank.isBlank(tex)) {
                tex = ownSd.lower;
            }
            if (WadTextureBank.isBlank(tex)) {
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

            const botDu = neighbourFinalFh - delta;
            const topDu = origFh;
            const uv    = WadMeshBuilder.moverRiserUv(ld, neighbourSd, neighbourSec, origFh, stairCode, th);

            WadMeshBuilder.addWallQuad(mesh, ti,
                wx1, wz1, wx2, wz2,
                botDu * SCALE, topDu * SCALE,
                wallLen, tw, th,
                {xOff: neighbourSd.xo, yOff: uv.yOff, flip: !isRightFloor, light: neighbourSec.light, lightGroup: WadMapAnalyzer.lightGroupOf(this._analysis, neighbourSi),
                    uvAnchor: uv.uvAnchor});
        }
    }

    _buildInstanceData(stairCode, special, delta) {
        const speed         = WadConstants.STAIR_BY_SPECIAL[special].speed;
        const travelY       = delta * WadConstants.SCALE;
        const moveDurationS = WadConstants.moveDurationS(delta, speed);

        const keyframes = [
            {t: 0.0,   translate: [0, 0, 0],       rotate: [0, 0, 0]},
            {t: moveDurationS, translate: [0, travelY, 0], rotate: [0, 0, 0]}
        ];

        return {
            code:              stairCode,
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
