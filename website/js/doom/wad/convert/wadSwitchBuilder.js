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
     */
    constructor(level, analysis, bank, builtLiftCodes) {
        this._level          = level;
        this._analysis       = analysis;
        this._bank           = bank;
        this._builtLiftCodes = builtLiftCodes;
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
        const {vertexes, linedefs, sidedefs, sectors} = this._level;
        const SCALE = WadConstants.SCALE;

        const ld  = linedefs[ldIdx];
        const sd  = sidedefs[ld.right];
        const sec = sectors[sd.sector];

        const switchName = 'switch_' + ldIdx;

        const ti = this._bank.ensureWallTex(sd.middle);
        if (ti < 0) {
            return null;
        }
        const {width: tw, height: th} = this._bank.getDims(ti);

        const [dx1, dy1] = vertexes[ld.v1];
        const [dx2, dy2] = vertexes[ld.v2];
        const [wx1, wz1] = WadGeometry.doomToWorld(dx1, dy1);
        const [wx2, wz2] = WadGeometry.doomToWorld(dx2, dy2);
        const wallLen = WadGeometry.wallLengthDoom(vertexes, ld.v1, ld.v2);

        const hDoom = sec.ch - sec.fh;
        const lowerUnpeg = ((ld.flags & WadConstants.ML_DONTPEGBOTTOM) !== 0);
        const yo = sd.yo + ((lowerUnpeg) ? (th - hDoom) : 0);

        // SW2 partner for the runtime texture swap
        const partnerName = this._bank.getSwitchPartner(sd.middle);
        const ti2 = ((partnerName !== null) ? this._bank.ensureWallTex(partnerName) : -1);

        const mesh = WadMeshBuilder.newMesh();
        WadMeshBuilder.addWallQuad(mesh, ti,
            wx1, wz1, wx2, wz2,
            sec.fh * SCALE, sec.ch * SCALE,
            wallLen, tw, th,
            {xOff: sd.xo, yOff: yo, flip: true, light: sec.light});

        // SW1 = local index 1 (referenced by the faces), SW2 = local index 2
        const extras = ((ti2 >= 0) ? [ti2 + 1] : []);
        const localIndices = WadMeshBuilder.remapLocalTextures(mesh.faces, extras);

        const interactionConfig = WadConstants.SWITCH_INTERACTION_BY_SPECIAL[ld.special] ?? ['once', null, null];

        // Resolve tag → target lift/floor instances
        const targets = [];
        if (ld.tag !== 0) {
            for (const liftSi of this._analysis.movingFloorDownIds) {
                const liftCode = 'lift_' + liftSi;
                if (sectors[liftSi].tag === ld.tag && this._builtLiftCodes.has(liftCode)) {
                    targets.push(liftCode);
                }
            }
        }

        return {
            code:     switchName,
            textures: localIndices,
            mesh:     mesh,
            instanceData: {
                code:        switchName,
                position:    [0, 0, 0],
                rotation:    [0, 0, 0],
                trigger:     'action',
                loop:        false,
                onlyOnce:    false,
                collidable:  false,
                radius:      1.0,
                damage:      null,
                interaction: switchName,
                keyframes:   []
            },
            interactionSpec: {
                code:    switchName,
                mode:    interactionConfig[0],
                tOn:     interactionConfig[1],
                tOff:    interactionConfig[2],
                targets: targets
            }
        };
    }
}
