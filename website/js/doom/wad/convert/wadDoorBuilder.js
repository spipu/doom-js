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

    // Full-height panels: from the adjacent floor to the neighbour's static
    // ceiling, riding with the panel (door on right → flip=false, door on
    // left → flip=true, facing the neighbour). Texture: the neighbour-side
    // upper (the viewer-side sidedef, as vanilla renders it) — toward ANOTHER
    // door/crusher sector, whose slot draws no static band and whose own panel
    // cannot cover this one's flank when the two desynchronise (adjacent
    // crushers on different tags), the OWN upper serves as fallback. The
    // parked flank also stands in for the static upper band between the two
    // ceilings.
    _buildPanels(mesh, si, floorH) {
        const {vertexes, linedefs, sidedefs, sectors} = this._level;
        const {doorSectorIds, doorHeights} = this._analysis;
        const SCALE = WadConstants.SCALE;

        for (const ld of linedefs) {
            if (ld.right < 0 || ld.left < 0) {
                continue;
            }
            const rSi2 = sidedefs[ld.right].sector;
            const lSi2 = sidedefs[ld.left].sector;
            const doorOnRight = (rSi2 === si);
            if (!doorOnRight && lSi2 !== si) {
                continue;
            }
            const neighbourSi  = ((doorOnRight) ? lSi2 : rSi2);
            const neighbourSec = sectors[neighbourSi];
            // Ceiling the flank rises against: an opening door neighbour is
            // stored closed in the WAD (raw ch == fh) but still opens — judge
            // and span with its patched open ceiling. Closed non-door
            // neighbours (e.g. the spacer block between two crusher rows) stay
            // skipped: no opening ever sees this face — and it would z-fight
            // the static riser drawn on the same edge.
            const neighbourCh = (doorHeights[neighbourSi]?.ceilH ?? neighbourSec.ch);
            if (neighbourCh <= neighbourSec.fh) {
                continue;
            }

            const neighbourSd = sidedefs[((doorOnRight) ? ld.left : ld.right)];
            const ownSd       = sidedefs[((doorOnRight) ? ld.right : ld.left)];
            const validUpper  = (sd) => ((sd.upper && sd.upper !== '-') ? sd : null);
            const srcSd = ((doorSectorIds.has(neighbourSi))
                ? (validUpper(neighbourSd) ?? validUpper(ownSd))
                : validUpper(neighbourSd));
            if (srcSd === null) {
                continue;
            }
            const ti = this._bank.ensureWallTex(srcSd.upper);
            if (ti < 0) {
                continue;
            }

            const [dx1, dy1] = vertexes[ld.v1];
            const [dx2, dy2] = vertexes[ld.v2];
            const [wx1, wz1] = WadGeometry.doomToWorld(dx1, dy1);
            const [wx2, wz2] = WadGeometry.doomToWorld(dx2, dy2);
            const wallLen    = WadGeometry.wallLengthDoom(vertexes, ld.v1, ld.v2);
            const upperUnpeg = ((ld.flags & WadConstants.ML_DONTPEGTOP) !== 0);

            const {width: tw, height: th} = this._bank.getDims(ti);
            const hPanel = neighbourCh - floorH;
            const yo = srcSd.yo + ((upperUnpeg) ? 0 : (th - hPanel));
            WadMeshBuilder.addWallQuad(mesh, ti,
                wx1, wz1, wx2, wz2,
                floorH * SCALE, neighbourCh * SCALE,
                wallLen, tw, th,
                {xOff: srcSd.xo, yOff: yo, flip: !doorOnRight, light: neighbourSec.light, lightGroup: WadMapAnalyzer.lightGroupOf(this._analysis, neighbourSi)});
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
        const speedTics = props.speed;

        const radius = ((mesh.points.length > 0)
            ? WadMeshBuilder.xzActionRadius(mesh)
            : WadConstants.DOOR_ACTION_RADIUS);

        let keyframes = this._cycleKeyframes(props.anim, speedTics, props.closeMargin, floorH, ceilH, restDu, props.timerDelayS);

        // Timer door 14: hold the (closed) rest position for the level-load
        // countdown, then run the normal open-wait-close cycle once. The trap
        // shape (10) consumes its countdown inside its own keyframes.
        if (props.timerDelayS > 0 && props.anim !== 'trap-close') {
            keyframes = [keyframes[0], ...keyframes.map((k) => ({...k, t: k.t + props.timerDelayS}))];
        }

        // One cycle per special aiming at this door, the crossed line picking
        // its own at start() time: E1M4 tag 1 mixes two open cycles, E1M6 tag 1
        // an open-stay with a close-wait-open, E4M9 tag 2 an opener with a
        // crusher. Left out: the doors a closing special registered (single
        // structural cycle). A timer door keeps its countdown baked into the
        // base keyframes but still carries the per-special cycles — a close
        // line aimed at a special-10 trap must not replay the trap cycle.
        const variantNames = Object.keys(props.variants ?? {});
        let keyframeVariants = null;
        if (!props.close && (variantNames.length > ((props.timerDelayS > 0) ? 0 : 1))) {
            keyframeVariants = {};
            for (const key of variantNames) {
                keyframeVariants[key] = this._buildCycle(props.variants[key], floorH, ceilH, restDu);
            }
        }

        const press = WadConstants.doorPressProfile(props.anim, speedTics, props.closeMargin);

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
            blockedBehavior:   press.behavior,
            blockedSlowFactor: ((press.slow) ? WadConstants.PRESS_SLOW_FACTOR : 1),
            crushDamage:       ((press.damage) ? WadConstants.crushDamageDescriptor() : null),
            keyRequired:       props.keyRequired,
            keyframes:         keyframes,
            keyframeVariants:  keyframeVariants,
            defaultVariant:    ((keyframeVariants !== null) ? WadConstants.doorCycleKey(props.anim, speedTics) : null)
        };
    }

    // One declared cycle: its timeline plus the playback rules that belong to
    // it — a crusher loops and grinds where the plain door cycle of the same
    // sector does neither.
    _buildCycle(variant, floorH, ceilH, restDu) {
        const press = WadConstants.doorPressProfile(variant.anim, variant.speed, variant.closeMargin);

        return {
            keyframes:         this._cycleKeyframes(variant.anim, variant.speed, variant.closeMargin, floorH, ceilH, restDu),
            onlyOnce:          variant.onlyOnce,
            loop:              variant.loop,
            blockedBehavior:   press.behavior,
            blockedSlowFactor: ((press.slow) ? WadConstants.PRESS_SLOW_FACTOR : 1),
            crushDamage:       ((press.damage) ? WadConstants.crushDamageDescriptor() : null)
        };
    }

    // Keyframes of ONE door cycle, from its own rest pose: the open cycles rest
    // CLOSED, every closing one rests parked open above the ceiling.
    _cycleKeyframes(anim, speedTics, closeMargin, floorH, ceilH, restDu, timerDelayS = 0) {
        const travelY = (ceilH - floorH) * WadConstants.SCALE;
        const marginY = closeMargin * WadConstants.SCALE;
        const openS   = (ceilH - floorH - restDu) / speedTics / 35.0;
        const closeS  = (ceilH - floorH - closeMargin) / speedTics / 35.0;

        // Descends to the floor — or to floor + closeMargin for the crush
        // ceilings 44/72 (lowerAndCrush stops 8 above it) — and stays there.
        if (anim === 'close-stay') {
            return [
                {t: 0.0,    translate: [0, travelY, 0], rotate: [0, 0, 0]},
                {t: closeS, translate: [0, marginY, 0], rotate: [0, 0, 0]}
            ];
        }
        // Crusher (6/25/49/73/77/141): oscillates down to floor + 8 and back
        // with no wait at either end (p_ceilng.c T_MoveCeiling crushAndRaise).
        // loop repeats the cycle; a stop line (57/74) pauses it, start() resumes.
        if (anim === 'crusher') {
            return [
                {t: 0.0,        translate: [0, travelY, 0], rotate: [0, 0, 0]},
                {t: closeS,     translate: [0, marginY, 0], rotate: [0, 0, 0]},
                {t: 2 * closeS, translate: [0, travelY, 0], rotate: [0, 0, 0]}
            ];
        }
        // Sector special 10: closed rest — the cycle opens the panel and holds
        // it so the close STARTS exactly at the countdown (vanilla: 30 s after
        // load). autoStart plays it at level load; a USE replays it to reopen.
        if (anim === 'trap-close') {
            return [
                {t: 0.0,                 translate: [0, 0, 0],       rotate: [0, 0, 0]},
                {t: openS,               translate: [0, travelY, 0], rotate: [0, 0, 0]},
                {t: timerDelayS,         translate: [0, travelY, 0], rotate: [0, 0, 0]},
                {t: timerDelayS + openS, translate: [0, 0, 0],       rotate: [0, 0, 0]}
            ];
        }
        // close30ThenOpen: close, wait 30 s, reopen to the parked rest.
        if (anim === 'close-wait-open') {
            const reopenWaitS = WadConstants.DOOR_CLOSE_REOPEN_WAIT_TICS / 35.0;
            return [
                {t: 0.0,                         translate: [0, travelY, 0], rotate: [0, 0, 0]},
                {t: openS,                       translate: [0, 0, 0],       rotate: [0, 0, 0]},
                {t: openS + reopenWaitS,         translate: [0, 0, 0],       rotate: [0, 0, 0]},
                {t: openS + reopenWaitS + openS, translate: [0, travelY, 0], rotate: [0, 0, 0]}
            ];
        }

        return this._openCycleKeyframes(anim, speedTics, floorH, ceilH, restDu);
    }

    // Open-door cycle from the rest position (restDu — the sector's own
    // ceiling for the ceiling raisers) up to ceilH at the given speed:
    // 'one-way' = open-stay, anything else = open-wait-close + 1 s rest.
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
