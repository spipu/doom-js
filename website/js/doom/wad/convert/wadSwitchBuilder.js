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
        this._builtDoorCodes   = builtDoorCodes ?? new Set();
        this._builtStairCodes  = builtStairCodes ?? new Set();
        this._builtRisingCodes = builtRisingCodes ?? new Set();
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
        // An invisible USE zone with nothing to fire is dead weight (a visible
        // panel is always kept — it may be an exit or just cosmetic).
        if ((slotInfo.invisible === true) && (targets.length === 0) && !isExit) {
            return null;
        }

        const interactionConfig = WadConstants.SWITCH_INTERACTION_BY_SPECIAL[ld.special] ?? ['once', null, null];

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
                keyRequired:       WadConstants.DOOR_KEY_BY_SPECIAL[ld.special] ?? null,
                keyframes:         []
            },
            interactionSpec: {
                code:           switchName,
                mode:           interactionConfig[0],
                tOn:            interactionConfig[1],
                tOff:           interactionConfig[2],
                targets:        split.start,
                reverseTargets: split.reverse,
                // Per-trigger door cycle (OWC vs open-stay on the same tag);
                // null for non-door specials, ignored by variant-less targets.
                doorVariant:    WadConstants.DOOR_ANIM_BY_SPECIAL[ld.special] ?? null,
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
        const {width: tw, height: th} = this._bank.getDims(ti);

        const [dx1, dy1] = vertexes[ld.v1];
        const [dx2, dy2] = vertexes[ld.v2];
        const [wx1, wz1] = WadGeometry.doomToWorld(dx1, dy1);
        const [wx2, wz2] = WadGeometry.doomToWorld(dx2, dy2);
        const wallLen = WadGeometry.wallLengthDoom(vertexes, ld.v1, ld.v2);

        const band = this._switchBand(ld, slotInfo, th);

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
            {xOff: band.sd.xo, yOff: band.yo, flip: band.flip, light: band.light});

        // SW1 = local index 1 (referenced by the faces), SW2 = local index 2
        const extras = ((ti2 >= 0) ? [ti2 + 1] : []);
        const localIndices = WadMeshBuilder.remapLocalTextures(mesh.faces, extras);

        return {textures: localIndices, mesh: mesh, radius: this._meshRadius(mesh), collisionShape: 'faces'};
    }

    // Invisible USE zone: a switch-special line with no SWxxx graphic (e.g. an
    // SR lift edge). One point, no faces, no collision — the wall it sits on (a
    // lift riser, a step) is already drawn elsewhere; pressing within the radius
    // fires the targets. The USE analog of a walk-trigger zone.
    _buildUseZoneGeometry(ld) {
        const SCALE = WadConstants.SCALE;
        const {vertexes, sidedefs, sectors} = this._level;

        const [dx1, dy1] = vertexes[ld.v1];
        const [dx2, dy2] = vertexes[ld.v2];
        const fh = ((ld.right >= 0) ? sectors[sidedefs[ld.right].sector].fh : 0);
        const [cwx, cwz] = WadGeometry.doomToWorld((dx1 + dx2) / 2, (dy1 + dy2) / 2);
        const cwy = fh * SCALE + (WadConstants.PLAYER_HEIGHT / 2);
        const lenWorld = WadGeometry.wallLengthDoom(vertexes, ld.v1, ld.v2) * SCALE;

        const mesh = WadMeshBuilder.newMesh();
        mesh.points.push([cwx, cwy, cwz]);

        return {textures: [], mesh: mesh, radius: (lenWorld / 2) + WadConstants.DOOR_ACTION_RADIUS, collisionShape: 'none'};
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
        return WadMapAnalyzer.resolveTaggedTargets(this._level.sectors, ld.tag, [
            {ids: this._analysis.movingFloorDownIds, prefix: 'lift_',        built: this._builtLiftCodes},
            // Donut rings carry no tag of their own: match them by the trigger
            // tag stored at identification (same pattern as the stairs below).
            {ids: this._analysis.risingFloorIds,     prefix: 'risingfloor_', built: this._builtRisingCodes,
                tagOf: (si) => this._analysis.donutRingTag[si] ?? this._level.sectors[si].tag},
            {ids: this._analysis.doorSectorIds,      prefix: 'door_',        built: this._builtDoorCodes},
            // Stairs: only the base step carries the trigger tag, so match every
            // step of the staircase by its stored stairStepTag instead.
            {ids: this._analysis.stairIds, prefix: 'stair_', built: this._builtStairCodes,
                tagOf: (si) => this._analysis.stairStepTag[si]}
        ]);
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
