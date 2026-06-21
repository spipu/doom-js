/**
 * Switch instances builder (transposition of the switch generation phase of
 * convert_wad.py main()): SW1 quad + SW2 partner texture (local index 2, not
 * referenced by the faces — swapped at runtime by the interaction).
 */
class WadSwitchBuilder {
    /**
     * @param {object}         level
     * @param {object}         analysis
     * @param {WadTextureBank} bank
     * @param {Set<string>}    builtLiftCodes - codes of the lift instances actually built
     * @param {Set<string>}    builtDoorCodes - codes of the door instances actually built
     */
    constructor(level, analysis, bank, builtLiftCodes, builtDoorCodes) {
        this._level          = level;
        this._analysis       = analysis;
        this._bank           = bank;
        this._builtLiftCodes = builtLiftCodes;
        this._builtDoorCodes = builtDoorCodes ?? new Set();
    }

    /**
     * @returns {object[]} [{code, textures (bank indices), mesh, instanceData, interactionSpec}]
     */
    buildAll() {
        const result = [];
        const sortedIds = [...this._analysis.switchLinedefIds].sort((a, b) => a - b);
        for (const ldIdx of sortedIds) {
            const sw = this._buildSwitch(ldIdx);
            if (sw !== null) {
                result.push(sw);
            }
        }

        return result;
    }

    // --- Internal ---

    _buildSwitch(ldIdx) {
        const {vertexes, linedefs, sectors} = this._level;
        const SCALE = WadConstants.SCALE;

        const slotInfo = this._analysis.switchWalls.get(ldIdx);
        if (slotInfo === undefined) {
            return null;
        }

        const ld = linedefs[ldIdx];
        const switchName = 'switch_' + ldIdx;

        const ti = this._bank.ensureWallTex(slotInfo.texName);
        if (ti < 0) {
            return null;
        }
        const {width: tw, height: th} = this._bank.getDims(ti);

        const [dx1, dy1] = vertexes[ld.v1];
        const [dx2, dy2] = vertexes[ld.v2];
        const [wx1, wz1] = WadGeometry.doomToWorld(dx1, dy1);
        const [wx2, wz2] = WadGeometry.doomToWorld(dx2, dy2);
        const wallLen = WadGeometry.wallLengthDoom(vertexes, ld.v1, ld.v2);

        const band = this._switchBand(ld, slotInfo, th);

        // SW2 partner for the runtime texture swap
        const partnerName = this._bank.getSwitchPartner(slotInfo.texName);
        const ti2 = ((partnerName !== null) ? this._bank.ensureWallTex(partnerName) : -1);

        const mesh = WadMeshBuilder.newMesh();
        WadMeshBuilder.addWallQuad(mesh, ti,
            wx1, wz1, wx2, wz2,
            band.yBotDu * SCALE, band.yTopDu * SCALE,
            wallLen, tw, th,
            {xOff: band.sd.xo, yOff: band.yo, flip: band.flip, light: band.light});

        // SW1 = local index 1 (referenced by the faces), SW2 = local index 2
        const extras = ((ti2 >= 0) ? [ti2 + 1] : []);
        const localIndices = WadMeshBuilder.remapLocalTextures(mesh.faces, extras);

        // Action radius: half of the 3D bounding diagonal + margin. The trigger
        // distance is 3D and the wall center is at mid-height, so the wall
        // height must be included — a small fixed radius would force the
        // player to hug the panel
        const xs = mesh.points.map((p) => p[0]);
        const ys = mesh.points.map((p) => p[1]);
        const zs = mesh.points.map((p) => p[2]);
        const dx = Math.max(...xs) - Math.min(...xs);
        const dy = Math.max(...ys) - Math.min(...ys);
        const dz = Math.max(...zs) - Math.min(...zs);
        const radius = Math.sqrt(dx * dx + dy * dy + dz * dz) / 2.0 + WadConstants.DOOR_ACTION_RADIUS;

        const interactionConfig = WadConstants.SWITCH_INTERACTION_BY_SPECIAL[ld.special] ?? ['once', null, null];

        // Resolve tag → target lift/floor AND door instances of the same tag.
        // start() is type-agnostic, so a remote door (trigger 'none') opens
        // exactly like a switch-driven lift.
        const targets = [];
        if (ld.tag !== 0) {
            for (const liftSi of this._analysis.movingFloorDownIds) {
                const liftCode = 'lift_' + liftSi;
                if (sectors[liftSi].tag === ld.tag && this._builtLiftCodes.has(liftCode)) {
                    targets.push(liftCode);
                }
            }
            for (const doorSi of this._analysis.doorSectorIds) {
                const doorCode = 'door_' + doorSi;
                if (sectors[doorSi].tag === ld.tag && this._builtDoorCodes.has(doorCode)) {
                    targets.push(doorCode);
                }
            }
        }

        return {
            code:     switchName,
            textures: localIndices,
            mesh:     mesh,
            instanceData: {
                code:              switchName,
                position:          [0, 0, 0],
                rotation:          [0, 0, 0],
                trigger:           'action',
                loop:              false,
                onlyOnce:          false,
                // The switch face is removed from the static map, so the
                // instance carries its collision. 'faces' replicates the
                // original wall: a one-sided panel blocks; a two-sided step
                // riser is stepped over or blocks per its height, exactly as
                // resolveWall already treats static wall faces.
                collisionShape:    'faces',
                interactionRadius: radius,
                damage:            null,
                interaction:       switchName,
                keyframes:         []
            },
            interactionSpec: {
                code:    switchName,
                mode:    interactionConfig[0],
                tOn:     interactionConfig[1],
                tOff:    interactionConfig[2],
                targets: targets,
                isExit:  WadConstants.SWITCH_EXIT_SPECIALS.has(ld.special)
            }
        };
    }

    /**
     * Vertical band, pegging and winding of the switch quad — replicates exactly
     * the static wall section the SW graphic sits on, so the swapped texture
     * stays aligned: a one-sided full-height middle, or the lower (step riser) /
     * upper (ceiling header) of a two-sided line, from either side.
     *
     * @returns {{sd, yBotDu, yTopDu, yo, flip, light}} heights in Doom units
     */
    _switchBand(ld, slotInfo, th) {
        const {sidedefs, sectors} = this._level;
        const rSd  = sidedefs[ld.right];
        const rSec = sectors[rSd.sector];
        const lowerUnpeg = ((ld.flags & WadConstants.ML_DONTPEGBOTTOM) !== 0);
        const upperUnpeg = ((ld.flags & WadConstants.ML_DONTPEGTOP) !== 0);

        if (slotInfo.slot === 'middle') {
            const hDoom = rSec.ch - rSec.fh;
            return {sd: rSd, yBotDu: rSec.fh, yTopDu: rSec.ch,
                yo: rSd.yo + ((lowerUnpeg) ? (th - hDoom) : 0), flip: true, light: rSec.light};
        }

        const lSd  = sidedefs[ld.left];
        const lSec = sectors[lSd.sector];
        const rFh = rSec.fh;
        const rCh = rSec.ch;
        const lFh = lSec.fh;
        const lCh = lSec.ch;

        if (slotInfo.slot === 'lower') {
            if (slotInfo.side === 'right') {
                return {sd: rSd, yBotDu: rFh, yTopDu: lFh,
                    yo: rSd.yo + ((lowerUnpeg) ? (rCh - lFh) : 0), flip: true, light: rSec.light};
            }
            return {sd: lSd, yBotDu: lFh, yTopDu: rFh,
                yo: lSd.yo + ((lowerUnpeg) ? (lCh - rFh) : 0), flip: false, light: lSec.light};
        }

        // upper
        if (slotInfo.side === 'right') {
            return {sd: rSd, yBotDu: lCh, yTopDu: rCh,
                yo: rSd.yo + ((upperUnpeg) ? 0 : (th - (rCh - lCh))), flip: true, light: rSec.light};
        }
        return {sd: lSd, yBotDu: rCh, yTopDu: lCh,
            yo: lSd.yo + ((upperUnpeg) ? 0 : (th - (lCh - rCh))), flip: false, light: lSec.light};
    }
}
