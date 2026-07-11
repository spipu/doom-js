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
        const {linedefs, sidedefs, sectors} = this._level;
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
                // Closed neighbour (e.g. the spacer block between two crusher
                // rows): no opening ever sees this face — and it would z-fight
                // the static riser drawn on the same edge.
                if (lSec2.ch <= lSec2.fh) {
                    continue;
                }
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
                    {xOff: lSd.xo, yOff: yo, flip: false, light: lSec2.light, lightGroup: WadMapAnalyzer.lightGroupOf(this._analysis, lSi2)});
            } else if (lSi2 === si && !doorSectorIds.has(rSi2)) {
                // Door on left, corridor on right
                const rSd   = sidedefs[ld.right];
                const rSec2 = sectors[rSi2];
                // Closed neighbour: same rule as the mirrored branch above.
                if (rSec2.ch <= rSec2.fh) {
                    continue;
                }
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
                    {xOff: rSd.xo, yOff: yo, flip: true, light: rSec2.light, lightGroup: WadMapAnalyzer.lightGroupOf(this._analysis, rSi2)});
            }
        }
    }

    // Bottom flat: ceiling flat of the door sector, visible from below when
    // the panel rises. No top flat (z-fight with the static ceiling). Holes
    // preserved (a ring-shaped sector must not cover the inner one).
    _buildBottomFlat(mesh, si, sec, floorH) {
        const {vertexes, linedefs, sidedefs} = this._level;

        if (sec.ct.startsWith('F_SKY')) {
            return;
        }
        const ct = this._bank.ensureFlatTex(sec.ct);
        if (ct < 0) {
            return;
        }

        for (const p of WadSectorPolygons.outersWithHoles(si, linedefs, sidedefs, vertexes)) {
            WadMeshBuilder.addFlatQuad(mesh, ct, p.outer, floorH, false, sec.light, p.holes, WadMapAnalyzer.lightGroupOf(this._analysis, si));
        }
    }

    _buildInstanceData(doorName, si, floorH, ceilH, mesh) {
        const props = this._analysis.doorProps[si];
        // Rest position of the panel: a door rests closed at its floor; a
        // ceiling raiser (40) rests at the sector's OWN ceiling — a partially
        // open sector keeps its slit — and travels up to ceilH from there.
        const restDu    = ((props.ceilingRaise === true) ? (this._level.sectors[si].ch - floorH) : 0);
        const restY     = restDu * WadConstants.SCALE;
        const travelY   = (ceilH - floorH) * WadConstants.SCALE;
        const speedTics = props.speed;

        const radius = ((mesh.points.length > 0)
            ? WadMeshBuilder.xzActionRadius(mesh)
            : WadConstants.DOOR_ACTION_RADIUS);

        const openS = (ceilH - floorH - restDu) / speedTics / 35.0;
        const waitS = WadConstants.DOOR_WAIT_TICS / 35.0;

        let keyframes;
        if (props.anim === 'one-way' || props.anim === 'round-trip') {
            keyframes = this._openCycleKeyframes(props.anim, speedTics, floorH, ceilH, restDu);
        } else if (props.anim === 'close-stay') {
            // Closing door: rest = panel parked open above the ceiling
            // (keyframe 0 at +travelY, applied from finalizeInit), descends to
            // the floor — or to floor + closeMargin for the crush ceilings
            // 44/72 (lowerAndCrush stops 8 above the floor) — and stays there.
            const marginY = props.closeMargin * WadConstants.SCALE;
            const closeS  = (ceilH - floorH - props.closeMargin) / speedTics / 35.0;
            keyframes = [
                {t: 0.0,    translate: [0, travelY, 0], rotate: [0, 0, 0]},
                {t: closeS, translate: [0, marginY, 0], rotate: [0, 0, 0]}
            ];
        } else if (props.anim === 'crusher') {
            // Crusher (6/25/49/73/77/141): rests OPEN at the sector's own
            // ceiling (parked keyframe 0, like a closing door) and oscillates
            // down to floor + 8 and back with no wait at either end
            // (p_ceilng.c T_MoveCeiling crushAndRaise). loop repeats the cycle;
            // a stop line (57/74) pauses it in place, start() resumes.
            const marginY = props.closeMargin * WadConstants.SCALE;
            const moveS   = (ceilH - floorH - props.closeMargin) / speedTics / 35.0;
            keyframes = [
                {t: 0.0,       translate: [0, travelY, 0], rotate: [0, 0, 0]},
                {t: moveS,     translate: [0, marginY, 0], rotate: [0, 0, 0]},
                {t: 2 * moveS, translate: [0, travelY, 0], rotate: [0, 0, 0]}
            ];
        } else if (props.anim === 'trap-close') {
            // Sector special 10: closed rest — the cycle opens the panel and
            // holds it so the close STARTS exactly at the countdown (vanilla:
            // 30 s after load), then shuts. autoStart plays it at level load;
            // a USE (the sector's own DR lines) replays the cycle to reopen.
            keyframes = [
                {t: 0.0,                       translate: [0, 0, 0],       rotate: [0, 0, 0]},
                {t: openS,                     translate: [0, travelY, 0], rotate: [0, 0, 0]},
                {t: props.timerDelayS,         translate: [0, travelY, 0], rotate: [0, 0, 0]},
                {t: props.timerDelayS + openS, translate: [0, 0, 0],       rotate: [0, 0, 0]}
            ];
        } else if (props.anim === 'close-wait-open') {
            // Close, wait 30 s (close30ThenOpen), reopen to the parked rest.
            const reopenWaitS = WadConstants.DOOR_CLOSE_REOPEN_WAIT_TICS / 35.0;
            keyframes = [
                {t: 0.0,                         translate: [0, travelY, 0], rotate: [0, 0, 0]},
                {t: openS,                       translate: [0, 0, 0],       rotate: [0, 0, 0]},
                {t: openS + reopenWaitS,         translate: [0, 0, 0],       rotate: [0, 0, 0]},
                {t: openS + reopenWaitS + openS, translate: [0, travelY, 0], rotate: [0, 0, 0]}
            ];
        } else {
            // Unknown anim (never produced by the tables): plain round-trip.
            keyframes = this._openCycleKeyframes('round-trip', speedTics, floorH, ceilH, restDu);
        }

        // Timer door 14: hold the (closed) rest position for the level-load
        // countdown, then run the normal open-wait-close cycle once. The trap
        // shape (10) consumes its countdown inside its own keyframes above.
        if (props.timerDelayS > 0 && props.anim !== 'trap-close') {
            keyframes = [keyframes[0], ...keyframes.map((k) => ({...k, t: k.t + props.timerDelayS}))];
        }

        // Per-trigger keyframe variants: when several open-door anims target
        // this door (E1M4 tag 1: 12× 90 OWC + 4× 86 open-stay), the crossed
        // line's special picks its cycle at start() time. Only for plain open
        // doors — the close/crusher/trap cycles are structural (parked panel)
        // and never mix.
        let keyframeVariants = null;
        const variantNames = Object.keys(props.variants ?? {});
        if (!props.close && (props.anim === 'one-way' || props.anim === 'round-trip') && variantNames.length > 1) {
            keyframeVariants = {};
            for (const key of variantNames) {
                const v = props.variants[key];
                keyframeVariants[key] = {
                    keyframes: this._openCycleKeyframes(v.anim, v.speed, floorH, ceilH, restDu),
                    onlyOnce:  v.onlyOnce
                };
            }
        }

        return {
            code:              doorName,
            position:          [0, 0, 0],
            rotation:          [0, 0, 0],
            trigger:           props.trigger,
            autoStart:         props.autoStart,
            loop:              props.loop,
            onlyOnce:          props.onlyOnce,
            collisionShape:    'faces',
            // Remote doors (trigger 'none') are opened only by their switch, so
            // they carry no proximity radius — same convention as switch-driven lifts.
            interactionRadius: ((props.trigger === 'none') ? null : radius),
            damage:            null,
            keyRequired:       props.keyRequired,
            keyframes:         keyframes,
            keyframeVariants:  keyframeVariants
        };
    }

    // Open-door cycle from the rest position (restDu — the sector's own
    // ceiling for the ceiling raisers) up to ceilH at the given speed:
    // 'one-way' = open-stay, 'round-trip' = open-wait-close + 1 s rest.
    _openCycleKeyframes(anim, speedTics, floorH, ceilH, restDu) {
        const restY   = restDu * WadConstants.SCALE;
        const travelY = (ceilH - floorH) * WadConstants.SCALE;
        const openS   = (ceilH - floorH - restDu) / speedTics / 35.0;

        if (anim === 'one-way') {
            return [
                {t: 0.0,   translate: [0, restY, 0],   rotate: [0, 0, 0]},
                {t: openS, translate: [0, travelY, 0], rotate: [0, 0, 0]}
            ];
        }
        const waitS = WadConstants.DOOR_WAIT_TICS / 35.0;
        const tRest = openS + waitS + openS;

        return [
            {t: 0.0,           translate: [0, restY, 0],   rotate: [0, 0, 0]},
            {t: openS,         translate: [0, travelY, 0], rotate: [0, 0, 0]},
            {t: openS + waitS, translate: [0, travelY, 0], rotate: [0, 0, 0]},
            {t: tRest,         translate: [0, restY, 0],   rotate: [0, 0, 0]},
            {t: tRest + 1.0,   translate: [0, restY, 0],   rotate: [0, 0, 0]}
        ];
    }
}
