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
            if (WadConstants.WALK_TRIGGER_SPECIALS.has(ld.special) && ld.tag !== 0) {
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

        const registerDoor = (si, sp) => {
            doorSectorIds.add(si);
            doorProps[si] = {
                speed:       WadConstants.DOOR_SPEED_BY_SPECIAL[sp] ?? 2,
                trigger:     WadConstants.DOOR_TRIGGER_BY_SPECIAL[sp] ?? 'action',
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
                for (let si = 0; si < sectors.length; si++) {
                    if (sectors[si].tag === ld.tag) {
                        registerDoor(si, ld.special);
                    }
                }
            } else if (ld.left >= 0) {
                registerDoor(sidedefs[ld.left].sector, ld.special);
            }
        }

        return {doorSectorIds: doorSectorIds, doorProps: doorProps};
    }

    // floor_h = min adjacent fh, ceil_h = min adjacent non-sky ch - DOOR_TRACK_OFFSET.
    // Computed AFTER the lift floor patch (same order as the Python script).
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
            const floorH = Math.min(...adj.map((s) => s.fh));
            const nonSky = adj.filter((s) => !s.ct.startsWith('F_SKY'));
            const ceilH  = ((nonSky.length > 0)
                ? Math.min(...nonSky.map((s) => s.ch)) - WadConstants.DOOR_TRACK_OFFSET
                : floorH + 128);
            doorHeights[si] = {floorH: floorH, ceilH: ceilH};
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

        // Save original fh and min adjacent fh before patching
        const liftOriginalFh = {};
        const liftMinAdjFh   = {};
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
            // so a remote floor-lower never raises the floor (guards the
            // origFh <= target → no lift case in the builder).
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

    // --- Switches ---

    // One-sided linedefs with a S-type special — the wall face IS the switch
    // A switch linedef carries a SWxxx graphic in one wall slot (right/left ×
    // upper/middle/lower). One-sided switches use the right middle (the historic
    // case). Two-sided ones put the graphic on a step riser (lower) or header
    // (upper) — so the detection scans every slot for an SW1/SW2 texture and
    // records WHICH slot, so the static builder can drop that exact face and the
    // switch builder can rebuild it at the right vertical band.
    //
    // @returns {{ids: Set<number>, walls: Map<number, {side, slot, texName}>}}
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

            // Two-sided: only a switch if a slot actually carries an SW graphic.
            const found = this._findSwitchSlot(rSd, sidedefs[ld.left]);
            if (found !== null) {
                ids.add(ldIdx);
                walls.set(ldIdx, found);
            }
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
}
