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
        const doorHeights = this._computeDoorHeights(doors.doorSectorIds);
        const switchLinedefIds = this._identifySwitches();

        return {
            doorSectorIds:        doors.doorSectorIds,
            doorProps:            doors.doorProps,
            doorHeights:          doorHeights,
            movingFloorDownIds:   lifts.movingFloorDownIds,
            liftSectorSpecial:    lifts.liftSectorSpecial,
            liftOriginalFh:       lifts.liftOriginalFh,
            liftMinAdjFh:         lifts.liftMinAdjFh,
            switchLinedefIds:     switchLinedefIds
        };
    }

    // --- Doors ---

    // A linedef with a door special controls the sector referenced by its tag
    // (remote door) or by its left sidedef sector (local door, tag == 0).
    _identifyDoors() {
        const {linedefs, sidedefs, sectors} = this._level;
        const doorSectorIds = new Set();
        const doorProps     = {};   // si → {speed, trigger, loop, onlyOnce, anim}

        const registerDoor = (si, sp) => {
            doorSectorIds.add(si);
            doorProps[si] = {
                speed:    WadConstants.DOOR_SPEED_BY_SPECIAL[sp] ?? 2,
                trigger:  WadConstants.DOOR_TRIGGER_BY_SPECIAL[sp] ?? 'action',
                loop:     WadConstants.DOOR_LOOP_BY_SPECIAL[sp] ?? false,
                onlyOnce: WadConstants.DOOR_ONLY_ONCE_BY_SPECIAL[sp] ?? false,
                anim:     WadConstants.DOOR_ANIM_BY_SPECIAL[sp] ?? 'round-trip'
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
            liftMinAdjFh[si]   = ((adjFh.length > 0) ? Math.min(...adjFh) : sectors[si].fh);
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

    // --- Switches ---

    // One-sided linedefs with a S-type special — the wall face IS the switch
    _identifySwitches() {
        const {linedefs, sidedefs} = this._level;
        const switchLinedefIds = new Set();

        for (let ldIdx = 0; ldIdx < linedefs.length; ldIdx++) {
            const ld = linedefs[ldIdx];
            if (!WadConstants.SWITCH_SPECIALS.has(ld.special)) {
                continue;
            }
            if (ld.right < 0 || ld.left >= 0) {
                continue;
            }
            const sd = sidedefs[ld.right];
            if (!sd.middle || sd.middle === '-') {
                continue;
            }
            switchLinedefIds.add(ldIdx);
        }

        return switchLinedefIds;
    }
}
