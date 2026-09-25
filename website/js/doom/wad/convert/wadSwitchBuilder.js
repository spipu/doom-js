/**
 * Switch instances builder (transposition of the switch generation phase of
 * convert_wad.py main()): SW1 quad plus its SW2 partner texture, referenced
 * by no face and swapped in at runtime by the interaction.
 */
class WadSwitchBuilder {
    /**
     * @param {object}         level
     * @param {object}         analysis
     * @param {WadTextureBank} bank
     * @param {Set<string>}    builtLiftCodes - codes of the lift instances actually built
     * @param {Set<string>}    builtDoorCodes - codes of the door instances actually built
     * @param {Set<string>}    builtStairCodes - codes of the stair-step instances actually built
     * @param {Set<string>}    builtRisingCodes - codes of the rising-floor instances actually built
     */
    constructor(level, analysis, bank, builtLiftCodes, builtDoorCodes, builtStairCodes, builtRisingCodes, liveFloorOf) {
        this._level            = level;
        this._analysis         = analysis;
        this._bank             = bank;
        this._builtLiftCodes   = builtLiftCodes;
        this._builtDoorCodes   = builtDoorCodes;
        this._builtStairCodes  = builtStairCodes;
        this._builtRisingCodes = builtRisingCodes;
        this._liveFloorOf      = liveFloorOf;
    }

    /**
     * @returns {object[]} [{code, linedef, textures (bank indices), mesh, instanceData, interactionSpec}]
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
        const switchWall = this._analysis.switchWalls.get(ldIdx);
        if (switchWall === undefined) {
            return null;
        }

        const ld = this._level.linedefs[ldIdx];
        const switchCode = 'switch_' + ldIdx;
        const isExit = WadConstants.SWITCH_EXIT_SPECIALS.has(ld.special);
        // An exit ignores its tag (vanilla).
        const targets = ((isExit) ? [] : this._resolveTargets(ld));
        const split   = WadMapAnalyzer.splitReverseTargets(this._analysis, ld.special, targets);

        const geom = ((switchWall.invisible === true)
            ? this._buildUseZoneGeometry(ld)
            : this._buildPanelGeometry(ld, switchWall));
        if (geom === null) {
            return null;
        }
        // A visible panel is kept even when it fires nothing.
        if ((geom.textures.length === 0) && (targets.length === 0) && !isExit) {
            return null;
        }

        const interactionConfig = WadConstants.SWITCH_INTERACTION_BY_SPECIAL[ld.special] ?? WadConstants.SWITCH_INTERACTION_DEFAULT;

        return {
            code:       switchCode,
            linedef:    ldIdx,
            textures:   geom.textures,
            mesh:       geom.mesh,
            instanceData: {
                code:              switchCode,
                position:          [0, 0, 0],
                rotation:          [0, 0, 0],
                trigger:           'action',
                loop:              false,
                onlyOnce:          false,
                collisionShape:    geom.collisionShape,
                interactionRadius: geom.radius,
                damage:            null,
                interaction:       switchCode,
                // Locked-door switches (99/133-137), EV_DoLockedDoor.
                keyRequired:       WadConstants.DOOR_BY_SPECIAL[ld.special]?.key ?? null,
                keyframes:         []
            },
            interactionSpec: {
                code:           switchCode,
                mode:           interactionConfig.mode,
                tOn:            interactionConfig.minOnMs,
                tOff:           interactionConfig.minOffMs,
                restIndex:      (geom.restIndex ?? null),
                swapIndex:      (geom.swapIndex ?? null),
                targets:        split.start,
                reverseTargets: split.reverse,
                cycleVariant:   WadConstants.cycleKeyForSpecial(ld.special),
                stageRules:     WadMapAnalyzer.stageRulesFor(this._analysis, ld.special, split.start, this._liveFloorOf),
                remoteSwap:     (geom.remoteSwap ?? null),
                isExit:         isExit,
                secret:         WadConstants.EXIT_SECRET_SPECIALS.has(ld.special)
            }
        };
    }

    // Visible switch panel swapping SW1↔SW2. The static map drops its face, so
    // the instance collides in its place.
    _buildPanelGeometry(ld, switchWall) {
        const SCALE = WadConstants.SCALE;
        const {vertexes} = this._level;

        const ti = this._bank.ensureWallTex(switchWall.texName);
        if (ti < 0) {
            return null;
        }
        // On a mover's own face a static quad would z-fight, then hang in the air.
        const moverCode = this._moverCodeForSlot(ld, switchWall);
        if (moverCode !== null) {
            return this._buildMoverZoneGeometry(ld, switchWall, ti, moverCode);
        }
        const {width: tw, height: th} = this._bank.getDims(ti);

        const [dx1, dy1] = vertexes[ld.v1];
        const [dx2, dy2] = vertexes[ld.v2];
        const [wx1, wz1] = WadGeometry.doomToWorld(dx1, dy1);
        const [wx2, wz2] = WadGeometry.doomToWorld(dx2, dy2);
        const wallLen = WadGeometry.wallLengthDoom(vertexes, ld.v1, ld.v2);

        const band = this._switchBand(ld, switchWall, th);

        // Zero-height band: the graphic sits on a flush-parked mover's riser
        // (MAP19's plat edge), so the swap is delegated to the mover's faces.
        if (band.yTopDu <= band.yBotDu) {
            return this._buildMoverZoneGeometry(ld, switchWall, ti, this._anyMoverOn(ld));
        }

        // A non-SW switch wall has no partner: the interaction then does not swap.
        const partnerName = this._bank.getSwitchPartner(switchWall.texName);
        const partnerTi = ((partnerName !== null) ? this._bank.ensureWallTex(partnerName) : -1);

        const mesh = WadMeshBuilder.newMesh();
        WadMeshBuilder.addWallQuad(mesh, ti,
            wx1, wz1, wx2, wz2,
            band.yBotDu * SCALE, band.yTopDu * SCALE,
            wallLen, tw, th,
            {xOff: band.sd.xo, yOff: band.yo, flip: band.flip, light: band.light, lightGroup: WadMapAnalyzer.lightGroupOf(this._analysis, band.lightSi),
                uvAnchor: (band.uvAnchor ?? null)});

        // Local indices follow the bank order, and the SW2 may precede the SW1.
        const extras = ((partnerTi >= 0) ? [partnerTi + 1] : []);
        const localIndices = WadMeshBuilder.remapLocalTextures(mesh.faces, extras);
        const restIndex = localIndices.indexOf(ti) + 1;
        const swapIndex = ((partnerTi >= 0) ? localIndices.indexOf(partnerTi) + 1 : null);

        return {textures: localIndices, mesh: mesh, radius: this._meshRadius(mesh), collisionShape: 'faces',
            restIndex: restIndex, swapIndex: swapIndex, remoteSwap: this._riserSwapSpec(ld, switchWall, ti, partnerTi)};
    }

    // The riser a floor mover raises along the line repeats the SW graphic and swaps
    // along: the far mover borrows this side's lower, the near one only when the far is blank.
    _riserSwapSpec(ld, switchWall, ti, partnerTi) {
        const near      = ((switchWall.side === 'right') ? ld.right : ld.left);
        const far       = ((switchWall.side === 'right') ? ld.left : ld.right);
        const moverCode = (this._builtFloorMoverOf(far) ?? this._builtFloorMoverOf(near));
        if ((moverCode === null) || (partnerTi < 0)) {
            return null;
        }

        return this._remoteSwapSpec(ld, moverCode, ti, partnerTi);
    }

    // Invisible USE zone of a switch line with no SWxxx graphic (an SR lift edge).
    _buildUseZoneGeometry(ld) {
        const zone = WadMeshBuilder.buildLineZone(this._level, ld);

        return {textures: [], mesh: zone.mesh, radius: zone.radius, collisionShape: 'none'};
    }

    // Invisible USE zone of a switch whose graphic lives on a mover's face,
    // which swaps in its place (remoteSwap).
    _buildMoverZoneGeometry(ld, switchWall, ti, moverCode) {
        const geom = this._buildUseZoneGeometry(ld);

        const partnerName = this._bank.getSwitchPartner(switchWall.texName);
        const partnerTi   = ((partnerName !== null) ? this._bank.ensureWallTex(partnerName) : -1);
        if ((moverCode === null) || (partnerTi < 0)) {
            return geom;
        }

        geom.remoteSwap = this._remoteSwapSpec(ld, moverCode, ti, partnerTi);

        return geom;
    }

    // DoomSwitchInteraction.setRemoteSwap spec.
    _remoteSwapSpec(ld, moverCode, ti, partnerTi) {
        const {vertexes} = this._level;
        const [wx1, wz1] = WadGeometry.doomToWorld(...vertexes[ld.v1]);
        const [wx2, wz2] = WadGeometry.doomToWorld(...vertexes[ld.v2]);

        return {
            moverCode: moverCode,
            seg:       [wx1, wz1, wx2, wz2],
            restTexId: this._bank.getLoaderId(ti),
            swapTexId: this._bank.getLoaderId(partnerTi)
        };
    }

    /**
     * Built mover whose mesh draws the switch face at rest: the door across an
     * upper, the lift across a lower. Up movers rest with their risers buried,
     * so their band keeps a static panel. null = a plain static wall.
     *
     * @returns {string|null} instance code
     */
    _moverCodeForSlot(ld, switchWall) {
        if (ld.left < 0) {
            return null;
        }
        const {sidedefs} = this._level;
        const far = sidedefs[((switchWall.side === 'right') ? ld.left : ld.right)].sector;

        if (switchWall.slot === 'upper') {
            return ((this._builtDoorCodes.has('door_' + far)) ? ('door_' + far) : null);
        }
        if ((switchWall.slot === 'lower') && this._builtLiftCodes.has('lift_' + far)) {
            return ('lift_' + far);
        }

        return null;
    }

    _floorMoverCode(si) {
        return (this._analysis.floorMovers.get(si)?.code ?? null);
    }

    _isBuiltMover(code) {
        return (this._builtLiftCodes.has(code) || this._builtRisingCodes.has(code)
            || this._builtStairCodes.has(code) || this._builtDoorCodes.has(code));
    }

    _builtFloorMoverOf(sd) {
        if (sd < 0) {
            return null;
        }
        const floorCode = this._floorMoverCode(this._level.sidedefs[sd].sector);

        return (((floorCode !== null) && this._isBuiltMover(floorCode)) ? floorCode : null);
    }

    // Any built mover touching the line, floors first.
    _anyMoverOn(ld) {
        const {sidedefs} = this._level;
        for (const sd of [ld.right, ld.left]) {
            if (sd < 0) {
                continue;
            }
            const floorCode = this._builtFloorMoverOf(sd);
            if (floorCode !== null) {
                return floorCode;
            }
            if (this._builtDoorCodes.has('door_' + sidedefs[sd].sector)) {
                return 'door_' + sidedefs[sd].sector;
            }
        }

        return null;
    }

    // Half the 3D bounding diagonal + margin: the trigger is 3D, centred at mid-height.
    _meshRadius(mesh) {
        const xs = mesh.points.map((p) => p[0]);
        const ys = mesh.points.map((p) => p[1]);
        const zs = mesh.points.map((p) => p[2]);
        const dx = Math.max(...xs) - Math.min(...xs);
        const dy = Math.max(...ys) - Math.min(...ys);
        const dz = Math.max(...zs) - Math.min(...zs);

        return Math.sqrt(dx * dx + dy * dy + dz * dz) / 2.0 + WadConstants.DOOR_ACTION_RADIUS;
    }

    _resolveTargets(ld) {
        return WadMapAnalyzer.resolveTaggedTargets(this._level.sectors, ld.tag, WadMapAnalyzer.moverFamilies(
            this._analysis, this._level.sectors,
            {lifts: this._builtLiftCodes, rising: this._builtRisingCodes, doors: this._builtDoorCodes, stairs: this._builtStairCodes},
            ld.special));
    }

    /**
     * Band, pegging and winding of the switch quad, matching the static wall
     * section it replaces.
     *
     * @returns {{sd, yBotDu, yTopDu, yo, flip, light, lightSi, uvAnchor?}} heights in Doom units
     */
    _switchBand(ld, switchWall, th) {
        const {sidedefs, sectors} = this._level;
        const rSd        = sidedefs[ld.right];
        const rSec       = sectors[rSd.sector];
        const lowerUnpeg = ((ld.flags & WadConstants.ML_DONTPEGBOTTOM) !== 0);
        const upperUnpeg = ((ld.flags & WadConstants.ML_DONTPEGTOP) !== 0);

        if (switchWall.slot === 'middle') {
            // Inside a door sector: the door's open heights, like DOORTRAK
            // (MAP20's SW1GARG alcove).
            const doorH = this._analysis.doorHeights[rSd.sector];
            const yBot  = ((doorH !== undefined) ? doorH.floorH : rSec.fh);
            const yTop  = ((doorH !== undefined) ? doorH.ceilH : rSec.ch);
            const uv    = WadMeshBuilder.floorPeggedWallUv(ld, rSd, rSec, yTop, this._analysis.floorMovers, th);
            return {sd: rSd, yBotDu: yBot, yTopDu: yTop,
                yo: uv.yOff, flip: true, light: rSec.light, lightSi: rSd.sector, uvAnchor: uv.uvAnchor};
        }

        const lSd  = sidedefs[ld.left];
        const lSec = sectors[lSd.sector];
        const rFh  = rSec.fh;
        const rCh  = rSec.ch;
        const lFh  = lSec.fh;
        const lCh  = lSec.ch;

        if (switchWall.slot === 'lower') {
            if (switchWall.side === 'right') {
                return {sd: rSd, yBotDu: rFh, yTopDu: lFh,
                    yo: rSd.yo + ((lowerUnpeg) ? (rCh - lFh) : 0), flip: true, light: rSec.light, lightSi: rSd.sector};
            }
            return {sd: lSd, yBotDu: lFh, yTopDu: rFh,
                yo: lSd.yo + ((lowerUnpeg) ? (lCh - rFh) : 0), flip: false, light: lSec.light, lightSi: lSd.sector};
        }

        if (switchWall.side === 'right') {
            return {sd: rSd, yBotDu: lCh, yTopDu: rCh,
                yo: rSd.yo + ((upperUnpeg) ? 0 : (th - (rCh - lCh))), flip: true, light: rSec.light, lightSi: rSd.sector};
        }
        return {sd: lSd, yBotDu: rCh, yTopDu: lCh,
            yo: lSd.yo + ((upperUnpeg) ? 0 : (th - (lCh - rCh))), flip: false, light: lSec.light, lightSi: lSd.sector};
    }
}
