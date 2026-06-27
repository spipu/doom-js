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
        const doors = this._identifyDoors();
        const lifts = this._identifyLifts(doors.doorSectorIds);
        this._patchLiftFloors(lifts);
        const rising = this._identifyRisingFloors(doors.doorSectorIds, lifts.movingFloorDownIds);
        const stairs = this._identifyStairs(doors.doorSectorIds, lifts.movingFloorDownIds, rising.risingFloorIds);
        const doorHeights = this._computeDoorHeights(doors.doorSectorIds);
        const switches = this._identifySwitches();
        const teleporterLinedefs = this._identifyTeleporters();
        const walkTriggerLinedefs = this._identifyWalkTriggers();

        return {
            doorSectorIds:        doors.doorSectorIds,
            doorProps:            doors.doorProps,
            doorHeights:          doorHeights,
            movingFloorDownIds:   lifts.movingFloorDownIds,
            liftSectorSpecial:    lifts.liftSectorSpecial,
            liftOriginalFh:       lifts.liftOriginalFh,
            liftMinAdjFh:         lifts.liftMinAdjFh,
            risingFloorIds:       rising.risingFloorIds,
            risingFloorSpecial:   rising.risingFloorSpecial,
            stairIds:             stairs.stairIds,
            stairInfo:            stairs.stairInfo,
            stairStepTag:         stairs.stairStepTag,
            switchLinedefIds:     switches.ids,
            switchWalls:          switches.walls,
            teleporterLinedefs:   teleporterLinedefs,
            walkTriggerLinedefs:  walkTriggerLinedefs
        };
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
            // 90/109, marked 'proximity' in DOOR_TRIGGER_BY_SPECIAL): a remote
            // door tagged T opens when its trigger line is crossed, not by
            // approaching the door — e.g. grabbing a key on a pedestal ringed by
            // such lines opens the doors tagged T elsewhere.
            const isWalkLift  = WadConstants.WALK_TRIGGER_SPECIALS.has(ld.special);
            const isWalkDoor  = (WadConstants.DOOR_TRIGGER_BY_SPECIAL[ld.special] === 'proximity');
            const isWalkStair = WadConstants.STAIR_WALK_SPECIALS.has(ld.special);
            if ((isWalkLift || isWalkDoor || isWalkStair) && ld.tag !== 0) {
                walkTriggers.push({ldIdx: ldIdx, tag: ld.tag, special: ld.special});
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

    // --- Doors ---

    // A linedef with a door special controls the sector referenced by its tag
    // (remote door) or by its left sidedef sector (local door, tag == 0).
    _identifyDoors() {
        const {linedefs, sidedefs, sectors} = this._level;
        const doorSectorIds = new Set();
        const doorProps     = {};   // si → {speed, trigger, loop, onlyOnce, anim, keyRequired}

        const registerDoor = (si, sp, forceTrigger) => {
            doorSectorIds.add(si);
            doorProps[si] = {
                speed:       WadConstants.DOOR_SPEED_BY_SPECIAL[sp] ?? 2,
                trigger:     forceTrigger ?? (WadConstants.DOOR_TRIGGER_BY_SPECIAL[sp] ?? 'action'),
                loop:        WadConstants.DOOR_LOOP_BY_SPECIAL[sp] ?? false,
                onlyOnce:    WadConstants.DOOR_ONLY_ONCE_BY_SPECIAL[sp] ?? false,
                anim:        WadConstants.DOOR_ANIM_BY_SPECIAL[sp] ?? 'round-trip',
                keyRequired: WadConstants.DOOR_KEY_BY_SPECIAL[sp] ?? null
            };
        };

        for (const ld of linedefs) {
            if (!WadConstants.DOOR_SPECIALS.has(ld.special)) {
                continue;
            }
            if (ld.tag !== 0) {
                // A tagged door driven REMOTELY (walk 'proximity' or switch 'none')
                // must not self-activate → force 'none', the external trigger
                // (switch / walk-zone) drives it. A manual 'action' door carrying a
                // tag (unusual) keeps its natural press trigger so it stays usable.
                const natural = WadConstants.DOOR_TRIGGER_BY_SPECIAL[ld.special] ?? 'action';
                const forced = ((natural === 'action') ? null : 'none');
                for (let si = 0; si < sectors.length; si++) {
                    if (sectors[si].tag === ld.tag) {
                        registerDoor(si, ld.special, forced);
                    }
                }
            } else if (ld.left >= 0) {
                registerDoor(sidedefs[ld.left].sector, ld.special, null);
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
    _computeDoorHeights(doorSectorIds) {
        const {linedefs, sidedefs, sectors} = this._level;
        const doorHeights = {};

        for (const si of doorSectorIds) {
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

    _identifyLifts(doorSectorIds) {
        const {linedefs, sidedefs, sectors} = this._level;
        const movingFloorDownIds = new Set();
        const liftSectorSpecial  = {};

        for (const ld of linedefs) {
            if (WadConstants.FLOOR_MOVE_DOWN_SPECIALS.has(ld.special) && ld.tag !== 0) {
                for (let si = 0; si < sectors.length; si++) {
                    if (sectors[si].tag === ld.tag && !doorSectorIds.has(si)) {
                        movingFloorDownIds.add(si);
                        liftSectorSpecial[si] = ld.special;
                    }
                }
            }
        }

        // Save original fh and min adjacent fh before patching.
        const liftOriginalFh = {};
        const liftMinAdjFh   = {};
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
                const rule = WadConstants.LIFT_TARGET_BY_SPECIAL[liftSectorSpecial[si]] ?? 'lowest';
                let target;
                if (adjFh.length === 0) {
                    target = sectors[si].fh;
                } else if (rule === 'highest') {
                    target = Math.max(...adjFh);
                } else if (rule === 'highest+8') {
                    target = Math.max(...adjFh) + 8;
                } else {
                    target = Math.min(...adjFh);
                }
                liftMinAdjFh[si] = Math.min(target, sectors[si].fh);
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
            }
            computeTargets();
            const dead = [...movingFloorDownIds].find((si) => (liftOriginalFh[si] <= liftMinAdjFh[si]));
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
            liftMinAdjFh:       liftMinAdjFh
        };
    }

    // Patch fh to min(adjacent_fh) so the static map shows the lift in down position
    _patchLiftFloors(lifts) {
        for (const si of lifts.movingFloorDownIds) {
            this._level.sectors[si].fh = lifts.liftMinAdjFh[si];
        }
    }

    // Rising floors (special 58 etc.): the floor moves UP a fixed delta when
    // walked over. Unlike lifts, fh is NOT patched — the static floor stays at
    // its WAD height and the moving top-flat (built by WadRisingFloorBuilder)
    // sits there and rises. Exclude sectors already claimed as doors or lifts.
    _identifyRisingFloors(doorSectorIds, movingFloorDownIds) {
        const {linedefs, sectors} = this._level;
        const risingFloorIds     = new Set();
        const risingFloorSpecial = {};

        for (const ld of linedefs) {
            if (WadConstants.FLOOR_MOVE_UP_SPECIALS.has(ld.special) && ld.tag !== 0) {
                for (let si = 0; si < sectors.length; si++) {
                    if (sectors[si].tag === ld.tag
                        && !doorSectorIds.has(si) && !movingFloorDownIds.has(si)) {
                        risingFloorIds.add(si);
                        risingFloorSpecial[si] = ld.special;
                    }
                }
            }
        }

        return {risingFloorIds: risingFloorIds, risingFloorSpecial: risingFloorSpecial};
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
            const step = WadConstants.STAIR_STEP_BY_SPECIAL[ld.special] ?? 8;
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
}
