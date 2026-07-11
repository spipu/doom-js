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
     */
    constructor(level) {
        this._level = level;
    }

    analyze() {
        const donuts = this._identifyDonuts();
        const doors = this._identifyDoors();
        const lifts = this._identifyLifts(doors.doorSectorIds, donuts.holeTargetFh);
        this._patchLiftFloors(lifts);
        const rising = this._identifyRisingFloors(doors.doorSectorIds, lifts.movingFloorDownIds);
        this._mergeDonutRings(donuts, doors.doorSectorIds, lifts.movingFloorDownIds, rising);
        const stairs = this._identifyStairs(doors.doorSectorIds, lifts.movingFloorDownIds, rising.risingFloorIds);
        const doorHeights = this._computeDoorHeights(doors.doorSectorIds, doors.doorProps);
        const floorChange = this._identifyFloorChanges(lifts, rising);
        const switches = this._identifySwitches();
        const teleporterLinedefs = this._identifyTeleporters();
        const walkTriggerLinedefs = this._identifyWalkTriggers();
        const lightSectors = this._identifyLightSectors();

        return {
            doorSectorIds:        doors.doorSectorIds,
            doorProps:            doors.doorProps,
            doorHeights:          doorHeights,
            movingFloorDownIds:   lifts.movingFloorDownIds,
            liftSectorSpecial:    lifts.liftSectorSpecial,
            liftOriginalFh:       lifts.liftOriginalFh,
            liftMinAdjFh:         lifts.liftMinAdjFh,
            liftMaxAdjFh:         lifts.liftMaxAdjFh,
            risingFloorIds:       rising.risingFloorIds,
            risingFloorSpecial:   rising.risingFloorSpecial,
            risingFloorTargetFh:  rising.risingFloorTargetFh,
            stairIds:             stairs.stairIds,
            stairInfo:            stairs.stairInfo,
            stairStepTag:         stairs.stairStepTag,
            donutRingTag:         donuts.ringTag,
            floorChange:          floorChange,
            switchLinedefIds:     switches.ids,
            switchWalls:          switches.walls,
            teleporterLinedefs:   teleporterLinedefs,
            walkTriggerLinedefs:  walkTriggerLinedefs,
            lightSectors:         lightSectors
        };
    }

    // Sector light effects (p_spec.c P_SpawnSpecials → p_lights.c): flicker (1),
    // strobes (2/3/4 async, 12/13 sync), glow (8), fire flicker (17). maxLight =
    // the sector's own level; minLight = P_FindMinSurroundingLight (darkest
    // neighbour across two-sided lines, capped at the sector's own level) —
    // strobes fall back to 0 when no neighbour is darker, fire flicker adds +16.
    _identifyLightSectors() {
        const {linedefs, sidedefs, sectors} = this._level;

        const minNeighbour = {};
        for (const ld of linedefs) {
            if (ld.right < 0 || ld.left < 0) {
                continue;
            }
            const rSi = sidedefs[ld.right].sector;
            const lSi = sidedefs[ld.left].sector;
            if (rSi === lSi) {
                continue;
            }
            minNeighbour[rSi] = Math.min(minNeighbour[rSi] ?? 255, sectors[lSi].light);
            minNeighbour[lSi] = Math.min(minNeighbour[lSi] ?? 255, sectors[rSi].light);
        }

        const lightSectors = [];
        for (let si = 0; si < sectors.length; si++) {
            const effect = WadConstants.LIGHT_EFFECT_BY_SPECIAL[sectors[si].special];
            if (effect === undefined) {
                continue;
            }
            const maxLight = sectors[si].light;
            let minLight = Math.min(maxLight, minNeighbour[si] ?? maxLight);
            if (effect.type === 'strobe' && minLight === maxLight) {
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

    // Walk-over linedefs (W1/WR) that activate a remote tagged element by being
    // crossed. Each becomes an invisible proximity zone that start()s the tagged
    // lift/floor/door instances (resolved in WadWalkTriggerBuilder), like a
    // switch but proximity-activated.
    _identifyWalkTriggers() {
        const {linedefs} = this._level;
        const walkTriggers = [];
        for (let ldIdx = 0; ldIdx < linedefs.length; ldIdx++) {
            const ld = linedefs[ldIdx];
            // Walk lifts/floors, plus tagged WALK-triggered doors (specials 2/86/
            // 90/109, trigger 'proximity' in DOOR_BY_SPECIAL): a remote
            // door tagged T opens when its trigger line is crossed, not by
            // approaching the door — e.g. grabbing a key on a pedestal ringed by
            // such lines opens the doors tagged T elsewhere.
            const isWalkLift  = WadConstants.WALK_TRIGGER_SPECIALS.has(ld.special);
            const isWalkDoor  = (WadConstants.DOOR_BY_SPECIAL[ld.special]?.trigger === 'proximity');
            const isWalkStair = WadConstants.STAIR_WALK_SPECIALS.has(ld.special);
            if ((isWalkLift || isWalkDoor || isWalkStair) && ld.tag !== 0) {
                walkTriggers.push({ldIdx: ldIdx, tag: ld.tag, special: ld.special});
            }
            // Walk-over exits (52 normal / 124 secret): the level ends when the
            // line is crossed. No tag requirement — an exit ignores its tag
            // (vanilla Doom, same rule as the exit switches).
            if (WadConstants.WALK_EXIT_SPECIALS.has(ld.special)) {
                walkTriggers.push({ldIdx: ldIdx, tag: ld.tag, special: ld.special, isExit: true});
            }
        }
        return walkTriggers;
    }

    // Walk-over teleport linedefs (39 W1 / 97 WR). The destination is the thing
    // type 14 in the sector of the same tag (resolved later in WadWorldBuilder,
    // which has the thing list + sector lookup).
    _identifyTeleporters() {
        const {linedefs} = this._level;
        const teleporters = [];
        for (let ldIdx = 0; ldIdx < linedefs.length; ldIdx++) {
            const ld = linedefs[ldIdx];
            if (WadConstants.TELEPORT_SPECIALS.has(ld.special) && ld.tag !== 0) {
                teleporters.push({ldIdx: ldIdx, tag: ld.tag, special: ld.special});
            }
        }
        return teleporters;
    }

    // --- Donuts (special 9, S1 — vanilla EV_DoDonut) ---

    // The tagged sector s1 (the "hole"/pillar) LOWERS to the floor of s3 while
    // the untagged ring s2 around it RISES to the same height, both at
    // FLOORSPEED/2 (the ring's floor texture change is cosmetic, not applied).
    // s2 = the sector across s1's first linedef; s3 = the sector across s2's
    // first two-sided linedef whose far side is not s1. The hole rides the
    // floor-down family with a forced target (holeTargetFh); the ring joins
    // the rising floors (ringTag lets the switch resolve it — a ring carries
    // no tag of its own).
    //
    // @returns {{holeTargetFh: object, rings: object, ringTag: object}}
    _identifyDonuts() {
        const {linedefs, sidedefs, sectors} = this._level;
        const holeTargetFh = {};
        const rings        = {};   // ring si → target fh
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
            if (ld.special !== 9 || ld.tag === 0) {
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
                    if (far !== -1 && far !== s1) {
                        s3 = far;
                        break;
                    }
                }
                if (s3 < 0) {
                    continue;
                }
                holeTargetFh[s1] = sectors[s3].fh;
                rings[s2]        = sectors[s3].fh;
                ringTag[s2]      = ld.tag;
            }
        }

        return {holeTargetFh: holeTargetFh, rings: rings, ringTag: ringTag};
    }

    // Ring half of the donuts: joins the rising floors (fh not patched, moving
    // top-flat + skirt built by WadRisingFloorBuilder). A ring whose target
    // does not rise above its own floor is dropped (no movement in vanilla).
    _mergeDonutRings(donuts, doorSectorIds, movingFloorDownIds, rising) {
        const {sectors} = this._level;
        for (const key of Object.keys(donuts.rings)) {
            const si = parseInt(key, 10);
            const targetFh = donuts.rings[key];
            if (doorSectorIds.has(si) || movingFloorDownIds.has(si) || rising.risingFloorIds.has(si)) {
                continue;
            }
            if (targetFh <= sectors[si].fh) {
                continue;
            }
            rising.risingFloorIds.add(si);
            rising.risingFloorSpecial[si]  = 9;
            rising.risingFloorTargetFh[si] = targetFh;
        }
    }

    // --- Doors ---

    // A linedef with a door special controls the sector referenced by its tag
    // (remote door) or by its left sidedef sector (local door, tag == 0).
    _identifyDoors() {
        const {linedefs, sidedefs, sectors} = this._level;
        const doorSectorIds = new Set();
        const doorProps     = {};   // si → {speed, trigger, loop, onlyOnce, anim, keyRequired}

        const registerDoor = (si, door, forceTrigger) => {
            doorSectorIds.add(si);
            doorProps[si] = {
                speed:        door.speed,
                trigger:      forceTrigger ?? door.trigger,
                loop:         door.loop,
                onlyOnce:     door.onlyOnce,
                anim:         door.anim,
                keyRequired:  door.key,
                close:        (door.kind === 'close'),
                ceilingRaise: (door.kind === 'ceilingRaise'),
                // Doom units left above the floor at the end of a close
                // (crush ceilings 44/72 stop at floor + 8).
                closeMargin:  (door.closeMargin ?? 0),
                // Level-load countdown (s) held before the cycle starts
                // (timer doors, sector specials 10/14).
                timerDelayS:  0,
                autoStart:    false,
                // Per-trigger anims aimed at this door (filled after the
                // registration loops): anim name → {speed, onlyOnce}.
                variants:     {}
            };
        };

        for (const ld of linedefs) {
            if (!WadConstants.DOOR_SPECIALS.has(ld.special)) {
                continue;
            }
            const door = WadConstants.DOOR_BY_SPECIAL[ld.special];
            if (ld.tag !== 0) {
                // A tagged door driven REMOTELY (walk 'proximity' or switch 'none')
                // must not self-activate → force 'none', the external trigger
                // (switch / walk-zone) drives it. A manual 'action' door carrying a
                // tag (unusual) keeps its natural press trigger so it stays usable.
                const forced = ((door.trigger === 'action') ? null : 'none');
                for (let si = 0; si < sectors.length; si++) {
                    if (sectors[si].tag === ld.tag) {
                        registerDoor(si, door, forced);
                    }
                }
            } else if (ld.left >= 0) {
                registerDoor(sidedefs[ld.left].sector, door, null);
            }
        }

        // Closing doors: tagged sectors, statically OPEN (ch > fh), shut by a
        // panel parked above the ceiling that descends. A sector already
        // registered as an (opening) door keeps its opening panel — the close
        // lines will walk it back down (startReverse) instead.
        for (const ld of linedefs) {
            if (!WadConstants.DOOR_CLOSE_SPECIALS.has(ld.special) || ld.tag === 0) {
                continue;
            }
            // No registration when the panel has no travel (already at its close
            // target — e.g. a crush ceiling resting at floor + 8 or below).
            const door   = WadConstants.DOOR_BY_SPECIAL[ld.special];
            const margin = (door.closeMargin ?? 0);
            for (let si = 0; si < sectors.length; si++) {
                if (sectors[si].tag === ld.tag && !doorSectorIds.has(si) && sectors[si].ch > sectors[si].fh + margin) {
                    registerDoor(si, door, 'none');
                }
            }
        }

        // Per-trigger behaviour: collect EVERY open-door anim aimed at each
        // door, so the builder emits one keyframe variant per anim and the
        // crossed line's special decides the cycle at start() time (vanilla —
        // E1M4 tag 1 mixes 12× 90 OWC and 4× 86 open-stay on the same four
        // doors). Close doors / crushers keep their single structural cycle.
        for (const ld of linedefs) {
            if (!WadConstants.DOOR_SPECIALS.has(ld.special)) {
                continue;
            }
            const door = WadConstants.DOOR_BY_SPECIAL[ld.special];
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
                if (doorProps[si] === undefined || doorProps[si].close === true) {
                    continue;
                }
                // Keyed by anim AND speed: two specials sharing the anim but
                // not the speed (e.g. 4 at 2 and 105 at 8) must stay distinct.
                doorProps[si].variants[door.anim + '@' + door.speed] = {
                    anim:     door.anim,
                    speed:    door.speed,
                    onlyOnce: door.onlyOnce
                };
            }
        }

        // Timer doors (SECTOR specials 10/14): armed at level load by a
        // countdown, no linedef (P_SpawnSpecials). autoStart plays the cycle
        // at load, independently of the trigger.
        for (let si = 0; si < sectors.length; si++) {
            const sp = sectors[si].special;
            if (sp === WadConstants.SECTOR_DOOR_CLOSE_SPECIAL && sectors[si].ch > sectors[si].fh) {
                // The sector may ALSO carry manual DR lines (MAP27): the trap
                // keyframes own the panel (closed rest → open → hold up to the
                // countdown → close) and a USE replays the same cycle to
                // reopen — no softlock. Approximation: the reopened door holds
                // the full countdown again instead of the 150-tic DR wait
                // (one keyframe set per door).
                registerDoor(si, WadConstants.DOOR_TIMER_DEFAULTS, null);
                doorProps[si].anim        = 'trap-close';
                doorProps[si].onlyOnce    = false;
                doorProps[si].autoStart   = true;
                doorProps[si].timerDelayS = WadConstants.SECTOR_DOOR_CLOSE_DELAY_TICS / 35;
            } else if (sp === WadConstants.SECTOR_DOOR_OPEN_SPECIAL && !doorSectorIds.has(si)) {
                // Closed door running ONE open-wait-close cycle 5 min after load.
                registerDoor(si, WadConstants.DOOR_TIMER_DEFAULTS, 'none');
                doorProps[si].onlyOnce    = true;
                doorProps[si].autoStart   = true;
                doorProps[si].timerDelayS = WadConstants.SECTOR_DOOR_OPEN_DELAY_TICS / 35;
            }
        }

        return {doorSectorIds: doorSectorIds, doorProps: doorProps};
    }

    // floor_h = max(own fh, min adjacent fh), ceil_h = min adjacent non-sky ch -
    // DOOR_TRACK_OFFSET. Computed AFTER the lift floor patch (same order as the
    // Python script). A door's floor never moves (only the ceiling rises), so it
    // sits at the door's own fh — kept whenever it is at or above the lowest
    // walkable neighbour (door on a step up: the step belongs on the door line,
    // not min'd away). Clamped UP to the lowest neighbour for "squished closed"
    // underground doors (fh=-128) whose own floor is below the walkable level.
    // The result is patched into sectors[si].fh so the walls (riser steps), the
    // static flat, the panel and the DOORTRAK all read one consistent floor.
    _computeDoorHeights(doorSectorIds, doorProps) {
        const {linedefs, sidedefs, sectors} = this._level;
        const doorHeights = {};

        for (const si of doorSectorIds) {
            // Closing door: the sector is statically OPEN at its own heights —
            // the panel travel is simply fh → ch, nothing to patch or clamp.
            if (doorProps[si].close === true) {
                doorHeights[si] = {floorH: sectors[si].fh, ceilH: sectors[si].ch};
                continue;
            }
            const adj = [];
            for (const ld of linedefs) {
                if (ld.right < 0 || ld.left < 0) {
                    continue;
                }
                if (sidedefs[ld.right].sector === si) {
                    const other = sidedefs[ld.left].sector;
                    if (!doorSectorIds.has(other)) {
                        adj.push(sectors[other]);
                    }
                } else if (sidedefs[ld.left].sector === si) {
                    const other = sidedefs[ld.right].sector;
                    if (!doorSectorIds.has(other)) {
                        adj.push(sectors[other]);
                    }
                }
            }
            if (adj.length === 0) {
                continue;
            }
            const floorH = Math.max(sectors[si].fh, Math.min(...adj.map((s) => s.fh)));
            // Ceiling-raise variant (40): target = P_FindHighestCeilingSurrounding
            // (every neighbour, sky included, no door track offset — p_ceilng.c
            // raiseToHighest). The floor is never re-patched up: its own half is
            // handled by the floor-down family (lowerFloorToLowest companion).
            if (doorProps[si].ceilingRaise === true) {
                doorHeights[si] = {floorH: sectors[si].fh, ceilH: Math.max(...adj.map((s) => s.ch))};
                continue;
            }
            const nonSky = adj.filter((s) => !s.ct.startsWith('F_SKY'));
            const ceilH  = ((nonSky.length > 0)
                ? Math.min(...nonSky.map((s) => s.ch)) - WadConstants.DOOR_TRACK_OFFSET
                : floorH + 128);
            doorHeights[si] = {floorH: floorH, ceilH: ceilH};
            sectors[si].fh = floorH;
        }

        return doorHeights;
    }

    // --- Lifts / moving floors ---

    _identifyLifts(doorSectorIds, donutHoleTargetFh = {}) {
        const {linedefs, sidedefs, sectors} = this._level;
        const movingFloorDownIds = new Set();
        const liftSectorSpecial  = {};

        for (const ld of linedefs) {
            if (WadConstants.FLOOR_MOVE_DOWN_SPECIALS.has(ld.special) && ld.tag !== 0) {
                // A door-claimed sector normally has no moving floor; the ceiling
                // raisers (40) are the exception — vanilla fires their ceiling AND
                // floor on the same tag, so the overlap is legitimate there.
                const allowDoorOverlap = WadConstants.DOOR_CEILING_RAISE_SPECIALS.has(ld.special);
                for (let si = 0; si < sectors.length; si++) {
                    if (sectors[si].tag === ld.tag && (allowDoorOverlap || !doorSectorIds.has(si))) {
                        movingFloorDownIds.add(si);
                        liftSectorSpecial[si] = ld.special;
                    }
                }
            }
        }

        // Save original fh and min adjacent fh before patching.
        const liftOriginalFh = {};
        const liftMinAdjFh   = {};
        const liftMaxAdjFh   = {};
        const computeTargets = () => {
            for (const si of movingFloorDownIds) {
                const adjFh = [];
                for (const ld of linedefs) {
                    if (ld.right < 0 || ld.left < 0) {
                        continue;
                    }
                    const rSi = sidedefs[ld.right].sector;
                    const lSi = sidedefs[ld.left].sector;
                    if (rSi === si && !movingFloorDownIds.has(lSi)) {
                        adjFh.push(sectors[lSi].fh);
                    } else if (lSi === si && !movingFloorDownIds.has(rSi)) {
                        adjFh.push(sectors[rSi].fh);
                    }
                }
                liftOriginalFh[si] = sectors[si].fh;
                // Target floor height: classic lifts lower to the LOWEST adjacent
                // floor; 102 lowers to the HIGHEST, 71 to the highest + 8. Clamped
                // so a remote floor-lower never raises the floor.
                const rule = WadConstants.FLOOR_DOWN_BY_SPECIAL[liftSectorSpecial[si]].target;
                let target;
                if (donutHoleTargetFh[si] !== undefined) {
                    // Donut hole: the target is the floor of the sector beyond
                    // the ring (EV_DoDonut), not an adjacent-floor rule.
                    target = donutHoleTargetFh[si];
                } else if (adjFh.length === 0) {
                    target = sectors[si].fh;
                } else if (rule === 'highest') {
                    target = Math.max(...adjFh);
                } else if (rule === 'highest+8') {
                    target = Math.max(...adjFh) + 8;
                } else {
                    target = Math.min(...adjFh);
                }
                liftMinAdjFh[si] = Math.min(target, sectors[si].fh);
                // High end of a perpetual plat: highest adjacent floor, clamped
                // so it never sits below the sector's own floor (p_plats.c).
                liftMaxAdjFh[si] = ((adjFh.length === 0)
                    ? sectors[si].fh
                    : Math.max(Math.max(...adjFh), sectors[si].fh));
            }
        };

        // A lift only exists where the floor can actually descend (some adjacent
        // non-lift floor is lower). A sector that shares a lift tag but has no
        // lower neighbour — e.g. a large platform tagged alongside the real lift —
        // is NOT a lift: the builder skips it (origFh <= target → null), but its
        // static floor was already dropped, leaving a hole. Drop such dead lifts
        // here so their floor is rendered. Remove them ONE AT A TIME: a dead lift
        // turns into a normal neighbour once dropped, which can lower a survivor's
        // target and revive it (its only lower neighbour may itself be a dead lift
        // still masking it). Dropping a whole batch at once would demote such a
        // survivor by mistake, so recompute after every single removal.
        while (true) {
            for (const k of Object.keys(liftOriginalFh)) {
                delete liftOriginalFh[k];
                delete liftMinAdjFh[k];
                delete liftMaxAdjFh[k];
            }
            computeTargets();
            // A perpetual plat is dead only when its full amplitude is nil
            // (low == high): it may legitimately start AT its low end and only
            // travel upward, unlike a one-way/round-trip lower.
            const dead = [...movingFloorDownIds].find((si) => {
                if (WadConstants.FLOOR_PERPETUAL_SPECIALS.has(liftSectorSpecial[si])) {
                    return (liftMaxAdjFh[si] <= liftMinAdjFh[si]);
                }
                return (liftOriginalFh[si] <= liftMinAdjFh[si]);
            });
            if (dead === undefined) {
                break;
            }
            movingFloorDownIds.delete(dead);
            delete liftSectorSpecial[dead];
        }

        return {
            movingFloorDownIds: movingFloorDownIds,
            liftSectorSpecial:  liftSectorSpecial,
            liftOriginalFh:     liftOriginalFh,
            liftMinAdjFh:       liftMinAdjFh,
            liftMaxAdjFh:       liftMaxAdjFh
        };
    }

    // Patch fh to min(adjacent_fh) so the static map shows the lift in down position
    _patchLiftFloors(lifts) {
        for (const si of lifts.movingFloorDownIds) {
            this._level.sectors[si].fh = lifts.liftMinAdjFh[si];
        }
    }

    // Rising floors: the floor moves UP once toward a target when its trigger
    // fires (walk-zone or switch). Unlike lifts, fh is NOT patched — the static
    // floor stays at its WAD height and the moving top-flat (built by
    // WadRisingFloorBuilder) sits there and rises. Exclude sectors already
    // claimed as doors or lifts. The target height follows the vanilla rules
    // (FLOOR_UP_BY_SPECIAL targets): fixed delta, lowest surrounding ceiling
    // (clamped to the own ceiling, -8 for crush) or next-higher neighbour
    // floor. A sector whose target does not rise above its floor is dropped
    // (no movement in vanilla): its static floor is kept, no dead instance.
    _identifyRisingFloors(doorSectorIds, movingFloorDownIds) {
        const {linedefs, sectors} = this._level;
        const risingFloorIds      = new Set();
        const risingFloorSpecial  = {};
        const risingFloorTargetFh = {};

        for (const ld of linedefs) {
            if (WadConstants.FLOOR_MOVE_UP_SPECIALS.has(ld.special) && ld.tag !== 0) {
                for (let si = 0; si < sectors.length; si++) {
                    if (sectors[si].tag === ld.tag
                        && !doorSectorIds.has(si) && !movingFloorDownIds.has(si)) {
                        const target = this._risingFloorTarget(si, ld.special);
                        if (target > sectors[si].fh) {
                            risingFloorIds.add(si);
                            risingFloorSpecial[si]  = ld.special;
                            risingFloorTargetFh[si] = target;
                        }
                    }
                }
            }
        }

        return {
            risingFloorIds:      risingFloorIds,
            risingFloorSpecial:  risingFloorSpecial,
            risingFloorTargetFh: risingFloorTargetFh
        };
    }

    // Target floor height of a rising sector (vanilla p_floor.c / p_plats.c).
    // Neighbours are the sectors sharing a two-sided linedef with si.
    _risingFloorTarget(si, special) {
        const {linedefs, sidedefs, sectors} = this._level;
        const sec  = sectors[si];
        const rule = WadConstants.FLOOR_UP_BY_SPECIAL[special].target;

        // Fixed delta above the current floor (raiseFloor24/32...)
        if (typeof rule === 'number') {
            return sec.fh + rule;
        }

        const neighbours = [];
        for (const ld of linedefs) {
            if (ld.right < 0 || ld.left < 0) {
                continue;
            }
            const rSi = sidedefs[ld.right].sector;
            const lSi = sidedefs[ld.left].sector;
            if (rSi === si) {
                neighbours.push(sectors[lSi]);
            } else if (lSi === si) {
                neighbours.push(sectors[rSi]);
            }
        }

        if (rule === 'nextHigher') {
            // P_FindNextHighestFloor: smallest neighbour floor strictly above
            // the current one; none = current floor (no movement).
            const higher = neighbours.map((s) => s.fh).filter((fh) => fh > sec.fh);
            return ((higher.length > 0) ? Math.min(...higher) : sec.fh);
        }

        // 'lowestCeiling' / 'lowestCeilingCrush' — P_FindLowestCeilingSurrounding
        // clamped to the sector's own ceiling, minus 8 for the crush variant.
        let target = ((neighbours.length > 0)
            ? Math.min(...neighbours.map((s) => s.ch))
            : sec.ch);
        target = Math.min(target, sec.ch);
        if (rule === 'lowestCeilingCrush') {
            target -= 8;
        }
        return target;
    }

    // --- Floor texture/type changes (the "+change" specials) ---

    // Resolve, at build time, what each "+change" target sector will become:
    // the new flat name and (unless 'keep') the new sector special — taken from
    // the trigger line's front sector, or, for the lowerAndChange 37/84, from
    // the first neighbour sitting at the destination height (vanilla walks the
    // sector lines in order). One change per sector: with several change lines
    // on the same tag, the last one wins (same per-element limitation as the
    // doors). Fired at 'start' or at 'complete' of the moving instance.
    //
    // @returns {object} si → {flatName, special (number|null), at}
    _identifyFloorChanges(lifts, rising) {
        const {linedefs, sidedefs, sectors} = this._level;
        const floorChange = {};

        for (const ld of linedefs) {
            const rule = WadConstants.floorChangeForSpecial(ld.special);
            if (rule === null || ld.tag === 0 || ld.right < 0) {
                continue;
            }
            const front = sectors[sidedefs[ld.right].sector];
            for (let si = 0; si < sectors.length; si++) {
                if (sectors[si].tag !== ld.tag) {
                    continue;
                }
                const moving = (rising.risingFloorIds.has(si) || lifts.movingFloorDownIds.has(si));
                if (!moving) {
                    continue;
                }
                let source = front;
                if (rule.source === 'dest') {
                    source = this._sectorAtHeight(si, lifts.liftMinAdjFh[si]);
                    if (source === null) {
                        continue;
                    }
                }
                floorChange[si] = {
                    flatName: source.ft,
                    special:  ((rule.special === 'copy') ? source.special : ((rule.special === 'zero') ? 0 : null)),
                    at:       rule.at
                };
            }
        }

        return floorChange;
    }

    // First two-sided neighbour of si whose floor sits at the given height
    // (vanilla lowerAndChange line walk).
    _sectorAtHeight(si, fh) {
        const {linedefs, sidedefs, sectors} = this._level;
        for (const ld of linedefs) {
            if (ld.right < 0 || ld.left < 0) {
                continue;
            }
            const rSi = sidedefs[ld.right].sector;
            const lSi = sidedefs[ld.left].sector;
            const other = ((rSi === si) ? lSi : ((lSi === si) ? rSi : -1));
            if (other !== -1 && sectors[other].fh === fh) {
                return sectors[other];
            }
        }

        return null;
    }

    // --- Stairs (build stairs) ---

    // EV_BuildStairs: a stair special raises a CHAIN of sectors. From each tagged
    // base sector, raise it by one step, then walk to the adjacent sector that
    // shares a two-sided line whose FRONT (right) side is the current step AND
    // whose floor flat matches the base flat; that sector becomes the next step
    // at the running cumulated height. Like rising floors, fh is NOT patched —
    // each step's moving top-flat (WadStairBuilder) sits at its WAD height and
    // rises to its target. Sectors already claimed (doors/lifts/rising) are out.
    //
    // @returns {{stairIds: Set<number>, stairInfo: object, stairStepTag: object}}
    _identifyStairs(doorSectorIds, movingFloorDownIds, risingFloorIds) {
        const {linedefs, sidedefs, sectors} = this._level;
        const stairIds     = new Set();
        const stairInfo    = {};   // si → {targetFh, special}
        const stairStepTag = {};   // si → trigger tag (the base sector's tag)

        const claimed = (si) => (doorSectorIds.has(si) || movingFloorDownIds.has(si)
            || risingFloorIds.has(si) || stairIds.has(si));

        const registerStep = (si, targetFh, special, tag) => {
            stairIds.add(si);
            stairInfo[si]    = {targetFh: targetFh, special: special};
            stairStepTag[si] = tag;
        };

        // Next step: first two-sided line whose right-side sector is `current`
        // and whose left-side sector is an unclaimed same-flat sector.
        const nextStep = (current, texture) => {
            for (const ld of linedefs) {
                if (ld.right < 0 || ld.left < 0) {
                    continue;
                }
                if (sidedefs[ld.right].sector !== current) {
                    continue;
                }
                const cand = sidedefs[ld.left].sector;
                if (!claimed(cand) && sectors[cand].ft === texture) {
                    return cand;
                }
            }

            return -1;
        };

        for (const ld of linedefs) {
            if (!WadConstants.STAIR_SPECIALS.has(ld.special) || ld.tag === 0) {
                continue;
            }
            const step = WadConstants.STAIR_BY_SPECIAL[ld.special].step;
            for (let base = 0; base < sectors.length; base++) {
                if (sectors[base].tag !== ld.tag || claimed(base)) {
                    continue;
                }
                const texture = sectors[base].ft;
                let height  = sectors[base].fh;
                let current = base;
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

    // A switch linedef (S-type special) is a USE-activation point. Two shapes:
    //  - **panel** ({side, slot, texName}): the wall carries a SWxxx graphic
    //    (one-sided middle — historic case — or, on a two-sided line, a step
    //    riser `lower` / header `upper`, either side). The static builder drops
    //    that exact face and the switch builder rebuilds an interactive quad that
    //    swaps SW1↔SW2 at the right vertical band.
    //  - **invisible** ({invisible:true}): a two-sided activation line with NO
    //    SWxxx graphic (e.g. an SR lift edge, special 62 textured PLAT1) — there
    //    is no panel to draw/swap, and its wall (the lift riser) is already built
    //    elsewhere. It becomes an invisible USE zone that start()s the tagged
    //    targets, the press analog of a walk-trigger zone — so pressing the edge
    //    actually fires the lift even when no walk line backs it up.
    //
    // @returns {{ids: Set<number>, walls: Map<number, object>}}
    _identifySwitches() {
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
                // One-sided: switch graphic on the right middle (unchanged).
                if (!rSd.middle || rSd.middle === '-') {
                    continue;
                }
                ids.add(ldIdx);
                walls.set(ldIdx, {side: 'right', slot: 'middle', texName: rSd.middle});
                continue;
            }

            // Two-sided: a SWxxx slot → visible panel; otherwise → invisible USE
            // zone (the line still activates its target, e.g. an SR lift edge).
            ids.add(ldIdx);
            walls.set(ldIdx, this._findSwitchSlot(rSd, sidedefs[ld.left]) ?? {invisible: true});
        }

        return {ids: ids, walls: walls};
    }

    _findSwitchSlot(rSd, lSd) {
        const candidates = [
            {side: 'right', slot: 'lower',  texName: rSd.lower},
            {side: 'right', slot: 'upper',  texName: rSd.upper},
            {side: 'right', slot: 'middle', texName: rSd.middle},
            {side: 'left',  slot: 'lower',  texName: lSd.lower},
            {side: 'left',  slot: 'upper',  texName: lSd.upper},
            {side: 'left',  slot: 'middle', texName: lSd.middle}
        ];
        for (const c of candidates) {
            if (c.texName && (/^SW[12]/).test(c.texName)) {
                return c;
            }
        }

        return null;
    }

    // Codes of the built target instances of a given tag, shared by every
    // "trigger → targets" builder (switch, walk-zone). `families` is a list of
    // {ids: Set<sectorId>, prefix, built: Set<code>}; the switch passes lifts +
    // doors, the walk-trigger zone passes lifts + rising floors + doors.
    static resolveTaggedTargets(sectors, tag, families) {
        const targets = [];
        if (tag === 0) {
            return targets;
        }
        for (const fam of families) {
            for (const si of fam.ids) {
                const code = fam.prefix + si;
                // Default: match the sector's own tag. A family may override with
                // tagOf(si) — e.g. stairs, where only the base step carries the
                // trigger tag and the chained steps must resolve by it too.
                const t = ((fam.tagOf !== undefined) ? fam.tagOf(si) : sectors[si].tag);
                if (t === tag && fam.built.has(code)) {
                    targets.push(code);
                }
            }
        }

        return targets;
    }

    // Splits resolved target codes into {start, reverse} — reverse = played
    // backward via startReverse(). Shared by the switch and walk builders:
    // - special 45 (SWITCH_REVERSE_SPECIALS) walks ALL its rising-floor
    //   targets back down;
    // - a RAISE special (FLOOR_MOVE_UP) whose tag lands on a LIFT walks the
    //   lowered platform back up (E1M5/E1M7 bidirectional plats: 70/98 lower
    //   it, the 91 ring raises it back) instead of re-lowering it;
    // - a close-door line (DOOR_CLOSE_SPECIALS) closes an OPENING door caught
    //   by the tag in reverse (vanilla: the ceiling simply descends), while the
    //   dedicated close-door panels (doorProps.close) start forward — their
    //   keyframes natively descend from the parked-open rest.
    // Each reverse entry carries a timeScale so the backward playback runs at
    // the VANILLA speed of the reversing special, not at the speed baked into
    // the target's keyframes (a turbo-lowered plat rises back at FLOORSPEED).
    static splitReverseTargets(analysis, special, targets) {
        const rev = (code) => ({
            code:      code,
            timeScale: WadMapAnalyzer._specialSpeed(special) / WadMapAnalyzer._targetSpeed(analysis, code)
        });

        if (WadConstants.SWITCH_REVERSE_SPECIALS.has(special)) {
            return {start: [], reverse: targets.map(rev)};
        }
        const isRaise = WadConstants.FLOOR_MOVE_UP_SPECIALS.has(special);
        const isClose = WadConstants.DOOR_CLOSE_SPECIALS.has(special);
        const start = [];
        const reverse = [];
        for (const code of targets) {
            if (isRaise && code.startsWith('lift_')) {
                reverse.push(rev(code));
                continue;
            }
            const si = ((isClose && code.startsWith('door_')) ? parseInt(code.slice(5), 10) : null);
            const isOpeningDoor = (
                (si !== null) &&
                (analysis.doorProps[si] !== undefined) &&
                (analysis.doorProps[si].close !== true)
            );
            if (isOpeningDoor) {
                reverse.push(rev(code));
            } else {
                start.push(code);
            }
        }

        return {start: start, reverse: reverse};
    }

    // Forward speed (u/tic) of the special firing a reverse — raise floors,
    // plats, doors; FLOORSPEED = 1 for everything else (e.g. 45 lowerFloor).
    static _specialSpeed(special) {
        return WadConstants.FLOOR_UP_BY_SPECIAL[special]?.speed
            ?? WadConstants.FLOOR_DOWN_BY_SPECIAL[special]?.speed
            ?? WadConstants.DOOR_BY_SPECIAL[special]?.speed
            ?? 1;
    }

    // Forward speed (u/tic) baked into a target instance's own keyframes
    // (from the special it was built with).
    static _targetSpeed(analysis, code) {
        if (code.startsWith('lift_')) {
            const si = parseInt(code.slice(5), 10);
            return WadConstants.FLOOR_DOWN_BY_SPECIAL[analysis.liftSectorSpecial[si]]?.speed ?? 1;
        }
        if (code.startsWith('risingfloor_')) {
            const si = parseInt(code.slice(12), 10);
            return WadConstants.FLOOR_UP_BY_SPECIAL[analysis.risingFloorSpecial[si]]?.speed ?? 1;
        }
        if (code.startsWith('door_')) {
            const si = parseInt(code.slice(5), 10);
            return ((analysis.doorProps[si] !== undefined) ? analysis.doorProps[si].speed : 2);
        }

        return 1;
    }
}
