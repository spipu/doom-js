/**
 * Rising floor instances builder (special 58 etc.): a floor that moves UP a
 * fixed delta when walked over (one-way). Mirrors WadLiftBuilder, but the
 * static floor is NOT patched down — the moving top-flat sits at the WAD floor
 * height (origFh) and rises by +delta. The riser is built as a "skirt" from
 * origFh-delta to origFh: hidden below the adjacent corridor floor at rest, it
 * emerges as the origFh→origFh+delta step once the floor has risen.
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
        const delta   = WadConstants.FLOOR_UP_DELTA_BY_SPECIAL[special] ?? 24;
        const origFh  = sec.fh;
        // Skirt base: where the riser starts so that, once raised, it covers
        // exactly the origFh → origFh+delta step.
        const baseFh  = origFh - delta;

        const floorName = 'risingfloor_' + si;
        const mesh = WadMeshBuilder.newMesh();

        this._buildTopFlat(mesh, si, sec, origFh);
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
            instanceData: this._buildInstanceData(floorName, special, delta, mesh)
        };
    }

    // Top flat: floor surface at the WAD floor height, normal up (isFloor=true).
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
                // Floor on right, corridor on left — l_sd + flip=false
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
                    {xOff: lSd2.xo, yOff: yo, flip: false, light: lSec2.light});
            } else if (lSi2 === si && !risingFloorIds.has(rSi2)) {
                // Floor on left, corridor on right — r_sd + flip=true
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
                    {xOff: rSd2.xo, yOff: yo, flip: true, light: rSec2.light});
            }
        }
    }

    _buildInstanceData(floorName, special, delta, mesh) {
        const speed   = WadConstants.FLOOR_UP_SPEED_BY_SPECIAL[special] ?? 2;
        const travelY = delta * WadConstants.SCALE;
        const moveS   = delta / (speed * 35.0);

        // Walk-over approximated by a proximity radius (like the W1 doors and
        // the WR lift 88): half of the XZ bounding diagonal + margin.
        const xs = mesh.points.map((p) => p[0]);
        const zs = mesh.points.map((p) => p[2]);
        const dx = Math.max(...xs) - Math.min(...xs);
        const dz = Math.max(...zs) - Math.min(...zs);
        const radius = Math.sqrt(dx * dx + dz * dz) / 2.0 + WadConstants.DOOR_ACTION_RADIUS;

        // One-way, upward. Walk-triggered (W1), plays once.
        const keyframes = [
            {t: 0.0,   translate: [0, 0, 0],       rotate: [0, 0, 0]},
            {t: moveS, translate: [0, travelY, 0], rotate: [0, 0, 0]}
        ];

        return {
            code:              floorName,
            position:          [0, 0, 0],
            rotation:          [0, 0, 0],
            trigger:           'proximity',
            loop:              false,
            onlyOnce:          true,
            collisionShape:    'faces',
            interactionRadius: radius,
            damage:            null,
            keyframes:         keyframes
        };
    }
}
