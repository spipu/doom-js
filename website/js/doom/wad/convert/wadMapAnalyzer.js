/**
 * Identification of the moving elements of a level (transposition of the
 * door/lift/switch identification phases of convert_wad.py main()).
 *
 * WARNING: analyze() patches sectors[si].fh in place for the floor-moves-down
 * sectors, so the static map shows the lifts in down position.
 */
class WadMapAnalyzer {
    /**
     * @param {object} level - output of WadLevelParser.parse()
     * @param {object} options - {bossLinedefs: [{special, tag, left, right}],
     *                            textureHeightOf: (name) => int|null}
     */
    constructor(level, options = null) {
        this._level           = level;
        this._bossLinedefs    = (options?.bossLinedefs ?? []);
        this._textureHeightOf = (options?.textureHeightOf ?? (() => null));
    }

    // Mover passes also iterate the boss-death actions (A_BossDeath dummy line),
    // kept out of level.linedefs so no geometry pass ever sees them.
    _moverLinedefs() {
        return ((this._bossLinedefs.length === 0)
            ? this._level.linedefs
            : this._level.linedefs.concat(this._bossLinedefs));
    }

    analyze() {
        const donuts = this._identifyDonuts();
        const doors = this._identifyDoors();
        const lifts = this._identifyLifts(doors.doorSectorIds, donuts.holeTargetFh);
        const liftLowerVariants = this._identifyLiftLowers(lifts);
        this._patchLiftFloors(lifts);
        const liftRaiseVariants = this._identifyLiftRaises(lifts);
        const rising = this._identifyRisingFloors(doors.doorSectorIds, lifts.liftIds, lifts.instantRaise, lifts.liftOriginalFh);
        const ringChanges = this._mergeDonutRings(donuts, doors.doorSectorIds, lifts.liftIds, rising);
        const stairs = this._identifyStairs(doors.doorSectorIds, lifts.liftIds, rising.risingFloorIds);
        const doorHeights = this._computeDoorHeights(doors.doorSectorIds, doors.doorProps);
        const floorChange = this._identifyFloorChanges(lifts, rising, ringChanges);
        const switches = this._identifySwitches(lifts.liftOriginalFh);
        const floorMovers = this._identifyFloorMovers(lifts, rising, stairs);
        const teleporterLinedefs = this._identifyTeleporters();
        const walkTriggerLinedefs = this._identifyWalkTriggers();
        const gunTriggerLinedefs = this._identifyGunTriggers();
        const lightSectors = this._identifyLightSectors();
        const sectorGraph = this._buildSectorGraph();

        return {
            doorSectorIds:         doors.doorSectorIds,
            doorProps:             doors.doorProps,
            doorHeights:           doorHeights,
            liftIds:               lifts.liftIds,
            liftSectorSpecial:     lifts.liftSectorSpecial,
            liftOriginalFh:        lifts.liftOriginalFh,
            liftLowestFh:          lifts.liftLowestFh,
            liftBaseTargetFh:      lifts.liftBaseTargetFh,
            liftMaxAdjFh:          lifts.liftMaxAdjFh,
            liftRaiseVariants:     liftRaiseVariants,
            liftLowerVariants:     liftLowerVariants,
            risingFloorIds:        rising.risingFloorIds,
            risingFloorSpecial:    rising.risingFloorSpecial,
            risingFloorTargetFh:   rising.risingFloorTargetFh,
            risingFloorInstantIds: rising.risingFloorInstantIds,
            risingFloorPopUpRise:  rising.risingFloorPopUpRise,
            risingFloorStaging:    rising.risingFloorStaging,
            floorMovers:           floorMovers,
            stairIds:              stairs.stairIds,
            stairInfo:             stairs.stairInfo,
            stairStepTag:          stairs.stairStepTag,
            donutRingTag:          donuts.ringTag,
            floorChange:           floorChange,
            switchLinedefIds:      switches.ids,
            switchWalls:           switches.walls,
            teleporterLinedefs:    teleporterLinedefs,
            walkTriggerLinedefs:   walkTriggerLinedefs,
            gunTriggerLinedefs:    gunTriggerLinedefs,
            lightSectors:          lightSectors,
            lightSectorIds:        new Set(lightSectors.map((s) => s.si)),
            sectorGraph:           sectorGraph
        };
    }

    // Sector adjacency over the two-sided linedefs (P_NoiseAlert flood-fill,
    // monster line crossings). Openness is not stored: doors move, consumers
    // read the live heights.
    _buildSectorGraph() {
        const {vertexes, linedefs, sidedefs, sectors} = this._level;
        const lines    = [];
        const bySector = sectors.map(() => []);
        for (let li = 0; li < linedefs.length; li++) {
            const ld = linedefs[li];
            if ((ld.right < 0) || (ld.left < 0)) {
                continue;
            }
            const siR = sidedefs[ld.right].sector;
            const siL = sidedefs[ld.left].sector;
            if (siR === siL) {
                continue;
            }
            bySector[siR].push(lines.length);
            bySector[siL].push(lines.length);
            lines.push({
                li:         li,
                siR:        siR,
                siL:        siL,
                soundBlock: ((ld.flags & WadConstants.ML_SOUNDBLOCK) !== 0),
                special:    ld.special,
                tag:        ld.tag,
                x1:         vertexes[ld.v1][0],
                y1:         vertexes[ld.v1][1],
                x2:         vertexes[ld.v2][0],
                y2:         vertexes[ld.v2][1]
            });
        }

        return {lines: lines, bySector: bySector};
    }

    // Light group of a face lit by sector si: si when the sector carries a
    // light effect driven at runtime, null otherwise.
    static lightGroupOf(analysis, si) {
        return ((analysis.lightSectorIds.has(si)) ? si : null);
    }

    // Sector light effects (p_spec.c P_SpawnSpecials → p_lights.c): flicker (1),
    // strobes (2/3/4 async, 12/13 sync), glow (8), fire flicker (17). maxLight =
    // the sector's own level; minLight = P_FindMinSurroundingLight (darkest
    // neighbour across two-sided lines, capped at the sector's own level) —
    // strobes fall back to 0 when no neighbour is darker, fire flicker adds
    // +16. All bounds stay in the RAW lump domain, like vanilla; the interaction
    // converts each step through WadConstants.sectorLightLevel when it renders.
    _identifyLightSectors() {
        const {linedefs, sidedefs, sectors} = this._level;

        const darkestNeighbour = {};
        for (const ld of linedefs) {
            if ((ld.right < 0) || (ld.left < 0)) {
                continue;
            }
            const rSi = sidedefs[ld.right].sector;
            const lSi = sidedefs[ld.left].sector;
            if (rSi === lSi) {
                continue;
            }
            darkestNeighbour[rSi] = Math.min(darkestNeighbour[rSi] ?? 255, sectors[lSi].lightRaw);
            darkestNeighbour[lSi] = Math.min(darkestNeighbour[lSi] ?? 255, sectors[rSi].lightRaw);
        }

        const lightSectors = [];
        for (let si = 0; si < sectors.length; si++) {
            const effect = WadConstants.LIGHT_EFFECT_BY_SPECIAL[sectors[si].special];
            if (effect === undefined) {
                continue;
            }
            const maxLight = sectors[si].lightRaw;
            let minLight = Math.min(maxLight, darkestNeighbour[si] ?? maxLight);
            if ((effect.type === 'strobe') && (minLight === maxLight)) {
                minLight = 0;
            }
            if (effect.type === 'fire') {
                minLight = minLight + WadConstants.LIGHT_FIRE_MIN_OFFSET;
            }
            lightSectors.push({
                si:       si,
                type:     effect.type,
                darkTics: (effect.darkTics ?? 0),
                sync:     (effect.sync === true),
                maxLight: maxLight,
                minLight: minLight
            });
        }

        return lightSectors;
    }

    // Walk-over linedefs (W1/WR) driving tagged movers, plus the walk-over exits.
    _identifyWalkTriggers() {
        const {linedefs} = this._level;
        const walkTriggers = [];
        for (let ldIdx = 0; ldIdx < linedefs.length; ldIdx++) {
            const ld = linedefs[ldIdx];
            // Walk doors (2/86/90/109, 'proximity' in DOOR_BY_SPECIAL) open when
            // their line is crossed, not when the door is approached.
            const isWalkLift  = WadConstants.WALK_TRIGGER_SPECIALS.has(ld.special);
            const isWalkDoor  = (WadConstants.DOOR_BY_SPECIAL[ld.special]?.trigger === 'proximity');
            const isWalkStair = WadConstants.STAIR_WALK_SPECIALS.has(ld.special);
            if ((isWalkLift || isWalkDoor || isWalkStair) && (ld.tag !== 0)) {
                walkTriggers.push({ldIdx: ldIdx, tag: ld.tag, special: ld.special});
            }
            // Exits (52 / 124 secret) ignore their tag, like the exit switches.
            if (WadConstants.WALK_EXIT_SPECIALS.has(ld.special)) {
                walkTriggers.push({ldIdx: ldIdx, tag: ld.tag, special: ld.special, isExit: true});
            }
        }
        return walkTriggers;
    }

    // Impact linedefs (G1/GR 24/46/47 — P_ShootSpecialLine): fired when a
    // hitscan trace crosses them, no zone. The tagged movers themselves are
    // registered by the door/floor passes (46 → door, 24/47 → rising floor);
    // targets and world segments are resolved in WadGunTriggerBuilder.
    _identifyGunTriggers() {
        const {linedefs} = this._level;
        const gunTriggers = [];
        for (let ldIdx = 0; ldIdx < linedefs.length; ldIdx++) {
            const ld = linedefs[ldIdx];
            if (WadConstants.GUN_SPECIALS.has(ld.special) && (ld.tag !== 0)) {
                gunTriggers.push({ldIdx: ldIdx, tag: ld.tag, special: ld.special});
            }
        }
        return gunTriggers;
    }

    // Teleport linedefs (39 W1 / 97 WR, plus the monster-only ones); the
    // landing is resolved by WadWorldBuilder, which has the things.
    _identifyTeleporters() {
        const {linedefs} = this._level;
        const teleporters = [];
        for (let ldIdx = 0; ldIdx < linedefs.length; ldIdx++) {
            const ld = linedefs[ldIdx];
            const monsterOnly = WadConstants.MONSTER_TELEPORT_SPECIALS.has(ld.special);
            if ((WadConstants.TELEPORT_SPECIALS.has(ld.special) || monsterOnly) && (ld.tag !== 0)) {
                teleporters.push({ldIdx: ldIdx, tag: ld.tag, special: ld.special, monsterOnly: monsterOnly});
            }
        }
        return teleporters;
    }

    // --- Donuts (special 9, S1 — vanilla EV_DoDonut) ---

    /**
     * The tagged hole s1 lowers to s3's floor while the untagged ring s2 rises
     * to it, then takes s3's flat with its special cleared (T_MoveFloor
     * donutRaise). s2 = across s1's first linedef; s3 = across s2's first
     * two-sided linedef not leading back to s1. ringTag stands in for the
     * ring's missing tag.
     *
     * @returns {{holeTargetFh: object, rings: object, ringTag: object}}
     */
    _identifyDonuts() {
        const {sidedefs, sectors} = this._level;
        const linedefs     = this._moverLinedefs();
        const holeTargetFh = {};
        const rings        = {};   // ring si → {targetFh, special, modelSi}
        const ringTag      = {};   // ring si → trigger tag

        const otherSide = (ld, si) => {
            const r = ((ld.right >= 0) ? sidedefs[ld.right].sector : -1);
            const l = ((ld.left >= 0) ? sidedefs[ld.left].sector : -1);
            if (r === si) {
                return l;
            }
            return ((l === si) ? r : -1);
        };

        for (const ld of linedefs) {
            if (!WadConstants.isDonutSpecial(ld.special) || (ld.tag === 0)) {
                continue;
            }
            for (let s1 = 0; s1 < sectors.length; s1++) {
                if (sectors[s1].tag !== ld.tag) {
                    continue;
                }
                const firstLd = linedefs.find((l2) => (otherSide(l2, s1) !== -1));
                if (firstLd === undefined) {
                    continue;
                }
                const s2 = otherSide(firstLd, s1);
                let s3 = -1;
                for (const l2 of linedefs) {
                    const far = otherSide(l2, s2);
                    if ((far !== -1) && (far !== s1)) {
                        s3 = far;
                        break;
                    }
                }
                if (s3 < 0) {
                    continue;
                }
                holeTargetFh[s1] = sectors[s3].fh;
                rings[s2]        = {targetFh: sectors[s3].fh, special: ld.special, modelSi: s3};
                ringTag[s2]      = ld.tag;
            }
        }

        return {holeTargetFh: holeTargetFh, rings: rings, ringTag: ringTag};
    }

    /**
     * Donut rings join the rising floors, each with its "+change" (model
     * sector's flat, special zeroed, on arrival). A ring that would not rise is dropped.
     *
     * @returns {object} claimed ring si → floorChange record
     */
    _mergeDonutRings(donuts, doorSectorIds, liftIds, rising) {
        const {sectors} = this._level;
        const ringChanges = {};
        for (const key of Object.keys(donuts.rings)) {
            const si   = parseInt(key, 10);
            const ring = donuts.rings[key];
            if (doorSectorIds.has(si) || liftIds.has(si) || rising.risingFloorIds.has(si)) {
                continue;
            }
            if (ring.targetFh <= sectors[si].fh) {
                continue;
            }
            rising.risingFloorIds.add(si);
            rising.risingFloorSpecial[si]  = ring.special;
            rising.risingFloorTargetFh[si] = ring.targetFh;
            // Up-table entry read directly: floorChangeForSpecial would serve
            // the HOLE's half of the special (the down entry, no change).
            const rule = (WadConstants.FLOOR_UP_BY_SPECIAL[ring.special].change ?? null);
            if (rule !== null) {
                ringChanges[si] = {sourceSi: ring.modelSi, special: rule.special, at: rule.at};
            }
        }

        return ringChanges;
    }

    // --- Doors ---

    // A linedef with a door special controls the sector referenced by its tag
    // (remote door) or by its left sidedef sector (local door, tag == 0).
    _identifyDoors() {
        const {sidedefs, sectors} = this._level;
        const linedefs      = this._moverLinedefs();
        const doorSectorIds = new Set();
        const doorProps     = {};   // si → door props (shape in registerDoor)

        const registerDoor = (si, door, forceTrigger) => {
            // Activation lives on each linedef: a remote line must not take the
            // manual press away. Per-face keys are rebuilt by the world builder.
            const trigger = forceTrigger ?? door.trigger;
            if ((doorProps[si] !== undefined) && (doorProps[si].trigger === 'action') && (trigger !== 'action')) {
                return;
            }
            doorSectorIds.add(si);
            doorProps[si] = {
                speed:        door.speed,
                trigger:      trigger,
                loop:         door.loop,
                onlyOnce:     door.onlyOnce,
                anim:         door.anim,
                close:        (door.kind === 'close'),
                ceilingRaise: (door.kind === 'ceilingRaise'),
                // 141 grinds silently; ceilings 40/41/43/44/72 hum the floor
                // loop, not the door voice (sndseq CeilingNormal).
                silent:       (door.silent === true),
                ceilingSound: (door.ceiling === true),
                // Gap left above the floor when closed (crushers 44/72: 8).
                closeMargin:  (door.closeMargin ?? 0),
                // Timer doors (sector specials 10/14): countdown before the cycle.
                timerDelayS:  0,
                autoStart:    false,
                // Accumulated over the faces: one keyed face must not lock
                // monsters out of a free one.
                monsterUse:   ((doorProps[si]?.monsterUse === true) || WadMapAnalyzer._monsterUsableDoor(door, trigger)),
                // cycle key → {anim, speed, onlyOnce, loop, closeMargin}, kept
                // across re-registrations (timer-sector pass).
                variants:     (doorProps[si]?.variants ?? {}),
                // Cycle a press plays instead of the base one (manual opener of a closing door).
                pressVariant: (doorProps[si]?.pressVariant ?? null)
            };
        };

        // A sector the closing pass below will shut is a closing door, whatever else aims at it.
        const closeMarginByTag = new Map();
        for (const ld of linedefs) {
            if (WadConstants.DOOR_CLOSE_SPECIALS.has(ld.special) && (ld.tag !== 0)) {
                const margin = (WadConstants.DOOR_BY_SPECIAL[ld.special].closeMargin ?? 0);
                closeMarginByTag.set(ld.tag, Math.min(margin, (closeMarginByTag.get(ld.tag) ?? margin)));
            }
        }
        const closesFirst = (si) => (closeMarginByTag.has(sectors[si].tag)
            && (sectors[si].ch > (sectors[si].fh + closeMarginByTag.get(sectors[si].tag))));
        const manualReopeners = new Map();

        for (const ld of linedefs) {
            if (!WadConstants.DOOR_SPECIALS.has(ld.special)) {
                continue;
            }
            const door = WadConstants.DOOR_BY_SPECIAL[ld.special];
            if (ld.tag !== 0) {
                // A remote door must not self-activate; a tagged manual door
                // keeps its press trigger.
                const forced = ((door.trigger === 'action') ? null : 'none');
                for (let si = 0; si < sectors.length; si++) {
                    if ((sectors[si].tag === ld.tag) && !closesFirst(si)) {
                        registerDoor(si, door, forced);
                    }
                }
            } else if (ld.left >= 0) {
                const si = sidedefs[ld.left].sector;
                if (closesFirst(si)) {
                    manualReopeners.set(si, door);
                    continue;
                }
                registerDoor(si, door, null);
            }
        }

        // Closing doors: tagged sectors, statically OPEN (ch > fh), shut by a
        // panel parked above the ceiling that descends. A sector resting CLOSED
        // under a closing special keeps its opening panel — the close lines
        // play their own cycle on it.
        for (const ld of linedefs) {
            if (!WadConstants.DOOR_CLOSE_SPECIALS.has(ld.special) || (ld.tag === 0)) {
                continue;
            }
            // Skipped when the panel is already at its close target.
            const door   = WadConstants.DOOR_BY_SPECIAL[ld.special];
            const margin = (door.closeMargin ?? 0);
            for (let si = 0; si < sectors.length; si++) {
                if ((sectors[si].tag === ld.tag) && !doorSectorIds.has(si) && (sectors[si].ch > sectors[si].fh + margin)) {
                    const opener = (manualReopeners.get(si) ?? null);
                    registerDoor(si, door, ((opener !== null) ? 'action' : 'none'));
                    if (opener !== null) {
                        doorProps[si].pressVariant = WadConstants.doorCycleKey(opener.anim, opener.speed);
                        doorProps[si].monsterUse   = WadMapAnalyzer._monsterUsableDoor(opener, 'action');
                    }
                }
            }
        }

        // One cycle per door special aimed at a door: the firing line's special
        // picks which one runs (E1M4 tag 1 mixes 90 OWC and 86 open-stay).
        for (const ld of linedefs) {
            const door = WadConstants.DOOR_BY_SPECIAL[ld.special];
            if (door === undefined) {
                continue;
            }
            const targets = [];
            if (ld.tag !== 0) {
                for (let si = 0; si < sectors.length; si++) {
                    if (sectors[si].tag === ld.tag) {
                        targets.push(si);
                    }
                }
            } else if (ld.left >= 0) {
                targets.push(sidedefs[ld.left].sector);
            }
            for (const si of targets) {
                if (doorProps[si] === undefined) {
                    continue;
                }
                doorProps[si].variants[WadConstants.doorCycleKey(door.anim, door.speed)] = {
                    anim:        door.anim,
                    speed:       door.speed,
                    onlyOnce:    door.onlyOnce,
                    loop:        door.loop,
                    closeMargin: (door.closeMargin ?? 0)
                };
            }
        }

        // Timer doors (SECTOR specials 10/14): armed at level load by a
        // countdown, no linedef (P_SpawnSpecials). autoStart plays the cycle
        // at load, independently of the trigger.
        for (let si = 0; si < sectors.length; si++) {
            const special = sectors[si].special;
            if ((special === WadConstants.SECTOR_DOOR_CLOSE_SPECIAL) && (sectors[si].ch > sectors[si].fh)) {
                // Manual DR lines on the same sector (MAP27) replay this cycle;
                // approximation: the reopened door waits the full countdown, not 150 tics.
                registerDoor(si, WadConstants.DOOR_TIMER_DEFAULTS, null);
                doorProps[si].anim        = 'trap-close';
                doorProps[si].onlyOnce    = false;
                doorProps[si].autoStart   = true;
                doorProps[si].timerDelayS = WadConstants.SECTOR_DOOR_CLOSE_DELAY_TICS / 35;
            } else if ((special === WadConstants.SECTOR_DOOR_OPEN_SPECIAL) && !doorSectorIds.has(si)) {
                // Closed door running ONE open-wait-close cycle 5 min after load.
                registerDoor(si, WadConstants.DOOR_TIMER_DEFAULTS, 'none');
                doorProps[si].onlyOnce    = true;
                doorProps[si].autoStart   = true;
                doorProps[si].timerDelayS = WadConstants.SECTOR_DOOR_OPEN_DELAY_TICS / 35;
            }
        }

        return {doorSectorIds: doorSectorIds, doorProps: doorProps};
    }

    // Net effect of the vanilla P_UseSpecialLine whitelist for a monster: the
    // plain manual door (special 1) — repeatable action trigger, keyless,
    // D_SLOW, opening (the blaze 117 and the one-shot 31 are out).
    static _monsterUsableDoor(door, trigger) {
        return ((trigger === 'action') && (door.onlyOnce !== true)
            && ((door.key ?? null) === null) && (door.kind === 'open') && (door.speed === 2));
    }

    // floor_h = max(own fh, min adjacent fh), ceil_h = min adjacent non-sky ch -
    // DOOR_TRACK_OFFSET, computed after the lift floor patch. The max lifts
    // buried doors (fh=-128) to the walkable level; floor_h is written back into
    // sectors[si].fh so walls, flat, panel and track all share it.
    _computeDoorHeights(doorSectorIds, doorProps) {
        const {linedefs, sidedefs, sectors} = this._level;
        const doorHeights = {};

        for (const si of doorSectorIds) {
            // A closing door rests open: its travel is simply fh → ch.
            if (doorProps[si].close === true) {
                doorHeights[si] = {floorH: sectors[si].fh, ceilH: sectors[si].ch};
                continue;
            }
            const neighbours = [];
            for (const ld of linedefs) {
                if ((ld.right < 0) || (ld.left < 0)) {
                    continue;
                }
                if (sidedefs[ld.right].sector === si) {
                    const other = sidedefs[ld.left].sector;
                    if (!doorSectorIds.has(other)) {
                        neighbours.push(sectors[other]);
                    }
                } else if (sidedefs[ld.left].sector === si) {
                    const other = sidedefs[ld.right].sector;
                    if (!doorSectorIds.has(other)) {
                        neighbours.push(sectors[other]);
                    }
                }
            }
            if (neighbours.length === 0) {
                continue;
            }
            const floorH = Math.max(sectors[si].fh, Math.min(...neighbours.map((s) => s.fh)));
            // Ceiling raise (40): P_FindHighestCeilingSurrounding, sky included, no
            // track offset (p_ceilng.c raiseToHighest); its floor half is a lift.
            if (doorProps[si].ceilingRaise === true) {
                doorHeights[si] = {floorH: sectors[si].fh, ceilH: Math.max(...neighbours.map((s) => s.ch))};
                continue;
            }
            const nonSky = neighbours.filter((s) => !WadConstants.isSkyFlat(s.ct));
            const openH  = ((nonSky.length > 0)
                ? Math.min(...nonSky.map((s) => s.ch)) - WadConstants.DOOR_TRACK_OFFSET
                : floorH + WadConstants.DOOR_SKY_OPEN_HEIGHT);
            // Deliberate deviation: a sector resting open above that target keeps
            // its ceiling instead of vanilla's instant snap down to it.
            doorHeights[si] = {floorH: floorH, ceilH: Math.max(openH, sectors[si].ch)};
            sectors[si].fh = floorH;
        }

        return doorHeights;
    }

    // --- Lifts / moving floors ---

    _identifyLifts(doorSectorIds, donutHoleTargetFh = {}) {
        const {sidedefs, sectors} = this._level;
        const linedefs          = this._moverLinedefs();
        const liftIds           = new Set();
        const liftSectorSpecial = {};
        const liftSpecials      = {};   // base special last

        for (const ld of linedefs) {
            if (WadConstants.FLOOR_MOVE_DOWN_SPECIALS.has(ld.special) && (ld.tag !== 0)) {
                // Ceiling raisers (40) move a door's floor too: vanilla fires both
                // halves on the same tag.
                const allowDoorOverlap = WadConstants.DOOR_CEILING_RAISE_SPECIALS.has(ld.special);
                for (let si = 0; si < sectors.length; si++) {
                    if ((sectors[si].tag === ld.tag) && (allowDoorOverlap || !doorSectorIds.has(si))) {
                        liftIds.add(si);
                        liftSectorSpecial[si] = ld.special;
                        (liftSpecials[si] = (liftSpecials[si] ?? [])).push(ld.special);
                    }
                }
            }
        }

        // Captured before _patchLiftFloors mutates fh.
        const liftOriginalFh      = {};
        const liftLowestFh        = {};
        const liftMaxAdjFh        = {};
        const liftVanillaTargetFh = {};
        const computeTargets = () => {
            for (const si of liftIds) {
                const {adjFh, adjAllFh} = this._liftAdjacentFloors(si, liftIds);
                liftOriginalFh[si] = sectors[si].fh;
                const rule = WadConstants.FLOOR_DOWN_BY_SPECIAL[liftSectorSpecial[si]].target;
                // Donut hole: lowers to the sector beyond the ring (EV_DoDonut).
                const target = ((donutHoleTargetFh[si] !== undefined)
                    ? donutHoleTargetFh[si]
                    : WadMapAnalyzer._lowerTargetFh(rule, adjFh, sectors[si].fh));
                liftLowestFh[si] = Math.min(target, sectors[si].fh);
                // Vanilla destination (instant-raise detection only): every
                // neighbour counts, co-movers included. Lowest seeds at the own
                // floor, highest at -500 (p_spec.c); turbo adds 8 only when the
                // highest differs from the current floor (p_floor.c turboLower).
                if ((rule === 'highest') || (rule === 'highest+8')) {
                    const highest = ((adjAllFh.length === 0) ? WadConstants.HIGHEST_FLOOR_SEED : Math.max(...adjAllFh));
                    liftVanillaTargetFh[si] = highest + (((rule === 'highest+8') && (highest !== sectors[si].fh)) ? WadConstants.TURBO_LOWER_OFFSET : 0);
                } else {
                    liftVanillaTargetFh[si] = Math.min(sectors[si].fh, ...adjAllFh);
                }
                // High end of a perpetual plat: highest adjacent floor, clamped
                // so it never sits below the sector's own floor (p_plats.c).
                liftMaxAdjFh[si] = ((adjFh.length === 0)
                    ? sectors[si].fh
                    : Math.max(Math.max(...adjFh), sectors[si].fh));
            }
        };

        // Lifts with no lower non-lift neighbour cannot descend and are dropped,
        // one at a time: a dropped lift becomes a plain neighbour and may give
        // another candidate the lower floor it was missing.
        const instantRaise = {};
        while (true) {
            for (const k of Object.keys(liftOriginalFh)) {
                delete liftOriginalFh[k];
                delete liftLowestFh[k];
                delete liftMaxAdjFh[k];
                delete liftVanillaTargetFh[k];
            }
            computeTargets();
            // A one-way lower whose vanilla destination is ABOVE the floor is the
            // instant-rise trick (pop-up bridge): it becomes an instant rising floor.
            const instant = [...liftIds].find((si) => {
                return (WadConstants.FLOOR_DOWN_ONEWAY_SPECIALS.has(liftSectorSpecial[si])
                    && (donutHoleTargetFh[si] === undefined)
                    && (liftVanillaTargetFh[si] > liftOriginalFh[si]));
            });
            if (instant !== undefined) {
                instantRaise[instant] = {targetFh: liftVanillaTargetFh[instant], originFh: liftOriginalFh[instant], special: liftSectorSpecial[instant]};
                liftIds.delete(instant);
                delete liftSectorSpecial[instant];
                continue;
            }
            // A perpetual plat may rest at its low end: dead only when low == high.
            const dead = [...liftIds].find((si) => {
                if (WadConstants.FLOOR_PERPETUAL_SPECIALS.has(liftSectorSpecial[si])) {
                    return (liftMaxAdjFh[si] <= liftLowestFh[si]);
                }
                return (liftOriginalFh[si] <= liftLowestFh[si]);
            });
            if (dead === undefined) {
                break;
            }
            // Another special on the tag may still move it: retried as base first.
            liftSpecials[dead] = liftSpecials[dead].filter((special) => (special !== liftSectorSpecial[dead]));
            if (liftSpecials[dead].length > 0) {
                liftSectorSpecial[dead] = liftSpecials[dead][liftSpecials[dead].length - 1];
                continue;
            }
            liftIds.delete(dead);
            delete liftSectorSpecial[dead];
        }

        return {
            liftIds:            liftIds,
            liftSectorSpecial:  liftSectorSpecial,
            liftOriginalFh:     liftOriginalFh,
            // Destination of the base special; liftLowestFh is the lowest point
            // any special brings the floor to (static patch, riser skirt).
            liftBaseTargetFh:   {...liftLowestFh},
            liftLowestFh:       liftLowestFh,
            liftMaxAdjFh:       liftMaxAdjFh,
            instantRaise:       instantRaise
        };
    }

    // Neighbour floors of si: all of them (P_Find*FloorSurrounding) and the
    // non-lift ones alone (lift travel and patching).
    _liftAdjacentFloors(si, liftIds) {
        const {sidedefs, sectors} = this._level;
        const adjFh    = [];
        const adjAllFh = [];
        for (const ld of this._moverLinedefs()) {
            if ((ld.right < 0) || (ld.left < 0)) {
                continue;
            }
            const rSi = sidedefs[ld.right].sector;
            const lSi = sidedefs[ld.left].sector;
            const other = ((rSi === si) ? lSi : ((lSi === si) ? rSi : null));
            if ((other === null) || (other === si)) {
                continue;
            }
            adjAllFh.push(sectors[other].fh);
            if (!liftIds.has(other)) {
                adjFh.push(sectors[other].fh);
            }
        }

        return {adjFh: adjFh, adjAllFh: adjAllFh};
    }

    // Destination of a floor-lower rule: classic lifts lower to the LOWEST
    // adjacent floor; 102 lowers to the HIGHEST, 71 to the highest + 8.
    static _lowerTargetFh(rule, adjFh, ownFh) {
        if (adjFh.length === 0) {
            return ownFh;
        }
        if (rule === 'highest') {
            return Math.max(...adjFh);
        }
        if (rule === 'highest+8') {
            return Math.max(...adjFh) + WadConstants.TURBO_LOWER_OFFSET;
        }

        return Math.min(...adjFh);
    }

    // Every OTHER floor-lower special aimed at a lift becomes a named cycle
    // (vanilla runs each thinker on its own rules); a variant lowering further
    // than the base deepens the patched minimum, hence the run before the patch.
    // liftLowerVariants: si → key → {special, anim, speed, onlyOnce, targetFh}.
    _identifyLiftLowers(lifts) {
        const {sectors} = this._level;
        const liftLowerVariants = {};
        for (const ld of this._moverLinedefs()) {
            const key = WadConstants.floorLowerCycleKey(ld.special);
            if ((ld.tag === 0) || (key === null)) {
                continue;
            }
            const rule = WadConstants.FLOOR_DOWN_BY_SPECIAL[ld.special];
            for (const si of lifts.liftIds) {
                const baseSpecial = lifts.liftSectorSpecial[si];
                if ((sectors[si].tag !== ld.tag) || (ld.special === baseSpecial)
                    || WadConstants.FLOOR_PERPETUAL_SPECIALS.has(baseSpecial)) {
                    continue;
                }
                const origFh   = lifts.liftOriginalFh[si];
                const {adjFh}  = this._liftAdjacentFloors(si, lifts.liftIds);
                const targetFh = Math.min(WadMapAnalyzer._lowerTargetFh(rule.target, adjFh, origFh), origFh);
                if (targetFh >= origFh) {
                    continue;
                }
                (liftLowerVariants[si] = (liftLowerVariants[si] ?? {}))[key] = {
                    special:  ld.special,
                    anim:     rule.anim,
                    speed:    rule.speed,
                    onlyOnce: rule.onlyOnce,
                    targetFh: targetFh
                };
                lifts.liftLowestFh[si] = Math.min(lifts.liftLowestFh[si], targetFh);
            }
        }

        return liftLowerVariants;
    }

    // Patch fh to min(adjacent_fh) so the static map shows the lift in down position
    _patchLiftFloors(lifts) {
        for (const si of lifts.liftIds) {
            this._level.sectors[si].fh = lifts.liftLowestFh[si];
        }
    }

    // Raise specials aimed at a non-perpetual lift become named cycles on it
    // (vanilla raises from the live floor: MAP30's 140 + 62). The start pose is
    // where the lift rests when the raise fires: lowered for a one-way lower,
    // original height otherwise. Reads liftOriginalFh: sectors[si].fh is patched.
    // liftRaiseVariants: si → key → {special, speed, startFh, targetFh}.
    _identifyLiftRaises(lifts) {
        const {sectors} = this._level;
        const liftRaiseVariants = {};
        for (const ld of this._moverLinedefs()) {
            const key = WadConstants.floorRaiseCycleKey(ld.special);
            if ((ld.tag === 0) || (key === null)) {
                continue;
            }
            const rule = WadConstants.FLOOR_UP_BY_SPECIAL[ld.special];
            for (const si of lifts.liftIds) {
                if ((sectors[si].tag !== ld.tag)
                    || WadConstants.FLOOR_PERPETUAL_SPECIALS.has(lifts.liftSectorSpecial[si])) {
                    continue;
                }
                const liftAnim = WadConstants.FLOOR_DOWN_BY_SPECIAL[lifts.liftSectorSpecial[si]].anim;
                const numeric  = (typeof rule.target === 'number');
                const startFh  = ((liftAnim === 'one-way') ? lifts.liftBaseTargetFh[si] : lifts.liftOriginalFh[si]);
                const targetFh = ((numeric) ? (startFh + rule.target) : this._risingFloorTarget(si, ld.special, lifts.liftOriginalFh));
                if (targetFh <= startFh) {
                    continue;
                }
                (liftRaiseVariants[si] = (liftRaiseVariants[si] ?? {}))[key] = {
                    special:  ld.special,
                    speed:    rule.speed,
                    startFh:  startFh,
                    targetFh: targetFh
                };
            }
        }

        return liftRaiseVariants;
    }

    // Rising floors: unlike lifts, fh is not patched, the moving flat rises from
    // the WAD height. A target not above the floor means no movement in vanilla:
    // the sector is dropped.
    _identifyRisingFloors(doorSectorIds, liftIds, instantRaise = {}, liftOriginalFh = {}) {
        const {sectors} = this._level;
        const linedefs              = this._moverLinedefs();
        const risingFloorIds        = new Set();
        const risingFloorSpecial    = {};
        const risingFloorTargetFh   = {};
        const risingFloorInstantIds = new Set();
        const risingFloorPopUpRise  = {};

        for (const ld of linedefs) {
            if (WadConstants.FLOOR_MOVE_UP_SPECIALS.has(ld.special) && (ld.tag !== 0)) {
                for (let si = 0; si < sectors.length; si++) {
                    if ((sectors[si].tag === ld.tag)
                        && !doorSectorIds.has(si) && !liftIds.has(si)) {
                        const target = this._risingFloorTarget(si, ld.special, liftOriginalFh);
                        if (target > sectors[si].fh) {
                            risingFloorIds.add(si);
                            risingFloorSpecial[si]  = ld.special;
                            risingFloorTargetFh[si] = target;
                        }
                    }
                }
            }
        }

        for (const [key, raise] of Object.entries(instantRaise)) {
            const si = Number(key);
            risingFloorIds.add(si);
            risingFloorInstantIds.add(si);
            risingFloorSpecial[si]   = raise.special;
            risingFloorTargetFh[si]  = raise.targetFh;
            risingFloorPopUpRise[si] = raise.targetFh - raise.originFh;
        }

        const risingFloorStaging = {};
        for (const si of risingFloorIds) {
            const staging = ((risingFloorInstantIds.has(si)) ? null : this._risingFloorStaging(si, linedefs));
            if (staging === null) {
                continue;
            }
            risingFloorStaging[si]  = staging;
            risingFloorSpecial[si]  = staging.special;
            risingFloorTargetFh[si] = staging.origFh + staging.travel;
        }

        return {
            risingFloorIds:        risingFloorIds,
            risingFloorSpecial:    risingFloorSpecial,
            risingFloorTargetFh:   risingFloorTargetFh,
            risingFloorInstantIds: risingFloorInstantIds,
            risingFloorPopUpRise:  risingFloorPopUpRise,
            risingFloorStaging:    risingFloorStaging
        };
    }

    // code → {origFh, targetFhFor(liveFh)} for the staged targets: EV_DoFloor
    // computes the destination from the live sector. null when nothing is staged.
    static stageRulesFor(analysis, special, targets, liveFloorOf) {
        const raise = WadConstants.FLOOR_UP_BY_SPECIAL[special];
        if (raise === undefined) {
            return null;
        }
        const rules = {};
        for (const code of targets) {
            const staging = ((code.startsWith('risingfloor_'))
                ? (analysis.risingFloorStaging[WadMapAnalyzer._sectorOfCode(code, 'risingfloor_')] ?? null)
                : null);
            if (staging === null) {
                continue;
            }
            const target = staging.targets[special];
            if (target === undefined) {
                continue;
            }
            let targetFhFor;
            if (target.delta !== undefined) {
                targetFhFor = (liveFh) => (liveFh + target.delta);
            } else if (target.nextHigherOf !== undefined) {
                targetFhFor = (liveFh) => WadMapAnalyzer.nextHighestFloor(target.nextHigherOf.map(liveFloorOf), liveFh + WadConstants.FLOOR_HEIGHT_EPSILON);
            } else {
                targetFhFor = () => target.absolute;
            }
            rules[code] = {origFh: staging.origFh, targetFhFor: targetFhFor};
        }

        return ((Object.keys(rules).length > 0) ? rules : null);
    }

    // P_FindNextHighestFloor: lowest of the floors strictly above baseFh, null
    // when none (vanilla then keeps the current floor).
    static nextHighestFloor(floors, baseFh) {
        const higher = floors.filter((fh) => (fh > baseFh));

        return ((higher.length > 0) ? Math.min(...higher) : null);
    }

    // Floor movers that get an instance: si → {code, restFh}.
    _identifyFloorMovers(lifts, rising, stairs) {
        const {sectors} = this._level;
        const movers = new Map();
        for (const si of rising.risingFloorIds) {
            movers.set(si, {code: 'risingfloor_' + si, restFh: sectors[si].fh});
        }
        for (const si of lifts.liftIds) {
            const isPerpetual = WadConstants.FLOOR_PERPETUAL_SPECIALS.has(lifts.liftSectorSpecial[si]);
            const maxFh = ((isPerpetual) ? lifts.liftMaxAdjFh[si] : lifts.liftOriginalFh[si]);
            if (maxFh > lifts.liftLowestFh[si]) {
                movers.set(si, {code: 'lift_' + si, restFh: lifts.liftOriginalFh[si]});
            }
        }
        for (const si of stairs.stairIds) {
            if (stairs.stairInfo[si].targetFh > sectors[si].fh) {
                movers.set(si, {code: 'stair_' + si, restFh: sectors[si].fh});
            }
        }

        return movers;
    }

    // Vanilla re-targets a fixed-delta raise from the live floor at each trigger,
    // so the timeline spans the whole travel: up to the ceiling (UZDoom clamp)
    // when a line repeats or is not fixed-delta, else the sum of the deltas.
    // Targets: {delta} | {nextHigherOf: ids} | {absolute}. null = not staged.
    _risingFloorStaging(si, linedefs) {
        const {sectors} = this._level;
        const sec             = sectors[si];
        const neighbourIds    = this._neighbourSectorIds(si);
        const targets         = {};
        let firstDeltaSpecial = null;
        let onceTravel        = 0;
        let openEnded         = false;
        for (const ld of linedefs) {
            const rule = WadConstants.FLOOR_UP_BY_SPECIAL[ld.special];
            if ((ld.tag !== sec.tag) || (ld.tag === 0) || (rule === undefined) || (rule.donutRingOnly === true)) {
                continue;
            }
            if (typeof rule.target === 'number') {
                firstDeltaSpecial = (firstDeltaSpecial ?? ld.special);
                targets[ld.special] = {delta: rule.target};
                if (WadConstants.specialRepeats(ld.special)) {
                    openEnded = true;
                } else {
                    onceTravel += rule.target;
                }
                continue;
            }
            openEnded = true;
            if (rule.target === 'shortestLower') {
                targets[ld.special] = {delta: this._shortestLowerTextureAround(si) ?? 0};
            } else if (rule.target === 'nextHigher') {
                targets[ld.special] = {nextHigherOf: neighbourIds};
            } else {
                targets[ld.special] = {absolute: this._risingFloorTarget(si, ld.special, {}, neighbourIds)};
            }
        }
        if (firstDeltaSpecial === null) {
            return null;
        }
        const maxTravel = sec.ch - sec.fh;

        return {
            travel:  ((openEnded) ? maxTravel : Math.min(onceTravel, maxTravel)),
            origFh:  sec.fh,
            special: firstDeltaSpecial,
            targets: targets
        };
    }

    // Indices of the sectors sharing a two-sided linedef with si (one per line).
    _neighbourSectorIds(si) {
        const {linedefs, sidedefs} = this._level;
        const neighbours = [];
        for (const ld of linedefs) {
            if ((ld.right < 0) || (ld.left < 0)) {
                continue;
            }
            const rSi = sidedefs[ld.right].sector;
            const lSi = sidedefs[ld.left].sector;
            if (rSi === si) {
                neighbours.push(lSi);
            } else if (lSi === si) {
                neighbours.push(rSi);
            }
        }

        return neighbours;
    }

    // Target floor height of a rising sector (vanilla p_floor.c / p_plats.c),
    // neighbour lifts read at their rest height.
    _risingFloorTarget(si, special, liftOriginalFh = {}, neighbourIds = null) {
        const {linedefs, sidedefs, sectors} = this._level;
        const sec  = sectors[si];
        const rule = WadConstants.FLOOR_UP_BY_SPECIAL[special].target;

        if (typeof rule === 'number') {
            return sec.fh + rule;
        }

        if (rule === 'shortestLower') {
            return (sec.fh + (this._shortestLowerTextureAround(si) ?? 0));
        }

        const ids        = (neighbourIds ?? this._neighbourSectorIds(si));
        const neighbours = ids.map((n) => sectors[n]);

        if (rule === 'nextHigher') {
            const floors = ids.map((n) => (liftOriginalFh[n] ?? sectors[n].fh));
            return (WadMapAnalyzer.nextHighestFloor(floors, sec.fh) ?? sec.fh);
        }

        // 'lowestCeiling' / 'lowestCeilingCrush' — P_FindLowestCeilingSurrounding
        // clamped to the sector's own ceiling, minus 8 for the crush variant.
        let target = ((neighbours.length > 0)
            ? Math.min(...neighbours.map((s) => s.ch))
            : sec.ch);
        target = Math.min(target, sec.ch);
        if (rule === 'lowestCeilingCrush') {
            target -= WadConstants.RAISE_FLOOR_CRUSH_GAP;
        }
        return target;
    }

    // P_FindShortestTextureAround: the smallest LOWER texture posted on either
    // side of the sector's two-sided lines, null when none (no movement).
    _shortestLowerTextureAround(si) {
        const {linedefs, sidedefs} = this._level;
        let shortest = null;
        for (const ld of linedefs) {
            if ((ld.right < 0) || (ld.left < 0)) {
                continue;
            }
            if ((sidedefs[ld.right].sector !== si) && (sidedefs[ld.left].sector !== si)) {
                continue;
            }
            for (const sd of [sidedefs[ld.right], sidedefs[ld.left]]) {
                const h = this._textureHeightOf(sd.lower);
                if ((h !== null) && ((shortest === null) || (h < shortest))) {
                    shortest = h;
                }
            }
        }

        return shortest;
    }

    // --- Floor texture/type changes (the "+change" specials) ---

    /**
     * Source sector of each "+change" target: the trigger line's front sector,
     * or for 37/84 the first neighbour at the destination height. One change
     * per sector, the last line wins; seeded with the donut ring changes.
     *
     * @returns {object} si → {sourceSi, special, at}
     */
    _identifyFloorChanges(lifts, rising, ringChanges) {
        const {linedefs, sidedefs, sectors} = this._level;
        const floorChange = {...ringChanges};

        for (const ld of linedefs) {
            // Donut changes come from the model sector (_mergeDonutRings), not the front one.
            if (WadConstants.isDonutSpecial(ld.special)) {
                continue;
            }
            const rule = WadConstants.floorChangeForSpecial(ld.special);
            if ((rule === null) || (ld.tag === 0) || (ld.right < 0)) {
                continue;
            }
            const frontSi = sidedefs[ld.right].sector;
            for (let si = 0; si < sectors.length; si++) {
                if (sectors[si].tag !== ld.tag) {
                    continue;
                }
                const moving = (rising.risingFloorIds.has(si) || lifts.liftIds.has(si));
                if (!moving) {
                    continue;
                }
                // A sector, not a flat: read live at fire time (chained changes).
                let sourceSi = frontSi;
                if (rule.source === 'dest') {
                    sourceSi = this._sectorAtHeight(si, lifts.liftBaseTargetFh[si]);
                    if (sourceSi < 0) {
                        continue;
                    }
                }
                floorChange[si] = {sourceSi: sourceSi, special: rule.special, at: rule.at};
            }
        }

        return floorChange;
    }

    /**
     * New sector special posted by a "+change" rule: 'copy' takes the source
     * sector's, 'zero' clears it, 'keep' leaves it untouched (null).
     *
     * @param {string} mode 'copy' | 'zero' | 'keep'
     * @param {int}    sourceSpecial
     * @returns {int|null}
     */
    static changeSpecial(mode, sourceSpecial) {
        return ((mode === 'copy') ? sourceSpecial : ((mode === 'zero') ? 0 : null));
    }

    // First two-sided neighbour of si whose floor sits at the given height
    // (vanilla lowerAndChange line walk), -1 when none.
    _sectorAtHeight(si, fh) {
        const {sectors} = this._level;
        for (const other of this._neighbourSectorIds(si)) {
            if (sectors[other].fh === fh) {
                return other;
            }
        }

        return -1;
    }

    // --- Stairs (build stairs) ---

    /**
     * EV_BuildStairs: from each tagged base sector, chain through the two-sided
     * lines whose front side is the current step and whose far sector has the
     * base flat, one step higher each time. fh is not patched.
     *
     * @returns {{stairIds: Set<number>, stairInfo: object, stairStepTag: object}}
     */
    _identifyStairs(doorSectorIds, liftIds, risingFloorIds) {
        const {linedefs, sidedefs, sectors} = this._level;
        const stairIds     = new Set();
        const stairInfo    = {};   // si → {targetFh, special}
        const stairStepTag = {};   // si → trigger tag (the base sector's tag)

        const claimed = (si) => (doorSectorIds.has(si) || liftIds.has(si)
            || risingFloorIds.has(si) || stairIds.has(si));

        const registerStep = (si, targetFh, special, tag) => {
            stairIds.add(si);
            stairInfo[si]    = {targetFh: targetFh, special: special};
            stairStepTag[si] = tag;
        };

        const nextStep = (current, texture) => {
            for (const ld of linedefs) {
                if ((ld.right < 0) || (ld.left < 0)) {
                    continue;
                }
                if (sidedefs[ld.right].sector !== current) {
                    continue;
                }
                const candidate = sidedefs[ld.left].sector;
                if (!claimed(candidate) && (sectors[candidate].ft === texture)) {
                    return candidate;
                }
            }

            return -1;
        };

        for (const ld of linedefs) {
            if (!WadConstants.STAIR_SPECIALS.has(ld.special) || (ld.tag === 0)) {
                continue;
            }
            const step = WadConstants.STAIR_BY_SPECIAL[ld.special].step;
            for (let base = 0; base < sectors.length; base++) {
                if ((sectors[base].tag !== ld.tag) || claimed(base)) {
                    continue;
                }
                const texture = sectors[base].ft;
                let height    = sectors[base].fh;
                let current   = base;
                while (current !== -1) {
                    height += step;
                    registerStep(current, height, ld.special, ld.tag);
                    current = nextStep(current, texture);
                }
            }
        }

        return {stairIds: stairIds, stairInfo: stairInfo, stairStepTag: stairStepTag};
    }

    // --- Switches ---

    /**
     * Switch linedefs (S-type specials), in two shapes:
     *  - panel {side, slot, texName}: the face carrying the SWxxx graphic, which
     *    the switch builder rebuilds as a swapping quad;
     *  - {invisible: true}: a two-sided line with no SWxxx graphic (an SR lift
     *    edge textured PLAT1), which becomes an invisible USE zone.
     *
     * @returns {{ids: Set<number>, walls: Map<number, object>}}
     */
    _identifySwitches(liftOriginalFh = {}) {
        const {linedefs, sidedefs} = this._level;
        const ids = new Set();
        const walls = new Map();

        for (let ldIdx = 0; ldIdx < linedefs.length; ldIdx++) {
            const ld = linedefs[ldIdx];
            if (!WadConstants.SWITCH_SPECIALS.has(ld.special)) {
                continue;
            }
            if (ld.right < 0) {
                continue;
            }
            const rSd = sidedefs[ld.right];

            if (ld.left < 0) {
                if (WadTextureBank.isBlank(rSd.middle)) {
                    continue;
                }
                ids.add(ldIdx);
                walls.set(ldIdx, {side: 'right', slot: 'middle', texName: rSd.middle});
                continue;
            }

            ids.add(ldIdx);
            walls.set(ldIdx, this._findSwitchSlot(rSd, sidedefs[ld.left], liftOriginalFh) ?? {invisible: true});
        }

        return {ids: ids, walls: walls};
    }

    // Prefer a slot the line draws from that side (a lower needs the far floor
    // higher, an upper the far ceiling lower); a bandless slot stays the last
    // resort for a switch on a mover's face, revealed when it moves.
    _findSwitchSlot(rSd, lSd, liftOriginalFh) {
        const {sectors} = this._level;
        const rSec = sectors[rSd.sector];
        const lSec = sectors[lSd.sector];
        const rFh  = liftOriginalFh[rSd.sector] ?? rSec.fh;
        const lFh  = liftOriginalFh[lSd.sector] ?? lSec.fh;
        const candidates = [
            {side: 'right', slot: 'lower',  texName: rSd.lower,  drawn: (lFh > rFh)},
            {side: 'right', slot: 'upper',  texName: rSd.upper,  drawn: (lSec.ch < rSec.ch)},
            {side: 'right', slot: 'middle', texName: rSd.middle, drawn: true},
            {side: 'left',  slot: 'lower',  texName: lSd.lower,  drawn: (rFh > lFh)},
            {side: 'left',  slot: 'upper',  texName: lSd.upper,  drawn: (rSec.ch < lSec.ch)},
            {side: 'left',  slot: 'middle', texName: lSd.middle, drawn: true}
        ];
        const isSwitch = (c) => (c.texName && (/^SW[12]/).test(c.texName));
        const found = (candidates.find((c) => (c.drawn && isSwitch(c))) ?? candidates.find(isSwitch) ?? null);

        return ((found !== null) ? {side: found.side, slot: found.slot, texName: found.texName} : null);
    }

    // Codes of the built instances of a tag. families: [{ids, prefix, built,
    // tagOf?}]; tagOf overrides the sector tag (stairs, donut rings).
    static resolveTaggedTargets(sectors, tag, families) {
        const targets = [];
        if (tag === 0) {
            return targets;
        }
        for (const fam of families) {
            for (const si of fam.ids) {
                const code = fam.prefix + si;
                const sectorTag = ((fam.tagOf !== undefined) ? fam.tagOf(si) : sectors[si].tag);
                if ((sectorTag === tag) && fam.built.has(code)) {
                    targets.push(code);
                }
            }
        }

        return targets;
    }

    // Only _mergeDonutRings stamps a donut special into risingFloorSpecial.
    static isDonutRing(analysis, si) {
        return WadConstants.isDonutSpecial(analysis.risingFloorSpecial[si]);
    }

    // An untagged donut ring resolves by its stored trigger tag, and only for
    // the donut special: vanilla moves it from EV_DoDonut alone.
    static risingFloorFamily(analysis, sectors, built, special) {
        const ringsWanted = WadConstants.isDonutSpecial(special);
        return {ids: analysis.risingFloorIds, prefix: 'risingfloor_', built: built,
            tagOf: (si) => ((WadMapAnalyzer.isDonutRing(analysis, si))
                ? ((ringsWanted) ? analysis.donutRingTag[si] : null)
                : sectors[si].tag)};
    }

    // Every mover family for resolveTaggedTargets; built = {lifts, rising,
    // doors, stairs} code sets. Stair steps resolve by the base step's tag.
    static moverFamilies(analysis, sectors, built, special) {
        return [
            {ids: analysis.liftIds, prefix: 'lift_',        built: built.lifts},
            WadMapAnalyzer.risingFloorFamily(analysis, sectors, built.rising, special),
            {ids: analysis.doorSectorIds,      prefix: 'door_',        built: built.doors},
            {ids: analysis.stairIds, prefix: 'stair_', built: built.stairs,
                tagOf: (si) => analysis.stairStepTag[si]}
        ];
    }

    // Sector id baked into a target instance code ('risingfloor_175' → 175).
    static _sectorOfCode(code, prefix) {
        return parseInt(code.slice(prefix.length), 10);
    }

    // Splits target codes into {start, reverse} (played backward):
    // - 45 (SWITCH_REVERSE_SPECIALS) reverses all its targets;
    // - a raise on a lift, without a named cycle, walks it back up (E1M5 plats);
    // - a lower on a rising floor walks it back down (E1M8 shaft), except a
    //   ring hit by its own donut special and a pop-up floor hit by its own
    //   pop-up lower, which must start rising.
    // Doors never reverse: they own one forward cycle per special.
    // timeScale replays at the reversing special's vanilla speed.
    static splitReverseTargets(analysis, special, targets) {
        const reversed = (code) => ({
            code:      code,
            timeScale: WadMapAnalyzer._specialSpeed(special) / WadMapAnalyzer._targetSpeed(analysis, code)
        });

        if (WadConstants.SWITCH_REVERSE_SPECIALS.has(special)) {
            return {start: [], reverse: targets.map(reversed)};
        }
        const isRaise  = WadConstants.FLOOR_MOVE_UP_SPECIALS.has(special);
        const isLower  = WadConstants.FLOOR_MOVE_DOWN_SPECIALS.has(special);
        const raiseKey = WadConstants.floorRaiseCycleKey(special);
        const start    = [];
        const reverse  = [];
        for (const code of targets) {
            if (isRaise && code.startsWith('lift_')) {
                const liftSi = WadMapAnalyzer._sectorOfCode(code, 'lift_');
                if ((raiseKey !== null) && (analysis.liftRaiseVariants[liftSi]?.[raiseKey] !== undefined)) {
                    start.push(code);
                    continue;
                }
                reverse.push(reversed(code));
                continue;
            }
            if (isLower && code.startsWith('lift_')
                && WadMapAnalyzer._isIdleLiftLower(analysis, special, WadMapAnalyzer._sectorOfCode(code, 'lift_'))) {
                continue;
            }
            if (isLower && code.startsWith('risingfloor_')) {
                const risingSi        = WadMapAnalyzer._sectorOfCode(code, 'risingfloor_');
                const ringOfThisDonut = (WadConstants.isDonutSpecial(special) && WadMapAnalyzer.isDonutRing(analysis, risingSi));
                if (!ringOfThisDonut && !WadMapAnalyzer._popsUpFloor(analysis, special, risingSi)) {
                    reverse.push(reversed(code));
                    continue;
                }
            }
            start.push(code);
        }

        return {start: start, reverse: reverse};
    }

    static _popsUpFloor(analysis, special, risingSi) {
        if (!analysis.risingFloorInstantIds.has(risingSi)) {
            return false;
        }
        const popUpRule = WadConstants.FLOOR_DOWN_BY_SPECIAL[analysis.risingFloorSpecial[risingSi]];

        return ((popUpRule !== undefined) && (WadConstants.FLOOR_DOWN_BY_SPECIAL[special]?.target === popUpRule.target));
    }

    // No named cycle for a lower that would not move the lift: started, it would
    // fall back on the default cycle, where vanilla moves nothing.
    static _isIdleLiftLower(analysis, special, liftSi) {
        const baseSpecial = analysis.liftSectorSpecial[liftSi];
        const key         = WadConstants.floorLowerCycleKey(special);
        if ((special === baseSpecial) || (key === null) || WadConstants.FLOOR_PERPETUAL_SPECIALS.has(baseSpecial)) {
            return false;
        }

        return (analysis.liftLowerVariants[liftSi]?.[key] === undefined);
    }

    // Forward speed (u/tic) of the special firing a reverse — raise floors,
    // plats, doors; FLOORSPEED = 1 for everything else (e.g. 45 lowerFloor).
    static _specialSpeed(special) {
        return WadConstants.FLOOR_UP_BY_SPECIAL[special]?.speed
            ?? WadConstants.FLOOR_DOWN_BY_SPECIAL[special]?.speed
            ?? WadConstants.DOOR_BY_SPECIAL[special]?.speed
            ?? 1;
    }

    // Forward speed (u/tic) baked into a target's keyframes.
    static _targetSpeed(analysis, code) {
        if (code.startsWith('lift_')) {
            const si = WadMapAnalyzer._sectorOfCode(code, 'lift_');
            return WadConstants.FLOOR_DOWN_BY_SPECIAL[analysis.liftSectorSpecial[si]]?.speed ?? 1;
        }
        if (code.startsWith('risingfloor_')) {
            const si = WadMapAnalyzer._sectorOfCode(code, 'risingfloor_');
            // A pop-up floor covers its whole travel in one tic.
            return (analysis.risingFloorPopUpRise[si]
                ?? WadConstants.FLOOR_UP_BY_SPECIAL[analysis.risingFloorSpecial[si]]?.speed
                ?? 1);
        }
        if (code.startsWith('door_')) {
            const si = WadMapAnalyzer._sectorOfCode(code, 'door_');
            return ((analysis.doorProps[si] !== undefined) ? analysis.doorProps[si].speed : 2);
        }

        return 1;
    }
}
