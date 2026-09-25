/**
 * Door instances builder (transposition of the door generation phase of
 * convert_wad.py main()): world-space geometry + instance data with keyframes.
 */
class WadDoorBuilder extends AbstractMoverBuilder {
    _sectorIds() {
        return this._analysis.doorSectorIds;
    }

    _buildOne(si) {
        const {linedefs, sidedefs, sectors} = this._level;
        const {doorHeights} = this._analysis;
        const sec = sectors[si];

        if (doorHeights[si] === undefined) {
            return null;
        }

        let hasBounds = false;
        for (const ld of linedefs) {
            if (((ld.right >= 0) && (sidedefs[ld.right].sector === si))
                || ((ld.left >= 0) && (sidedefs[ld.left].sector === si))) {
                hasBounds = true;
                break;
            }
        }
        if (!hasBounds) {
            return null;
        }

        const {floorH, ceilH} = doorHeights[si];
        const doorCode = 'door_' + si;

        const mesh = WadMeshBuilder.newMesh();
        this._buildPanels(mesh, si, floorH);
        this._buildBottomFlat(mesh, si, sec, floorH);

        const textures = this._meshTextures(mesh);
        if (textures === null) {
            return null;
        }

        return {
            code:         doorCode,
            textures:     textures,
            mesh:         mesh,
            instanceData: this._buildInstanceData(doorCode, si, floorH, ceilH, mesh)
        };
    }

    // Full-height panels, from the adjacent floor to the neighbour's static
    // ceiling, facing the neighbour. Texture: the neighbour-side upper, as
    // vanilla renders it; toward ANOTHER door sector, which draws no static
    // band and may desynchronise (adjacent crushers on different tags), the
    // OWN upper serves as fallback.
    _buildPanels(mesh, si, floorH) {
        const {vertexes, linedefs, sidedefs, sectors} = this._level;
        const {doorSectorIds, doorHeights} = this._analysis;
        const SCALE = WadConstants.SCALE;

        for (const ld of linedefs) {
            if ((ld.right < 0) || (ld.left < 0)) {
                continue;
            }
            const rightSi     = sidedefs[ld.right].sector;
            const leftSi      = sidedefs[ld.left].sector;
            const doorOnRight = (rightSi === si);
            if (!doorOnRight && (leftSi !== si)) {
                continue;
            }
            const neighbourSi  = ((doorOnRight) ? leftSi : rightSi);
            const neighbourSec = sectors[neighbourSi];
            // A door neighbour is stored closed in the WAD: span up to its open
            // ceiling. A closed non-door neighbour never shows this face (and it
            // would z-fight the static riser on the same edge).
            const neighbourCh = (doorHeights[neighbourSi]?.ceilH ?? neighbourSec.ch);
            if (neighbourCh <= neighbourSec.fh) {
                continue;
            }

            const neighbourSd = sidedefs[((doorOnRight) ? ld.left : ld.right)];
            const ownSd       = sidedefs[((doorOnRight) ? ld.right : ld.left)];
            const withUpper   = (sd) => ((WadTextureBank.isBlank(sd.upper)) ? null : sd);
            const srcSd = ((doorSectorIds.has(neighbourSi))
                ? (withUpper(neighbourSd) ?? withUpper(ownSd))
                : withUpper(neighbourSd));
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
    // the panel rises. No top flat (z-fight with the static ceiling).
    _buildBottomFlat(mesh, si, sec, floorH) {
        if (WadConstants.isSkyFlat(sec.ct)) {
            return;
        }
        const ct = this._bank.ensureFlatTex(sec.ct);
        if (ct < 0) {
            return;
        }
        WadMeshBuilder.addSectorFlat(mesh, this._level, ct, si, floorH, false, sec.light,
            {lightGroup: WadMapAnalyzer.lightGroupOf(this._analysis, si), noDecal: this._bank.isLiquidFlat(sec.ct)});
    }

    _buildInstanceData(doorCode, si, floorH, ceilH, mesh) {
        const props = this._analysis.doorProps[si];
        // The closing and trap cycles own their rest pose; the others rest at the sector's own ceiling.
        const ownsRest  = ((props.close === true) || (props.anim === 'trap-close'));
        const restDu    = ((ownsRest) ? 0 : Math.max(0, this._level.sectors[si].ch - floorH));
        const speedTics = props.speed;

        const radius = ((mesh.points.length > 0)
            ? WadMeshBuilder.xzActionRadius(mesh)
            : WadConstants.DOOR_ACTION_RADIUS);

        let keyframes = this._cycleKeyframes(props.anim, speedTics, props.closeMargin, floorH, ceilH, restDu, props.timerDelayS);

        // Timer door 14: hold the (closed) rest position for the level-load
        // countdown, then run the normal open-wait-close cycle once. The trap
        // shape (10) consumes its countdown inside its own keyframes.
        if ((props.timerDelayS > 0) && (props.anim !== 'trap-close')) {
            keyframes = [keyframes[0], ...keyframes.map((k) => ({...k, t: k.t + props.timerDelayS}))];
        }

        // One cycle per special aiming at this door (E1M6 tag 1 mixes an
        // open-stay with a close-wait-open), declared only when one differs from
        // the base timeline. A timer door's default stays null: start() falls
        // back to the base, which carries the level-load countdown.
        const baseKey        = WadConstants.doorCycleKey(props.anim, speedTics);
        const variantNames   = Object.keys(props.variants ?? {});
        const baseIsVariant  = variantNames.includes(baseKey);
        let keyframeVariants = null;
        if (variantNames.some((key) => (key !== baseKey))) {
            keyframeVariants = {};
            for (const key of variantNames) {
                keyframeVariants[key] = this._buildCycle(props.variants[key], floorH, ceilH, restDu);
            }
        }

        const press = WadConstants.doorPressProfile(props.anim, speedTics, props.closeMargin);

        return {
            code:              doorCode,
            position:          [0, 0, 0],
            rotation:          [0, 0, 0],
            trigger:           props.trigger,
            autoStart:         props.autoStart,
            loop:              props.loop,
            onlyOnce:          props.onlyOnce,
            collisionShape:    'faces',
            // Remote doors (trigger 'none') are opened only by their switch.
            interactionRadius: ((props.trigger === 'none') ? null : radius),
            damage:            null,
            ...WadConstants.pressCycleFields(press),
            keyframes:         keyframes,
            keyframeVariants:  keyframeVariants,
            defaultVariant:    ((keyframeVariants !== null) ? (props.pressVariant ?? ((baseIsVariant) ? baseKey : null)) : null)
        };
    }

    // One declared cycle: its timeline plus the playback rules that belong to
    // it — a crusher loops and grinds where the plain door cycle of the same
    // sector does neither.
    _buildCycle(variant, floorH, ceilH, restDu) {
        const press = WadConstants.doorPressProfile(variant.anim, variant.speed, variant.closeMargin);

        return {
            keyframes: this._cycleKeyframes(variant.anim, variant.speed, variant.closeMargin, floorH, ceilH, restDu),
            onlyOnce:  variant.onlyOnce,
            loop:      variant.loop,
            ...WadConstants.pressCycleFields(press)
        };
    }

    // Keyframes of ONE door cycle, from its own rest pose: the open cycles rest
    // CLOSED, every closing one rests parked open above the ceiling.
    _cycleKeyframes(anim, speedTics, closeMargin, floorH, ceilH, restDu, timerDelayS = 0) {
        const travelY = (ceilH - floorH) * WadConstants.SCALE;
        const marginY = closeMargin * WadConstants.SCALE;
        const openS   = WadConstants.moveDurationS(ceilH - floorH - restDu, speedTics);
        const closeS  = WadConstants.moveDurationS(ceilH - floorH - closeMargin, speedTics);

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
            const reopenWaitS = WadConstants.DOOR_CLOSE_REOPEN_WAIT_TICS * WadConstants.SECONDS_PER_TIC;
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
        const openS   = WadConstants.moveDurationS(ceilH - floorH - restDu, speedTics);

        if (anim === 'one-way') {
            return [
                {t: 0.0,   translate: [0, restY, 0],   rotate: [0, 0, 0]},
                {t: openS, translate: [0, travelY, 0], rotate: [0, 0, 0]}
            ];
        }
        const waitS = WadConstants.DOOR_WAIT_TICS * WadConstants.SECONDS_PER_TIC;
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
