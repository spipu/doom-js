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
     * @param {Set<string>}    builtStairCodes - codes of the stair-step instances actually built
     * @param {Set<string>}    builtRisingCodes - codes of the rising-floor instances actually built
     */
    constructor(level, analysis, bank, builtLiftCodes, builtDoorCodes, builtStairCodes, builtRisingCodes) {
        this._level            = level;
        this._analysis         = analysis;
        this._bank             = bank;
        this._builtLiftCodes   = builtLiftCodes;
        this._builtDoorCodes   = builtDoorCodes;
        this._builtStairCodes  = builtStairCodes;
        this._builtRisingCodes = builtRisingCodes;
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
        const slotInfo = this._analysis.switchWalls.get(ldIdx);
        if (slotInfo === undefined) {
            return null;
        }

        const ld = this._level.linedefs[ldIdx];
        const switchName = 'switch_' + ldIdx;
        const isExit = WadConstants.SWITCH_EXIT_SPECIALS.has(ld.special);
        // An exit special ends the level and ignores its tag (vanilla Doom): it
        // must not also start tag-matching elements (e.g. a neighbouring lift).
        const targets = ((isExit) ? [] : this._resolveTargets(ld));
        const split   = WadMapAnalyzer.splitReverseTargets(this._analysis, ld.special, targets);

        const geom = ((slotInfo.invisible === true)
            ? this._buildUseZoneGeometry(ld)
            : this._buildPanelGeometry(ld, slotInfo));
        if (geom === null) {
            return null;
        }
        // A switch with no panel of its own and nothing to fire is dead weight;
        // a visible panel is always kept — it may be an exit or just cosmetic.
        if ((geom.textures.length === 0) && (targets.length === 0) && !isExit) {
            return null;
        }

        const interactionConfig = WadConstants.SWITCH_INTERACTION_BY_SPECIAL[ld.special] ?? WadConstants.SWITCH_INTERACTION_DEFAULT;

        return {
            code:     switchName,
            textures: geom.textures,
            mesh:     geom.mesh,
            instanceData: {
                code:              switchName,
                position:          [0, 0, 0],
                rotation:          [0, 0, 0],
                trigger:           'action',
                loop:              false,
                onlyOnce:          false,
                collisionShape:    geom.collisionShape,
                interactionRadius: geom.radius,
                damage:            null,
                interaction:       switchName,
                // Locked-door switch (99/133-137): the key is checked at USE
                // time on the trigger, like vanilla EV_DoLockedDoor.
                keyRequired:       WadConstants.DOOR_BY_SPECIAL[ld.special]?.key ?? null,
                keyframes:         []
            },
            interactionSpec: {
                code:           switchName,
                mode:           interactionConfig.mode,
                tOn:            interactionConfig.minOnMs,
                tOff:           interactionConfig.minOffMs,
                restIndex:      (geom.restIndex ?? null),
                swapIndex:      (geom.swapIndex ?? null),
                targets:        split.start,
                reverseTargets: split.reverse,
                // Per-trigger cycle key (door OWC vs open-stay, lift raise);
                // null when the special names none, ignored by targets that
                // do not declare it.
                cycleVariant:   WadConstants.cycleKeyForSpecial(ld.special),
                remoteSwap:     (geom.remoteSwap ?? null),
                isExit:         isExit,
                secret:         WadConstants.EXIT_SECRET_SPECIALS.has(ld.special)
            }
        };
    }

    // Visible switch panel: a textured quad swapping SW1↔SW2 on trigger. Its
    // face is removed from the static map, so the instance carries the wall
    // ('faces' collision: a one-sided panel blocks; a two-sided step riser is
    // stepped over or blocks per its height, like any static wall face).
    _buildPanelGeometry(ld, slotInfo) {
        const SCALE = WadConstants.SCALE;
        const {vertexes} = this._level;

        const ti = this._bank.ensureWallTex(slotInfo.texName);
        if (ti < 0) {
            return null;
        }
        // A graphic painted on a mover's own face (door panel, riser): a static
        // quad over it would z-fight at rest and hang in the air once it moves.
        const moverCode = this._moverCodeForSlot(ld, slotInfo);
        if (moverCode !== null) {
            return this._buildMoverZoneGeometry(ld, slotInfo, ti, moverCode);
        }
        const {width: tw, height: th} = this._bank.getDims(ti);

        const [dx1, dy1] = vertexes[ld.v1];
        const [dx2, dy2] = vertexes[ld.v2];
        const [wx1, wz1] = WadGeometry.doomToWorld(dx1, dy1);
        const [wx2, wz2] = WadGeometry.doomToWorld(dx2, dy2);
        const wallLen = WadGeometry.wallLengthDoom(vertexes, ld.v1, ld.v2);

        const band = this._switchBand(ld, slotInfo, th);

        // A switch graphic on a mover's riser parked level at build time
        // (MAP19: SW1GRAY1 on the lower of a plat edge, exposed only once the
        // plat has risen) yields a zero-height band: no panel to draw or
        // collide with, and a degenerate zero-radius zone that could never
        // fire. Fall back to the invisible USE zone; the mover's own riser
        // shows the graphic, so the SW1↔SW2 swap is delegated to its faces.
        if (band.yTopDu <= band.yBotDu) {
            return this._buildMoverZoneGeometry(ld, slotInfo, ti, this._anyMoverOn(ld));
        }

        // SW2 partner (local index 2, swapped at runtime). A non-SW switch wall
        // has no partner → no index 2; DoomSwitchInteraction then simply does not
        // swap (it guards on an undefined index 2) instead of going black.
        const partnerName = this._bank.getSwitchPartner(slotInfo.texName);
        const ti2 = ((partnerName !== null) ? this._bank.ensureWallTex(partnerName) : -1);

        const mesh = WadMeshBuilder.newMesh();
        WadMeshBuilder.addWallQuad(mesh, ti,
            wx1, wz1, wx2, wz2,
            band.yBotDu * SCALE, band.yTopDu * SCALE,
            wallLen, tw, th,
            {xOff: band.sd.xo, yOff: band.yo, flip: band.flip, light: band.light, lightGroup: WadMapAnalyzer.lightGroupOf(this._analysis, band.lightSi)});

        // remapLocalTextures orders the LOCAL indices by ascending bank index:
        // the SW2 may have entered the bank before the SW1 (used as a plain
        // decoration elsewhere), so the actual local positions are computed
        // here and carried to the interaction.
        const extras = ((ti2 >= 0) ? [ti2 + 1] : []);
        const localIndices = WadMeshBuilder.remapLocalTextures(mesh.faces, extras);
        const restIndex = localIndices.indexOf(ti) + 1;
        const swapIndex = ((ti2 >= 0) ? localIndices.indexOf(ti2) + 1 : null);

        return {textures: localIndices, mesh: mesh, radius: this._meshRadius(mesh), collisionShape: 'faces',
            restIndex: restIndex, swapIndex: swapIndex};
    }

    // Invisible USE zone: a switch-special line with no SWxxx graphic (e.g. an
    // SR lift edge). One point, no faces, no collision — the wall it sits on (a
    // lift riser, a step) is already drawn elsewhere; pressing within the radius
    // fires the targets. The USE analog of a walk-trigger zone.
    _buildUseZoneGeometry(ld) {
        const zone = WadMeshBuilder.buildLineZone(this._level, ld);

        return {textures: [], mesh: zone.mesh, radius: zone.radius, collisionShape: 'none'};
    }

    // Invisible USE zone for a switch whose SW graphic lives on a mover's own
    // face: the SW1↔SW2 feedback is delegated to that mover's faces, matched
    // at runtime on the linedef segment by the interaction (remoteSwap).
    _buildMoverZoneGeometry(ld, slotInfo, ti, moverCode) {
        const geom = this._buildUseZoneGeometry(ld);

        const partnerName = this._bank.getSwitchPartner(slotInfo.texName);
        const ti2         = ((partnerName !== null) ? this._bank.ensureWallTex(partnerName) : -1);
        if (moverCode === null || ti2 < 0) {
            return geom;
        }

        const {vertexes} = this._level;
        const [wx1, wz1] = WadGeometry.doomToWorld(...vertexes[ld.v1]);
        const [wx2, wz2] = WadGeometry.doomToWorld(...vertexes[ld.v2]);
        geom.remoteSwap = {
            moverCode: moverCode,
            seg:       [wx1, wz1, wx2, wz2],
            restTexId: this._bank.getLoaderId(ti),
            swapTexId: this._bank.getLoaderId(ti2)
        };

        return geom;
    }

    /**
     * Built mover whose own mesh draws the face carrying the switch graphic AT
     * REST: the panel of a door (upper band — the face belongs to the sector
     * across the line, the one whose ceiling moves) or the riser of a lift
     * (lower band, far side — parked up, its riser spans the step, and a
     * static panel would hang in the air once it lowers). Up movers (rising
     * floors, stairs) rest with their risers buried below the floor: their
     * band keeps its static panel, and the flush-parked case still falls back
     * through the degenerate-band path. null = a plain static wall.
     *
     * @returns {string|null} instance code
     */
    _moverCodeForSlot(ld, slotInfo) {
        if (ld.left < 0) {
            return null;
        }
        const {sidedefs} = this._level;
        const far = sidedefs[((slotInfo.side === 'right') ? ld.left : ld.right)].sector;

        if (slotInfo.slot === 'upper') {
            return ((this._builtDoorCodes.has('door_' + far)) ? ('door_' + far) : null);
        }
        if ((slotInfo.slot === 'lower') && this._builtLiftCodes.has('lift_' + far)) {
            return ('lift_' + far);
        }

        return null;
    }

    _floorMoverCode(si) {
        if (this._builtRisingCodes.has('risingfloor_' + si)) {
            return 'risingfloor_' + si;
        }
        if (this._builtLiftCodes.has('lift_' + si)) {
            return 'lift_' + si;
        }
        if (this._builtStairCodes.has('stair_' + si)) {
            return 'stair_' + si;
        }

        return null;
    }

    // Last-resort resolution for a panel with no geometry of its own (flush
    // parked, degenerate band): any mover touching the line, floors first.
    _anyMoverOn(ld) {
        const {sidedefs} = this._level;
        for (const sd of [ld.right, ld.left]) {
            if (sd < 0) {
                continue;
            }
            const si = sidedefs[sd].sector;
            const floorCode = this._floorMoverCode(si);
            if (floorCode !== null) {
                return floorCode;
            }
            if (this._builtDoorCodes.has('door_' + si)) {
                return 'door_' + si;
            }
        }

        return null;
    }

    // Action radius: half the 3D bounding diagonal + margin. The trigger is 3D
    // and the wall centre is at mid-height, so the height must be included — a
    // small fixed radius would force the player to hug the panel.
    _meshRadius(mesh) {
        const xs = mesh.points.map((p) => p[0]);
        const ys = mesh.points.map((p) => p[1]);
        const zs = mesh.points.map((p) => p[2]);
        const dx = Math.max(...xs) - Math.min(...xs);
        const dy = Math.max(...ys) - Math.min(...ys);
        const dz = Math.max(...zs) - Math.min(...zs);

        return Math.sqrt(dx * dx + dy * dy + dz * dz) / 2.0 + WadConstants.DOOR_ACTION_RADIUS;
    }

    // Tagged lift + rising-floor + door instances of the same tag (shared
    // resolver). start() is type-agnostic, so a remote door (trigger 'none')
    // opens exactly like a switch-driven lift or rising floor.
    _resolveTargets(ld) {
        return WadMapAnalyzer.resolveTaggedTargets(this._level.sectors, ld.tag, WadMapAnalyzer.moverFamilies(
            this._analysis, this._level.sectors,
            {lifts: this._builtLiftCodes, rising: this._builtRisingCodes, doors: this._builtDoorCodes, stairs: this._builtStairCodes},
            ld.special));
    }

    /**
     * Vertical band, pegging and winding of the switch quad — replicates exactly
     * the static wall section the SW graphic sits on, so the swapped texture
     * stays aligned: a one-sided full-height middle, or the lower (step riser) /
     * upper (ceiling header) of a two-sided line, from either side.
     *
     * @returns {{sd, yBotDu, yTopDu, yo, flip, light, lightSi}} heights in Doom units
     */
    _switchBand(ld, slotInfo, th) {
        const {sidedefs, sectors} = this._level;
        const rSd  = sidedefs[ld.right];
        const rSec = sectors[rSd.sector];
        const lowerUnpeg = ((ld.flags & WadConstants.ML_DONTPEGBOTTOM) !== 0);
        const upperUnpeg = ((ld.flags & WadConstants.ML_DONTPEGTOP) !== 0);

        if (slotInfo.slot === 'middle') {
            // A switch inside a DOOR sector spans the door's OPEN heights,
            // like the static one-sided door walls (DOORTRAK rule): hidden
            // inside the closed shutter, revealed when it opens (MAP20's
            // SW1GARG alcove) — the door slab has no face on a one-sided edge.
            const doorH = this._analysis.doorHeights[rSd.sector];
            const yBot  = ((doorH !== undefined) ? doorH.floorH : rSec.fh);
            const yTop  = ((doorH !== undefined) ? doorH.ceilH : rSec.ch);
            const hDoom = yTop - yBot;
            return {sd: rSd, yBotDu: yBot, yTopDu: yTop,
                yo: rSd.yo + ((lowerUnpeg) ? (th - hDoom) : 0), flip: true, light: rSec.light, lightSi: rSd.sector};
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
                    yo: rSd.yo + ((lowerUnpeg) ? (rCh - lFh) : 0), flip: true, light: rSec.light, lightSi: rSd.sector};
            }
            return {sd: lSd, yBotDu: lFh, yTopDu: rFh,
                yo: lSd.yo + ((lowerUnpeg) ? (lCh - rFh) : 0), flip: false, light: lSec.light, lightSi: lSd.sector};
        }

        // upper
        if (slotInfo.side === 'right') {
            return {sd: rSd, yBotDu: lCh, yTopDu: rCh,
                yo: rSd.yo + ((upperUnpeg) ? 0 : (th - (rCh - lCh))), flip: true, light: rSec.light, lightSi: rSd.sector};
        }
        return {sd: lSd, yBotDu: rCh, yTopDu: lCh,
            yo: lSd.yo + ((upperUnpeg) ? 0 : (th - (lCh - rCh))), flip: false, light: lSec.light, lightSi: lSd.sector};
    }
}
