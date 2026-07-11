/**
 * Configuration constants of the WAD converter (transposition of convert_wad.py).
 */
class WadConstants {
    // 64 Doom units = 1 metre
    static SCALE = 1.0 / 64.0;

    // Max distance (Doom units) a thing may be from the nearest sector polygon
    // when no sector strictly contains it; beyond this the thing is dropped.
    static THING_SECTOR_MAX_DIST = 64;

    // THING flags (entry byte 8). Skill bits gate a thing per difficulty
    // (1-2 → 0x01, 3 → 0x02, 4-5 → 0x04); 0x10 means "not in single-player"
    // (multiplayer/co-op/DM only). 0x08 is "ambush" (deaf), irrelevant to display.
    static MTF_NOT_SINGLE = 0x10;

    // Doom game tic = 1/35 s (animation/timing unit).
    static SECONDS_PER_TIC = 1 / 35;

    // Vanilla texture/flat animation speed (p_spec.c hardcoded sequences),
    // also the fallback for a malformed ANIMATED speed.
    static ANIM_DEFAULT_SPEED_TICS = 8;

    // Membership Set derived from a per-special table — the unified tables
    // (DOOR_BY_SPECIAL, FLOOR_DOWN_BY_SPECIAL…) are the single source of
    // truth, a derived set is never edited by hand.
    static _specialsWhere(table, predicate) {
        return new Set(Object.keys(table).map(Number).filter((sp) => predicate(table[sp])));
    }

    // --- Doors (single table per special) ---

    // One COMPLETE entry per door/ceiling special — the membership sets below
    // (DOOR_SPECIALS, DOOR_CLOSE_SPECIALS…) are DERIVED from this table, never
    // written by hand. Fields:
    //  - kind: 'open' (panel rises from the floor — p_doors.c EV_DoDoor /
    //    EV_DoLockedDoor), 'close' (panel parked open above the ceiling,
    //    descends — EV_DoDoor close variants, EV_DoCeiling lowers 41/43/44/72
    //    and crushers 6/25/49/73/77/141), 'ceilingRaise' (40 = W1
    //    RaiseCeilingLowerFloor: target = HIGHEST adjacent ceiling, no track
    //    offset, rest at the own ceiling; its floor half rides the floor-down
    //    family on the same tag).
    //  - speed: Doom units/tic — VDOORSPEED = 2, blaze = 8, ceilings
    //    CEILSPEED = 1, fast crushers CEILSPEED*2 = 2 (p_doors.c / p_ceilng.c).
    //  - trigger: 'action' (press E on the panel), 'proximity' (walk line),
    //    'none' (driven remotely by a switch / walk zone).
    //  - anim: 'round-trip' (open-wait-close), 'one-way' (open-stay, ALWAYS
    //    onlyOnce — re-triggering a finished one-way would snap the door shut,
    //    a vanilla visual no-op), 'close-stay', 'close-wait-open' (reopens
    //    after 30 s — DOOR_CLOSE_REOPEN_WAIT_TICS), 'crusher' (native loop,
    //    paused by the stop lines 57/74, never onlyOnce).
    //  - key: key item required (locked DR 26/27/28, D1 32/33/34, blaze
    //    switch 99/133 blue, 134/135 red, 136/137 yellow) — checked on the
    //    door instance (manual) or on the switch/USE zone (EV_DoLockedDoor).
    //  - closeMargin: Doom units left above the floor at the end of a close
    //    (lowerAndCrush / crushAndRaise: bottomheight = floor + 8).
    static DOOR_BY_SPECIAL = {
        // Manual doors (DR round-trip / D1 one-way), plain and locked
        1:   {kind: 'open',  speed: 2, trigger: 'action',    anim: 'round-trip', loop: false, onlyOnce: false, key: null},
        26:  {kind: 'open',  speed: 2, trigger: 'action',    anim: 'round-trip', loop: false, onlyOnce: false, key: 'blueKey'},
        27:  {kind: 'open',  speed: 2, trigger: 'action',    anim: 'round-trip', loop: false, onlyOnce: false, key: 'yellowKey'},
        28:  {kind: 'open',  speed: 2, trigger: 'action',    anim: 'round-trip', loop: false, onlyOnce: false, key: 'redKey'},
        31:  {kind: 'open',  speed: 2, trigger: 'action',    anim: 'one-way',    loop: false, onlyOnce: true,  key: null},
        32:  {kind: 'open',  speed: 2, trigger: 'action',    anim: 'one-way',    loop: false, onlyOnce: true,  key: 'blueKey'},
        33:  {kind: 'open',  speed: 2, trigger: 'action',    anim: 'one-way',    loop: false, onlyOnce: true,  key: 'redKey'},
        34:  {kind: 'open',  speed: 2, trigger: 'action',    anim: 'one-way',    loop: false, onlyOnce: true,  key: 'yellowKey'},
        117: {kind: 'open',  speed: 8, trigger: 'action',    anim: 'round-trip', loop: false, onlyOnce: false, key: null},
        118: {kind: 'open',  speed: 8, trigger: 'action',    anim: 'one-way',    loop: false, onlyOnce: true,  key: null},
        // Walk-open doors (2/109 W1, 86/90/105/106/108 WR/W1 blaze mixes)
        2:   {kind: 'open',  speed: 2, trigger: 'proximity', anim: 'one-way',    loop: false, onlyOnce: true,  key: null},
        4:   {kind: 'open',  speed: 2, trigger: 'proximity', anim: 'round-trip', loop: false, onlyOnce: true,  key: null},
        86:  {kind: 'open',  speed: 2, trigger: 'proximity', anim: 'one-way',    loop: false, onlyOnce: true,  key: null},
        90:  {kind: 'open',  speed: 2, trigger: 'proximity', anim: 'round-trip', loop: false, onlyOnce: false, key: null},
        105: {kind: 'open',  speed: 8, trigger: 'proximity', anim: 'round-trip', loop: false, onlyOnce: false, key: null},
        106: {kind: 'open',  speed: 8, trigger: 'proximity', anim: 'one-way',    loop: false, onlyOnce: true,  key: null},
        108: {kind: 'open',  speed: 8, trigger: 'proximity', anim: 'round-trip', loop: false, onlyOnce: true,  key: null},
        109: {kind: 'open',  speed: 8, trigger: 'proximity', anim: 'one-way',    loop: false, onlyOnce: true,  key: null},
        // Switch-open doors (29/61/63/103 + blaze 111/112/114/115 + locked
        // blaze 99/133-137) — 63 is the SR press-on-door exception ('action')
        29:  {kind: 'open',  speed: 2, trigger: 'none',      anim: 'round-trip', loop: false, onlyOnce: true,  key: null},
        61:  {kind: 'open',  speed: 2, trigger: 'none',      anim: 'one-way',    loop: false, onlyOnce: true,  key: null},
        63:  {kind: 'open',  speed: 2, trigger: 'action',    anim: 'round-trip', loop: false, onlyOnce: false, key: null},
        103: {kind: 'open',  speed: 2, trigger: 'none',      anim: 'one-way',    loop: false, onlyOnce: true,  key: null},
        111: {kind: 'open',  speed: 8, trigger: 'none',      anim: 'round-trip', loop: false, onlyOnce: true,  key: null},
        112: {kind: 'open',  speed: 8, trigger: 'none',      anim: 'one-way',    loop: false, onlyOnce: true,  key: null},
        114: {kind: 'open',  speed: 8, trigger: 'none',      anim: 'round-trip', loop: false, onlyOnce: false, key: null},
        115: {kind: 'open',  speed: 8, trigger: 'none',      anim: 'one-way',    loop: false, onlyOnce: true,  key: null},
        99:  {kind: 'open',  speed: 8, trigger: 'none',      anim: 'one-way',    loop: false, onlyOnce: true,  key: 'blueKey'},
        133: {kind: 'open',  speed: 8, trigger: 'none',      anim: 'one-way',    loop: false, onlyOnce: true,  key: 'blueKey'},
        134: {kind: 'open',  speed: 8, trigger: 'none',      anim: 'one-way',    loop: false, onlyOnce: true,  key: 'redKey'},
        135: {kind: 'open',  speed: 8, trigger: 'none',      anim: 'one-way',    loop: false, onlyOnce: true,  key: 'redKey'},
        136: {kind: 'open',  speed: 8, trigger: 'none',      anim: 'one-way',    loop: false, onlyOnce: true,  key: 'yellowKey'},
        137: {kind: 'open',  speed: 8, trigger: 'none',      anim: 'one-way',    loop: false, onlyOnce: true,  key: 'yellowKey'},
        // Closing doors (walk 3/75, reopen-after-30s 16/76, switch 42/50,
        // blaze 107/110/113/116). onlyOnce even in WR/SR: replaying a finished
        // close would snap the panel back open (vanilla no-op); the
        // close-wait-open cycle returns to rest → replayable in WR (76).
        3:   {kind: 'close', speed: 2, trigger: 'proximity', anim: 'close-stay',      loop: false, onlyOnce: true,  key: null},
        16:  {kind: 'close', speed: 2, trigger: 'proximity', anim: 'close-wait-open', loop: false, onlyOnce: true,  key: null},
        42:  {kind: 'close', speed: 2, trigger: 'none',      anim: 'close-stay',      loop: false, onlyOnce: true,  key: null},
        50:  {kind: 'close', speed: 2, trigger: 'none',      anim: 'close-stay',      loop: false, onlyOnce: true,  key: null},
        75:  {kind: 'close', speed: 2, trigger: 'proximity', anim: 'close-stay',      loop: false, onlyOnce: true,  key: null},
        76:  {kind: 'close', speed: 2, trigger: 'proximity', anim: 'close-wait-open', loop: false, onlyOnce: false, key: null},
        107: {kind: 'close', speed: 8, trigger: 'proximity', anim: 'close-stay',      loop: false, onlyOnce: true,  key: null},
        110: {kind: 'close', speed: 8, trigger: 'proximity', anim: 'close-stay',      loop: false, onlyOnce: true,  key: null},
        113: {kind: 'close', speed: 8, trigger: 'none',      anim: 'close-stay',      loop: false, onlyOnce: true,  key: null},
        116: {kind: 'close', speed: 8, trigger: 'none',      anim: 'close-stay',      loop: false, onlyOnce: true,  key: null},
        // Moving ceilings: 40 raiseToHighest, 41/43 lowerToFloor,
        // 44/72 lowerAndCrush (stop at floor + 8)
        40:  {kind: 'ceilingRaise', speed: 1, trigger: 'proximity', anim: 'one-way',  loop: false, onlyOnce: true, key: null},
        41:  {kind: 'close', speed: 1, trigger: 'none',      anim: 'close-stay', loop: false, onlyOnce: true,  key: null},
        43:  {kind: 'close', speed: 1, trigger: 'none',      anim: 'close-stay', loop: false, onlyOnce: true,  key: null},
        44:  {kind: 'close', speed: 1, trigger: 'proximity', anim: 'close-stay', loop: false, onlyOnce: true,  key: null, closeMargin: 8},
        72:  {kind: 'close', speed: 1, trigger: 'proximity', anim: 'close-stay', loop: false, onlyOnce: true,  key: null, closeMargin: 8},
        // Crushers (6/77 fast, 25/49/73 slow, 141 silent)
        6:   {kind: 'close', speed: 2, trigger: 'proximity', anim: 'crusher', loop: true, onlyOnce: false, key: null, closeMargin: 8},
        25:  {kind: 'close', speed: 1, trigger: 'proximity', anim: 'crusher', loop: true, onlyOnce: false, key: null, closeMargin: 8},
        49:  {kind: 'close', speed: 1, trigger: 'none',      anim: 'crusher', loop: true, onlyOnce: false, key: null, closeMargin: 8},
        73:  {kind: 'close', speed: 1, trigger: 'proximity', anim: 'crusher', loop: true, onlyOnce: false, key: null, closeMargin: 8},
        77:  {kind: 'close', speed: 2, trigger: 'proximity', anim: 'crusher', loop: true, onlyOnce: false, key: null, closeMargin: 8},
        141: {kind: 'close', speed: 1, trigger: 'proximity', anim: 'crusher', loop: true, onlyOnce: false, key: null, closeMargin: 8}
    };

    // Timer doors (sector specials 10/14) have no linedef special: they get
    // the plain VDOORSPEED manual-door profile, tuned after registration.
    static DOOR_TIMER_DEFAULTS = {kind: 'open', speed: 2, trigger: 'action', anim: 'round-trip', loop: false, onlyOnce: false, key: null};

    // Derived membership sets — never edit these, edit DOOR_BY_SPECIAL.
    static DOOR_SPECIALS               = WadConstants._specialsWhere(WadConstants.DOOR_BY_SPECIAL, (d) => (d.kind !== 'close'));
    static DOOR_CLOSE_SPECIALS         = WadConstants._specialsWhere(WadConstants.DOOR_BY_SPECIAL, (d) => (d.kind === 'close'));
    static DOOR_CEILING_RAISE_SPECIALS = WadConstants._specialsWhere(WadConstants.DOOR_BY_SPECIAL, (d) => (d.kind === 'ceilingRaise'));

    // Close-wait-open: tics held closed before reopening (close30ThenOpen).
    static DOOR_CLOSE_REOPEN_WAIT_TICS = 30 * 35;

    // Tics before auto-close (~4.3 s)
    static DOOR_WAIT_TICS = 150;

    // Action radius in metres (xz_diagonal/2 + this margin)
    static DOOR_ACTION_RADIUS = 0.5;

    // Doom units left at the top of a door panel for the ceiling track mechanism
    static DOOR_TRACK_OFFSET = 4;

    // Timer doors (SECTOR specials, no linedef — P_SpawnSpecials arms a
    // countdown at level load): 10 = the statically open sector close-stays
    // after 30 s (P_SpawnDoorCloseIn30); 14 = the closed door runs ONE
    // open-wait-close cycle after 5 minutes (P_SpawnDoorRaiseIn5Mins → type
    // normal). Both at VDOORSPEED.
    static SECTOR_DOOR_CLOSE_SPECIAL    = 10;
    static SECTOR_DOOR_OPEN_SPECIAL     = 14;
    static SECTOR_DOOR_CLOSE_DELAY_TICS = 30 * 35;
    static SECTOR_DOOR_OPEN_DELAY_TICS  = 5 * 60 * 35;

    // --- Sector light effects ---

    // p_spec.c P_SpawnSpecials → p_lights.c thinkers (one step per tic):
    // 1 = flicker (T_LightFlash), 2/3 = strobe fast/slow async, 4 = strobe fast
    // (the damage half lives in SECTOR_DAMAGE_BY_SPECIAL), 8 = glow (T_Glow),
    // 12/13 = strobe slow/fast in sync, 17 = fire flicker (T_FireFlicker).
    // strobe: STROBEBRIGHT=5 tics at max, FASTDARK=15 / SLOWDARK=35 at min.
    static LIGHT_EFFECT_BY_SPECIAL = {
        1:  {type: 'flicker'},
        2:  {type: 'strobe', darkTics: 15, sync: false},
        3:  {type: 'strobe', darkTics: 35, sync: false},
        4:  {type: 'strobe', darkTics: 15, sync: false},
        8:  {type: 'glow'},
        12: {type: 'strobe', darkTics: 35, sync: true},
        13: {type: 'strobe', darkTics: 15, sync: true},
        17: {type: 'fire'},
    };
    static LIGHT_STROBE_BRIGHT_TICS = 5;    // STROBEBRIGHT (p_spec.h)
    static LIGHT_GLOW_SPEED         = 8;    // GLOWSPEED, per tic
    static LIGHT_FLASH_MAX_MASK     = 64;   // T_LightFlash: (P_Random()&64)+1 tics at max
    static LIGHT_FLASH_MIN_MASK     = 7;    // T_LightFlash: (P_Random()&7)+1 tics at min
    static LIGHT_FIRE_PERIOD_TICS   = 4;    // T_FireFlicker steps every 4 tics
    static LIGHT_FIRE_STEP          = 16;   // amount = (P_Random()&3)*16
    static LIGHT_FIRE_MIN_OFFSET    = 16;   // minlight = min surrounding + 16

    // --- Scrolling walls ---

    // Linedef 48 (p_spec.c P_SpawnSpecials → linespeciallist, P_UpdateSpecials):
    // the FRONT sidedef's textureoffset advances FRACUNIT (1 texel) per tic,
    // forever — no tag, no trigger. 1 texel/tic × 35 tics/s = 35 texels/s.
    static SCROLL_WALL_SPECIALS       = new Set([48]);
    static SCROLL_WALL_TEXELS_PER_SEC = 35;

    // --- Floors moving DOWN (lifts, lowers, perpetual plats — single table) ---

    // One COMPLETE entry per floor-down special; the membership sets below are
    // derived. The static floor of these sectors is patched to the LOW position
    // (the instance covers it). Every entry is driven externally (switch or
    // walk zone — never self-proximity, which fails on raised platforms), so
    // the instance trigger is always 'none'. Fields:
    //  - speed: Doom units/tic — plats 62/88/10/21 = PLATSPEED*4 = 4, blaze
    //    120-123 = PLATSPEED*8 = 8, floor lowers = FLOORSPEED = 1, turboLower
    //    36/70/71/98 = FLOORSPEED*4 = 4, donut hole 9 = FLOORSPEED/2
    //    (p_plats.c / p_floor.c / EV_DoDonut).
    //  - anim: 'round-trip' (lift: down, wait, back up), 'one-way' (lower and
    //    stay), 'perpetual' (53/87 = p_plats.c perpetualRaise, oscillates
    //    between the lowest and highest surrounding floors, native loop,
    //    paused by the stop lines 54/89).
    //  - target: 'lowest' = min adjacent floor, 'highest' = max adjacent
    //    floor, 'highest+8' — always clamped to never rise (see
    //    _identifyLifts).
    //  - change: "+change" floors — the moving floor also swaps its flat
    //    texture / sector special (37/84 = lowerAndChange, copied from the
    //    neighbour at the destination height when the move COMPLETES).
    // 40 is the floor half of W1 RaiseCeilingLowerFloor (fired alongside the
    // ceiling raise on the same tag — the only special allowed to overlap a
    // door-registered sector). 9 is the donut hole (EV_DoDonut: lowers to the
    // floor of the sector beyond the ring). 56 is a RAISE-crush, not here.
    static FLOOR_DOWN_BY_SPECIAL = {
        // Lifts (round-trip to lowest): 62/88 SR/WR, one-shot 10/21 W1/S1,
        // blaze 120-123
        10:  {speed: 4, anim: 'round-trip', loop: false, onlyOnce: true,  target: 'lowest'},
        21:  {speed: 4, anim: 'round-trip', loop: false, onlyOnce: true,  target: 'lowest'},
        62:  {speed: 4, anim: 'round-trip', loop: false, onlyOnce: false, target: 'lowest'},
        88:  {speed: 4, anim: 'round-trip', loop: false, onlyOnce: false, target: 'lowest'},
        120: {speed: 8, anim: 'round-trip', loop: false, onlyOnce: false, target: 'lowest'},
        121: {speed: 8, anim: 'round-trip', loop: false, onlyOnce: true,  target: 'lowest'},
        122: {speed: 8, anim: 'round-trip', loop: false, onlyOnce: true,  target: 'lowest'},
        123: {speed: 8, anim: 'round-trip', loop: false, onlyOnce: false, target: 'lowest'},
        // One-way floor lowers (walk 19/23/36/37/38/82/83/84/98, switch
        // 23/60/70, remote 71/102)
        19:  {speed: 1, anim: 'one-way', loop: false, onlyOnce: true, target: 'highest'},
        23:  {speed: 1, anim: 'one-way', loop: false, onlyOnce: true, target: 'lowest'},
        36:  {speed: 4, anim: 'one-way', loop: false, onlyOnce: true, target: 'highest+8'},
        37:  {speed: 1, anim: 'one-way', loop: false, onlyOnce: true, target: 'lowest', change: {source: 'dest', special: 'copy', at: 'complete'}},
        38:  {speed: 1, anim: 'one-way', loop: false, onlyOnce: true, target: 'lowest'},
        60:  {speed: 1, anim: 'one-way', loop: false, onlyOnce: true, target: 'lowest'},
        70:  {speed: 4, anim: 'one-way', loop: false, onlyOnce: true, target: 'highest+8'},
        71:  {speed: 4, anim: 'one-way', loop: false, onlyOnce: true, target: 'highest+8'},
        82:  {speed: 1, anim: 'one-way', loop: false, onlyOnce: true, target: 'lowest'},
        83:  {speed: 1, anim: 'one-way', loop: false, onlyOnce: true, target: 'highest'},
        84:  {speed: 1, anim: 'one-way', loop: false, onlyOnce: true, target: 'lowest', change: {source: 'dest', special: 'copy', at: 'complete'}},
        98:  {speed: 4, anim: 'one-way', loop: false, onlyOnce: true, target: 'highest+8'},
        102: {speed: 1, anim: 'one-way', loop: false, onlyOnce: true, target: 'highest'},
        // Perpetual plats (53 W1 / 87 WR), ceiling-raise floor half (40),
        // donut hole (9)
        53:  {speed: 1,   anim: 'perpetual', loop: true,  onlyOnce: false, target: 'lowest'},
        87:  {speed: 1,   anim: 'perpetual', loop: true,  onlyOnce: false, target: 'lowest'},
        40:  {speed: 1,   anim: 'one-way',   loop: false, onlyOnce: true,  target: 'lowest'},
        9:   {speed: 0.5, anim: 'one-way',   loop: false, onlyOnce: true,  target: 'lowest'}
    };

    // Derived membership sets — never edit these, edit FLOOR_DOWN_BY_SPECIAL.
    static FLOOR_MOVE_DOWN_SPECIALS = WadConstants._specialsWhere(WadConstants.FLOOR_DOWN_BY_SPECIAL, () => true);
    static FLOOR_PERPETUAL_SPECIALS = WadConstants._specialsWhere(WadConstants.FLOOR_DOWN_BY_SPECIAL, (f) => (f.anim === 'perpetual'));

    // Tics at bottom before rising (Lower Lift)
    static LIFT_WAIT_TICS = 105;

    // --- Floors moving UP (rising floors — single table) ---

    // One COMPLETE entry per floor-up special (one-way raise toward a target).
    // Unlike the floor-down family, the static floor is NOT patched: the moving
    // top-flat sits at the WAD floor height and rises. All are driven by a
    // walk-trigger zone or a switch (trigger 'none' on the instance). G1/GR gun
    // variants (24, 47) are not handled yet (they need weapon fire). Fields:
    //  - speed: Doom units/tic — FLOORSPEED = 1, raiseFloorTurbo 129/130/131 =
    //    4, the EV_DoPlat raise-and-change variants 20/22/66/67/68 =
    //    PLATSPEED/2 = 0.5, donut ring 9 = FLOORSPEED/2 (EV_DoDonut).
    //  - target: number = fixed delta in Doom units above the current floor;
    //    'lowestCeiling' = P_FindLowestCeilingSurrounding clamped to the own
    //    ceiling ('lowestCeilingCrush' = same minus 8, raiseFloorCrush);
    //    'nextHigher' = P_FindNextHighestFloor (smallest neighbour floor
    //    strictly above; no candidate = no movement).
    //  - change: "+change" floors — flat texture / sector special swapped at
    //    trigger time (p_floor.c raiseFloor24AndChange 59/93 copies floorpic +
    //    special; p_plats.c raiseToNearestAndChange 20/22/68 copies the
    //    floorpic and ZEROES the special; raiseAndChange 66/67 floorpic only).
    //  - donutRingOnly (9): resolved by the donut identification, not by tag —
    //    excluded from the walk/switch membership set below.
    static FLOOR_UP_BY_SPECIAL = {
        5:   {speed: 1,   target: 'lowestCeiling'},
        18:  {speed: 1,   target: 'nextHigher'},
        20:  {speed: 0.5, target: 'nextHigher', change: {source: 'front', special: 'zero', at: 'start'}},
        22:  {speed: 0.5, target: 'nextHigher', change: {source: 'front', special: 'zero', at: 'start'}},
        56:  {speed: 1,   target: 'lowestCeilingCrush'},
        58:  {speed: 1,   target: 24},
        59:  {speed: 1,   target: 24, change: {source: 'front', special: 'copy', at: 'start'}},
        64:  {speed: 1,   target: 'lowestCeiling'},
        65:  {speed: 1,   target: 'lowestCeilingCrush'},
        66:  {speed: 0.5, target: 24, change: {source: 'front', special: 'keep', at: 'start'}},
        67:  {speed: 0.5, target: 32, change: {source: 'front', special: 'keep', at: 'start'}},
        68:  {speed: 0.5, target: 'nextHigher', change: {source: 'front', special: 'zero', at: 'start'}},
        69:  {speed: 1,   target: 'nextHigher'},
        91:  {speed: 1,   target: 'lowestCeiling'},
        92:  {speed: 1,   target: 24},
        93:  {speed: 1,   target: 24, change: {source: 'front', special: 'copy', at: 'start'}},
        101: {speed: 1,   target: 'lowestCeiling'},
        119: {speed: 1,   target: 'nextHigher'},
        128: {speed: 1,   target: 'nextHigher'},
        129: {speed: 4,   target: 'nextHigher'},
        130: {speed: 4,   target: 'nextHigher'},
        131: {speed: 4,   target: 'nextHigher'},
        // Donut ring: the target height comes from the donut identification
        // (the hole's far-side floor), never from a target rule.
        9:   {speed: 0.5, target: null, donutRingOnly: true}
    };

    // Derived membership set — never edit this, edit FLOOR_UP_BY_SPECIAL.
    static FLOOR_MOVE_UP_SPECIALS = WadConstants._specialsWhere(WadConstants.FLOOR_UP_BY_SPECIAL, (f) => (f.donutRingOnly !== true));

    // Deliberate deviation from vanilla (which starts the raise instantly):
    // a rising floor waits this long before moving, so a player who fired the
    // trigger next to the platform has time to step onto it and ride up.
    static FLOOR_UP_START_DELAY_S = 1.0;

    // --- Stairs (build stairs, EV_BuildStairs — single table) ---

    // A stair special raises a CHAIN of sectors: the tagged base sector rises by
    // one step, then each adjacent sector sharing a two-sided line AND the same
    // floor flat rises to the running cumulated height (base_fh + i*step). Each
    // step is modelled as an independent one-way rising floor (WadStairBuilder);
    // they all start() together — the staggered arrival (different travel) gives
    // the staircase ripple, no native animation loop needed.
    // step = Doom units per stair sector; speed = Doom units/tic (build8 =
    // FLOORSPEED/4, turbo16 = FLOORSPEED*4); activation = S1 switch / W1 walk.
    static STAIR_BY_SPECIAL = {
        7:   {activation: 'switch', step: 8,  speed: 0.25},
        8:   {activation: 'walk',   step: 8,  speed: 0.25},
        100: {activation: 'walk',   step: 16, speed: 4},
        127: {activation: 'switch', step: 16, speed: 4}
    };

    // Derived membership sets — never edit these, edit STAIR_BY_SPECIAL.
    static STAIR_SPECIALS        = WadConstants._specialsWhere(WadConstants.STAIR_BY_SPECIAL, () => true);
    static STAIR_SWITCH_SPECIALS = WadConstants._specialsWhere(WadConstants.STAIR_BY_SPECIAL, (s) => (s.activation === 'switch'));
    static STAIR_WALK_SPECIALS   = WadConstants._specialsWhere(WadConstants.STAIR_BY_SPECIAL, (s) => (s.activation === 'walk'));

    // --- Switches ---

    // NB: 22 is W1 (raiseToNearestAndChange, P_CrossSpecialLine) — a walk
    // trigger, NOT a switch (it must not appear here).
    static SWITCH_SPECIALS = new Set([
        11, 23, 45, 51, 60, 61, 62, 122, 123,
        7, 9, 21, 29, 41, 43, 49, 64, 65, 66, 67, 68, 69, 70, 71, 101, 102, 103, 111, 112, 113,
        127,
        18, 20, 131,
        114, 115, 99, 133, 134, 135, 136, 137,
        42, 50, 113, 116
    ]);

    // Switches that start their targets BACKWARD (startReverse): 45 = SR lower
    // floor to highest — walks a raised rising-floor back down to its origin
    // (vanilla pairs it with raise specials 5/64/91 on the same tag; both use
    // FLOORSPEED, so reversed playback keeps the exact vanilla speed).
    static SWITCH_REVERSE_SPECIALS = new Set([45]);

    // Interaction profile of a switch: SR = 'timed' (re-usable button, vanilla
    // P_ChangeSwitchTexture(line, 1)), S1 = 'once' — the default for any
    // special absent from this table (see SWITCH_INTERACTION_DEFAULT).
    static SWITCH_INTERACTION_BY_SPECIAL = {
        11:  {mode: 'once',  minOnMs: null, minOffMs: null},
        23:  {mode: 'once',  minOnMs: null, minOffMs: null},
        51:  {mode: 'once',  minOnMs: null, minOffMs: null},
        122: {mode: 'once',  minOnMs: null, minOffMs: null},
        42:  {mode: 'timed', minOnMs: 1000, minOffMs: 1000},
        43:  {mode: 'timed', minOnMs: 1000, minOffMs: 1000},
        45:  {mode: 'timed', minOnMs: 1000, minOffMs: 1000},
        60:  {mode: 'timed', minOnMs: 1000, minOffMs: 1000},
        61:  {mode: 'timed', minOnMs: 1000, minOffMs: 1000},
        62:  {mode: 'timed', minOnMs: 1000, minOffMs: 1000},
        63:  {mode: 'timed', minOnMs: 1000, minOffMs: 1000},
        64:  {mode: 'timed', minOnMs: 1000, minOffMs: 1000},
        65:  {mode: 'timed', minOnMs: 1000, minOffMs: 1000},
        66:  {mode: 'timed', minOnMs: 1000, minOffMs: 1000},
        67:  {mode: 'timed', minOnMs: 1000, minOffMs: 1000},
        68:  {mode: 'timed', minOnMs: 1000, minOffMs: 1000},
        69:  {mode: 'timed', minOnMs: 1000, minOffMs: 1000},
        70:  {mode: 'timed', minOnMs: 1000, minOffMs: 1000},
        99:  {mode: 'timed', minOnMs: 1000, minOffMs: 1000},
        114: {mode: 'timed', minOnMs: 1000, minOffMs: 1000},
        115: {mode: 'timed', minOnMs: 1000, minOffMs: 1000},
        116: {mode: 'timed', minOnMs: 1000, minOffMs: 1000},
        123: {mode: 'timed', minOnMs: 1000, minOffMs: 1000},
        134: {mode: 'timed', minOnMs: 1000, minOffMs: 1000},
        136: {mode: 'timed', minOnMs: 1000, minOffMs: 1000}
    };
    static SWITCH_INTERACTION_DEFAULT = {mode: 'once', minOnMs: null, minOffMs: null};

    // S-type specials that end the level (11 = S1 Exit, 51 = S1 Secret Exit)
    static SWITCH_EXIT_SPECIALS = new Set([11, 51]);

    // W-type specials that end the level when crossed (52 = W1 Exit,
    // 124 = W1 Secret Exit) — routed through the walk-trigger zones.
    static WALK_EXIT_SPECIALS = new Set([52, 124]);

    // Exit specials (switch or walk) that lead to the SECRET level instead of
    // the next sequential one (51 = S1, 124 = W1).
    static EXIT_SECRET_SPECIALS = new Set([51, 124]);

    // --- Level progression (vanilla g_game.c G_DoCompleted) ---

    // Normal exit taken FROM the secret level ExM9: per-episode return map.
    static EPISODE_SECRET_RETURN = {1: 'E1M4', 2: 'E2M6', 3: 'E3M7', 4: 'E4M3'};

    /**
     * Next level after an exit. The WAD format carries no progression data
     * (no UMAPINFO lump support yet), so this applies the vanilla engine
     * rules (G_DoCompleted) to the level names read from the WAD:
     * - ExMy: secret exit → ExM9; normal exit from ExM9 → per-episode return
     *   (EPISODE_SECRET_RETURN); otherwise sequential.
     * - MAPxx: secret exit → MAP31 (MAP32 when already on MAP31); normal exit
     *   from MAP31/MAP32 → MAP16; otherwise sequential.
     * Falls back to the sequential next level when the routed target does not
     * exist in the WAD (partial WAD), and to null at the end of the list.
     *
     * @param {string[]} levels  level names of the WAD, in WAD order
     * @param {string}   current
     * @param {boolean}  secret
     * @returns {string|null}
     */
    static nextLevelName(levels, current, secret) {
        const index = levels.indexOf(current);
        const sequential = ((index >= 0 && index + 1 < levels.length) ? levels[index + 1] : null);

        let routed = null;
        const episodic = current.match(/^E(\d)M(\d)$/);
        const doom2 = current.match(/^MAP(\d{2})$/);
        if (episodic !== null) {
            const [, episode, map] = episodic;
            if (secret) {
                routed = 'E' + episode + 'M9';
            } else if (map === '9') {
                routed = WadConstants.EPISODE_SECRET_RETURN[episode] ?? null;
            }
        } else if (doom2 !== null) {
            const map = parseInt(doom2[1], 10);
            if (secret) {
                routed = ((map === 31) ? 'MAP32' : 'MAP31');
            } else if (map === 31 || map === 32) {
                routed = 'MAP16';
            }
        }

        return ((routed !== null && levels.includes(routed)) ? routed : sequential);
    }

    // --- Teleporters ---

    // Walk-over linedefs that teleport the player to the thing type 14 (teleport
    // landing) in the sector of the same tag. 39 = W1 (once), 97 = WR (repeatable).
    static TELEPORT_SPECIALS = new Set([39, 97]);
    static TELEPORT_ONCE_BY_SPECIAL = {39: true, 97: false};

    // Doom thing type of a teleport landing (destination marker, not rendered).
    static TELEPORT_LANDING_THING = 14;

    // Cooldown (ms) after a teleport before the same pad may fire again.
    static TELEPORT_COOLDOWN_MS = 1000;

    // --- Walk triggers (W1/WR) ---

    // Walk-over linedefs that activate a REMOTE tagged element (lift/floor/door)
    // by crossing them — like a switch, but proximity-activated. Modelled as an
    // invisible proximity zone at the linedef that start()s the tagged target
    // instances. The matching lift/floor specials must be 'none' in their
    // *_TRIGGER_BY_SPECIAL so the zone drives them (not self-proximity).
    // Walk lifts: 88 (WR), 120 (WR fast), 121 (W1 fast). 122 is S1 fast = a
    // SWITCH lift, not walk (see SWITCH_SPECIALS). Walk floor-lowers: 19/36/37/38
    // (W1), 82/83/84 (WR). Walk floor-raisers: 5/22/56/58/59/119/130 (W1),
    // 91/92/93/128/129 (WR) — see FLOOR_MOVE_UP_SPECIALS.
    static WALK_TRIGGER_SPECIALS = new Set([
        10, 19, 36, 37, 38, 82, 83, 84, 88, 98, 120, 121,
        5, 22, 56, 58, 59, 119, 130, 91, 92, 93, 128, 129,
        53, 87, 54, 89,
        57, 74
    ]);

    // Walk lines that STOP their tagged targets in place instead of starting
    // them: plats 54 (W1) / 89 (WR) (EV_StopPlat) and crushers 57 (W1) /
    // 74 (WR) (EV_CeilingCrushStop). A later start line resumes the target
    // exactly where it froze.
    static WALK_STOP_SPECIALS = new Set([54, 89, 57, 74]);

    // W1 (once) vs WR (repeatable) — carried by the zone instance's onlyOnce.
    // Includes the tagged WALK door specials (2/109 = W1, 86/90 = WR) routed
    // through the same zone mechanism (see _identifyWalkTriggers).
    static WALK_TRIGGER_ONCE_BY_SPECIAL = {
        88: false, 120: false,
        121: true, 10: true,
        19: true, 36: true, 37: true, 38: true,
        82: false, 83: false, 84: false, 98: false,
        2: true, 4: true, 109: true, 86: false, 90: false,
        105: false, 106: false, 108: true,
        3: true, 16: true, 75: false, 76: false, 107: false, 110: true,
        5: true, 22: true, 56: true, 58: true, 59: true, 119: true, 130: true,
        91: false, 92: false, 93: false, 128: false, 129: false,
        53: true, 87: false, 54: true, 89: false,
        40: true, 44: true, 72: false,
        6: true, 25: true, 141: true, 73: false, 77: false,
        57: true, 74: false
    };

    // --- Linedef flags ---

    static ML_BLOCKING      = 0x01;
    static ML_BLOCKMONSTERS = 0x02;
    static ML_DONTPEGTOP    = 0x08;
    static ML_DONTPEGBOTTOM = 0x10;

    // Doom picture-column format sentinel
    static PATCH_END_COLUMN = 0xFF;

    // --- Floor texture/type change (the "+change" specials) ---

    // The "+change" rules live on the floor entries themselves (field 'change'
    // of FLOOR_DOWN_BY_SPECIAL / FLOOR_UP_BY_SPECIAL); this accessor is the
    // single lookup point for a linedef special of either family.
    static floorChangeForSpecial(special) {
        const entry = WadConstants.FLOOR_DOWN_BY_SPECIAL[special] ?? WadConstants.FLOOR_UP_BY_SPECIAL[special];
        return ((entry !== undefined) ? (entry.change ?? null) : null);
    }

    // --- Sector damage (P_PlayerInSpecialSector) ---

    // Damage applied every 32-tic window to a player standing on the floor of
    // a sector carrying these SECTOR specials. 11 = E1M8 finale (unprotected
    // damage + normal exit at ≤ 10 health).
    static SECTOR_DAMAGE_BY_SPECIAL = {7: 5, 5: 10, 4: 20, 16: 20, 11: 20};

    // The radiation suit fully cancels 5/7 but leaks with a 5/256 chance per
    // window on the super-damage specials.
    static SECTOR_DAMAGE_LEAK_SPECIALS = new Set([4, 16]);

    static SECTOR_DAMAGE_WINDOW_TICS = 32;

    // Secret sector (P_SpawnSpecials counts it in totalsecret, then
    // P_PlayerInSpecialSector credits it once and clears the special)
    static SECTOR_SECRET_SPECIAL = 9;

    // --- Pickups ---

    // Proximity radius (metres) at which a pickup is collected — vanilla exact:
    // every pickup has a logical radius of 20 units and touches at item radius
    // + player radius = 36 units (p_map.c PIT_CheckThing → P_TouchSpecialThing),
    // regardless of the sprite's visual width. Fixed for all pickups.
    static PICKUP_RADIUS = 36 / 64;

    // --- Player / world defaults ---

    // Doom player = 56 units (0.875), shaved by ~1% on purpose: vanilla lets a
    // player through an opening of EXACTLY 56 (strict < in p_map.c) — common
    // in level design (e.g. E1M4 raised floor, gap 160-104=56). Our engine's
    // vertical clearance is stricter, so the margin restores those passages.
    static PLAYER_HEIGHT = 0.866;

    static USER_DEFAULTS = {
        maxEnergy:       100,
        // Eyes kept at the vanilla VIEWHEIGHT (41 units = 0.640625) despite
        // the height shave: 0.640625 / 0.866 ≈ 0.740.
        eyeRatio:        0.740,
        radius:          0.275,
        // Vanilla Doom gravity: GRAVITY = 1 unit/tic² (p_local.h) = 35²/64 =
        // 19.141 m/s² — about twice Earth's, the snappy Doom fall.
        gravity:         19.141,
        // Jump height matched to GZDoom (JumpZ 8 → effective peak 36 units =
        // 0.5625 m) at the vanilla gravity: v = sqrt(2 * 19.141 * 0.5625).
        maxJumpVelocity: 4.640,
        maxSlopeAngle:   50,
        moveSpeed:       0.0045,
        stepHeight:      0.375,
        // Kill plane: below every real map floor — falling out of the map
        // (through a geometry hole) kills the player instead of falling forever.
        voidKillY:       -100
    };

    static DEFAULT_BACKGROUND = [200, 200, 200];
    static DEFAULT_AMBIENT    = [235, 235, 235];

    // Horizontal sky repeat factor: vanilla Doom wraps the 256-px sky ~4× per
    // 360°. Carried in the sky descriptor so the (generic) engine never hardcodes
    // this Doom-specific value.
    static SKY_WRAP = 4;

    // Vanilla sky texture by level: E<m>M<n> → SKY<m> (m clamped 1..4) ;
    // MAP<nn> → SKY1 (1-11) / SKY2 (12-20) / SKY3 (21+). Fallback SKY1.
    static skyNameForLevel(levelName) {
        const ep = (/^E(\d)M\d/i).exec(levelName);
        if (ep !== null) {
            return 'SKY' + Math.min(4, Math.max(1, parseInt(ep[1], 10)));
        }
        const mp = (/^MAP(\d+)/i).exec(levelName);
        if (mp !== null) {
            const n = parseInt(mp[1], 10);
            if (n <= 11) {
                return 'SKY1';
            }
            if (n <= 20) {
                return 'SKY2';
            }
            return 'SKY3';
        }

        return 'SKY1';
    }
}
