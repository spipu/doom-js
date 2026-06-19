/**
 * Door instances builder (transposition of the door generation phase of
 * convert_wad.py main()): world-space geometry + instance data with keyframes.
 */
class WadDoorBuilder {
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
        const sortedIds = [...this._analysis.doorSectorIds].sort((a, b) => a - b);
        for (const si of sortedIds) {
            const door = this._buildDoor(si);
            if (door !== null) {
                result.push(door);
            }
        }

        return result;
    }

    // --- Internal ---

    _buildDoor(si) {
        const {vertexes, linedefs, sidedefs, sectors} = this._level;
        const {doorHeights} = this._analysis;
        const sec = sectors[si];

        if (doorHeights[si] === undefined) {
            return null;
        }

        // The door sector must have at least one boundary edge
        let hasBounds = false;
        for (const ld of linedefs) {
            if ((ld.right >= 0 && sidedefs[ld.right].sector === si)
                || (ld.left >= 0 && sidedefs[ld.left].sector === si)) {
                hasBounds = true;
                break;
            }
        }
        if (!hasBounds) {
            return null;
        }

        const {floorH, ceilH} = doorHeights[si];
        const doorName = 'door_' + si;

        const mesh = WadMeshBuilder.newMesh();
        this._buildPanels(mesh, si, floorH);
        this._buildBottomFlat(mesh, si, sec, floorH);

        const localIndices = WadMeshBuilder.remapLocalTextures(mesh.faces);
        const groups = this._animBank.buildAnimGroups(localIndices);
        WadMeshBuilder.applyAnimMap(mesh.faces, groups.animMap);

        return {
            code:         doorName,
            textures:     groups.newList,
            mesh:         mesh,
            instanceData: this._buildInstanceData(doorName, si, floorH, ceilH, mesh)
        };
    }

    // Full-height panels: from the adjacent floor to THIS corridor's ceiling,
    // using the corridor sidedef upper texture (door on right → left sidedef
    // flip=false, door on left → right sidedef flip=true).
    _buildPanels(mesh, si, floorH) {
        const {vertexes, linedefs, sidedefs, sectors} = this._level;
        const {doorSectorIds} = this._analysis;
        const SCALE = WadConstants.SCALE;

        for (const ld of linedefs) {
            if (ld.right < 0) {
                continue;
            }
            const rSi2 = sidedefs[ld.right].sector;
            const lSi2 = ((ld.left >= 0) ? sidedefs[ld.left].sector : -1);
            if (rSi2 !== si && lSi2 !== si) {
                continue;
            }

            const [dx1, dy1] = vertexes[ld.v1];
            const [dx2, dy2] = vertexes[ld.v2];
            const [wx1, wz1] = WadGeometry.doomToWorld(dx1, dy1);
            const [wx2, wz2] = WadGeometry.doomToWorld(dx2, dy2);
            const wallLen = WadGeometry.wallLengthDoom(vertexes, ld.v1, ld.v2);
            const upperUnpeg = ((ld.flags & WadConstants.ML_DONTPEGTOP) !== 0);

            if (rSi2 === si && ld.left >= 0 && !doorSectorIds.has(lSi2)) {
                // Door on right, corridor on left
                const lSd   = sidedefs[ld.left];
                const lSec2 = sectors[lSi2];
                const tex = lSd.upper;
                if (!tex || tex === '-') {
                    continue;
                }
                const ti = this._bank.ensureWallTex(tex);
                if (ti < 0) {
                    continue;
                }
                const {width: tw, height: th} = this._bank.getDims(ti);
                const hPanel = lSec2.ch - floorH;
                const yo = lSd.yo + ((upperUnpeg) ? 0 : (th - hPanel));
                WadMeshBuilder.addWallQuad(mesh, ti,
                    wx1, wz1, wx2, wz2,
                    floorH * SCALE, lSec2.ch * SCALE,
                    wallLen, tw, th,
                    {xOff: lSd.xo, yOff: yo, flip: false, light: lSec2.light});
            } else if (lSi2 === si && !doorSectorIds.has(rSi2)) {
                // Door on left, corridor on right
                const rSd   = sidedefs[ld.right];
                const rSec2 = sectors[rSi2];
                const tex = rSd.upper;
                if (!tex || tex === '-') {
                    continue;
                }
                const ti = this._bank.ensureWallTex(tex);
                if (ti < 0) {
                    continue;
                }
                const {width: tw, height: th} = this._bank.getDims(ti);
                const hPanel = rSec2.ch - floorH;
                const yo = rSd.yo + ((upperUnpeg) ? 0 : (th - hPanel));
                WadMeshBuilder.addWallQuad(mesh, ti,
                    wx1, wz1, wx2, wz2,
                    floorH * SCALE, rSec2.ch * SCALE,
                    wallLen, tw, th,
                    {xOff: rSd.xo, yOff: yo, flip: true, light: rSec2.light});
            }
        }
    }

    // Bottom flat: ceiling flat of the door sector, visible from below when
    // the panel rises. No top flat (z-fight with the static ceiling).
    _buildBottomFlat(mesh, si, sec, floorH) {
        const {vertexes, linedefs, sidedefs} = this._level;

        if (sec.ct.startsWith('F_SKY')) {
            return;
        }
        const ct = this._bank.ensureFlatTex(sec.ct);
        if (ct < 0) {
            return;
        }

        const chains = WadSectorPolygons.buildSectorPolygons(si, linedefs, sidedefs, vertexes);
        for (const chain of chains) {
            const polyDoom = chain.map((vi) => vertexes[vi]);
            WadMeshBuilder.addFlatQuad(mesh, ct, polyDoom, floorH, false, sec.light);
        }
    }

    _buildInstanceData(doorName, si, floorH, ceilH, mesh) {
        const props = this._analysis.doorProps[si];
        const travelY   = (ceilH - floorH) * WadConstants.SCALE;
        const speedTics = props.speed;

        // Radius: half of the XZ bounding diagonal + margin
        let radius = WadConstants.DOOR_ACTION_RADIUS;
        if (mesh.points.length > 0) {
            const xs = mesh.points.map((p) => p[0]);
            const zs = mesh.points.map((p) => p[2]);
            const dx = Math.max(...xs) - Math.min(...xs);
            const dz = Math.max(...zs) - Math.min(...zs);
            radius = Math.sqrt(dx * dx + dz * dz) / 2.0 + WadConstants.DOOR_ACTION_RADIUS;
        }

        const openS = (ceilH - floorH) / speedTics / 35.0;
        const waitS = WadConstants.DOOR_WAIT_TICS / 35.0;

        let keyframes;
        if (props.anim === 'one-way') {
            keyframes = [
                {t: 0.0,   translate: [0, 0, 0],       rotate: [0, 0, 0]},
                {t: openS, translate: [0, travelY, 0], rotate: [0, 0, 0]}
            ];
        } else {
            const tRest = openS + waitS + openS;
            keyframes = [
                {t: 0.0,           translate: [0, 0, 0],       rotate: [0, 0, 0]},
                {t: openS,         translate: [0, travelY, 0], rotate: [0, 0, 0]},
                {t: openS + waitS, translate: [0, travelY, 0], rotate: [0, 0, 0]},
                {t: tRest,         translate: [0, 0, 0],       rotate: [0, 0, 0]},
                {t: tRest + 1.0,   translate: [0, 0, 0],       rotate: [0, 0, 0]}
            ];
        }

        return {
            code:              doorName,
            position:          [0, 0, 0],
            rotation:          [0, 0, 0],
            trigger:           props.trigger,
            loop:              props.loop,
            onlyOnce:          props.onlyOnce,
            collisionShape:    'faces',
            interactionRadius: radius,
            damage:            null,
            keyframes:         keyframes
        };
    }
}
