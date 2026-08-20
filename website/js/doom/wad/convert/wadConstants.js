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
    static MTF_AMBUSH     = 0x08;

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

    // --- Game profile extensions ---

    // The tables of this class are the GENERIC doom-format baseline. A game
    // profile contributes its specific entries through this hook (called once
    // per level build, before any analyzer runs): every entry lives in the
    // >= GAME_EXTENSION_BASE namespace — unreachable by vanilla WAD data
    // (specials cap at 141), emitted only by the profile's own xlat maps.
    // Previous extensions are wiped first (a Doom WAD loaded after a Heretic
    // one runs on the pristine baseline), then the derived membership sets
    // are recomputed.
    static GAME_EXTENSION_BASE = 1000;

    static applyGameExtensions(extensions) {
        for (const name of Object.keys(extensions)) {
            if (WadConstants[name] === undefined) {
                throw new Error('WadConstants - unknown extension table [' + name + ']');
            }
        }

        for (const name of WadConstants._EXTENSIBLE) {
            const target = WadConstants[name];
            if (target instanceof Set) {
                for (const value of [...target]) {
                    if (value >= WadConstants.GAME_EXTENSION_BASE) {
                        target.delete(value);
                    }
                }
                continue;
            }
            for (const key of Object.keys(target)) {
                if (Number(key) >= WadConstants.GAME_EXTENSION_BASE) {
                    delete target[key];
                }
            }
        }

        for (const name of Object.keys(extensions)) {
            const target = WadConstants[name];
            if (target instanceof Set) {
                for (const value of extensions[name]) {
                    target.add(value);
                }
                continue;
            }
            Object.assign(target, extensions[name]);
        }

        WadConstants._recomputeDerivedSets();
    }

    // Every table a profile may extend (wiped of its >= 1000 entries before a
    // new game's extensions are applied).
    static _EXTENSIBLE = [
        'DOOR_BY_SPECIAL', 'FLOOR_DOWN_BY_SPECIAL', 'FLOOR_UP_BY_SPECIAL',
        'STAIR_BY_SPECIAL', 'GUN_BY_SPECIAL', 'SWITCH_INTERACTION_BY_SPECIAL',
        'WALK_TRIGGER_ONCE_BY_SPECIAL', 'SCROLL_WALL_BY_SPECIAL',
        'SECTOR_DAMAGE_BY_SPECIAL', 'LIGHT_EFFECT_BY_SPECIAL',
        'SECTOR_PUSH_BY_SPECIAL', 'SECTOR_FRICTION_BY_SPECIAL',
        'SECTOR_FLAT_SCROLL_BY_SPECIAL',
        'SWITCH_SPECIALS', 'SWITCH_REVERSE_SPECIALS', 'SWITCH_EXIT_SPECIALS',
        'WALK_TRIGGER_SPECIALS', 'WALK_STOP_SPECIALS', 'WALK_EXIT_SPECIALS',
        'EXIT_SECRET_SPECIALS', 'TELEPORT_SPECIALS'
    ];

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
        // blaze 99/133-137) — 63 is the repeatable (SR) form of the S1 29
        29:  {kind: 'open',  speed: 2, trigger: 'none',      anim: 'round-trip', loop: false, onlyOnce: true,  key: null},
        61:  {kind: 'open',  speed: 2, trigger: 'none',      anim: 'one-way',    loop: false, onlyOnce: true,  key: null},
        63:  {kind: 'open',  speed: 2, trigger: 'none',      anim: 'round-trip', loop: false, onlyOnce: false, key: null},
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
        // Gun-open door (46 GR — P_ShootSpecialLine: EV_DoDoor open, stays
        // open). Driven by the impact lines (DoomGunTriggers), never
        // self-activated — like any remotely-driven door.
        46:  {kind: 'open',  speed: 2, trigger: 'none',      anim: 'one-way',    loop: false, onlyOnce: true,  key: null},
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

    // Name of the cycle a door special drives, and the key its keyframe variant
    // is declared under: the anim AND the speed, since two specials may share
    // the anim but not the speed (e.g. 4 at 2 and 105 at 8).
    static doorCycleKey(anim, speed) {
        return (anim + '@' + speed);
    }

    // Cycle key driven by a door special (null when the special is not a door)
    // — shared by the switch / walk / gun / boss trigger paths.
    static doorCycleKeyForSpecial(special) {
        const door = WadConstants.DOOR_BY_SPECIAL[special];
        return ((door !== undefined) ? WadConstants.doorCycleKey(door.anim, door.speed) : null);
    }

    // Cycle key of a lift-raise special ('raise:512@1'), null for the others —
    // no door anim contains 'raise:', so the two key families never collide.
    // A raise special gets a NAMED cycle on the lift it targets only when its
    // destination can outrun the lift's rest position: the fixed deltas
    // (raiseFloor 24/32/512) and the crush raise (absolute ceiling − 8). The
    // relative targets 'lowestCeiling'/'nextHigher'/'shortestLower' keep the
    // reverse playback (E1M5/E1M7 bidirectional plats).
    static floorRaiseCycleKey(special) {
        const rule = WadConstants.FLOOR_UP_BY_SPECIAL[special];
        if ((rule === undefined)
            || ((typeof rule.target !== 'number') && (rule.target !== 'lowestCeilingCrush'))) {
            return null;
        }

        return ('raise:' + rule.target + '@' + rule.speed);
    }

    // Cycle key driven by a special, whatever the mover family it aims at.
    static cycleKeyForSpecial(special) {
        return (WadConstants.doorCycleKeyForSpecial(special) ?? WadConstants.floorRaiseCycleKey(special));
    }

    // Pressure fields of one animation cycle, from a press profile — shared by
    // the door builder (base + variants) and the lift raise cycles.
    static pressCycleFields(press) {
        return {
            blockedBehavior:   press.behavior,
            blockedSlowFactor: ((press.slow) ? WadConstants.PRESS_SLOW_FACTOR : 1),
            crushDamage:       ((press.damage) ? WadConstants.crushDamageDescriptor() : null)
        };
    }

    // Timer doors (sector specials 10/14) have no linedef special: they get
    // the plain VDOORSPEED manual-door profile, tuned after registration.
    static DOOR_TIMER_DEFAULTS = {kind: 'open', speed: 2, trigger: 'action', anim: 'round-trip', loop: false, onlyOnce: false, key: null};

    // Derived membership sets — never edit these, edit DOOR_BY_SPECIAL
    // (computed by _recomputeDerivedSets, refreshed on profile extensions).
    static DOOR_SPECIALS               = null;
    static DOOR_CLOSE_SPECIALS         = null;
    static DOOR_CEILING_RAISE_SPECIALS = null;

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

    // --- Mover pressure (P_ChangeSector / T_MovePlane) ---

    // A mover whose crush flag is TRUE keeps moving through a squeezed player
    // and PIT_ChangeSector deals 10 hp every 4 tics; slow crushers (and the
    // no-damage 44/72) drop to speed/8 while crushing (T_MoveCeiling).
    static CRUSH_DAMAGE             = 10;
    static CRUSH_DAMAGE_WINDOW_TICS = 4;
    static PRESS_SLOW_FACTOR        = 0.125;
    // P_KillMobj does height >>= 2: a corpse only pinches (and grinds)
    // below a quarter of its living height.
    static CORPSE_HEIGHT_DIVISOR    = 4;

    static crushDamageDescriptor() {
        return {
            delta:   WadConstants.CRUSH_DAMAGE,
            windowS: WadConstants.CRUSH_DAMAGE_WINDOW_TICS * WadConstants.SECONDS_PER_TIC,
        };
    }

    // Pressure profile of a door/ceiling special, from its table fields
    // (p_doors.c T_VerticalDoor + p_ceilng.c EV_DoCeiling/T_MoveCeiling):
    //  - crushers → crush=true, continue through the player; only the
    //    CEILSPEED ones (25/49/73/141) slow to 1/8, the fast 6/77 do not.
    //  - open round-trips → blocked while closing = go back up (reverse).
    //  - 44/72 lowerAndCrush (the only close-stay with a closeMargin) →
    //    crush=false despite the name: stall + 1/8 slowdown, NO damage.
    //  - everything else (one-way opens, close-stay, close-wait-open,
    //    trap-close) → stall ("DO NOT GO BACK UP!").
    static doorPressProfile(anim, speedTics, closeMargin) {
        if (anim === 'crusher') {
            return {behavior: 'crush', slow: (speedTics === 1), damage: true};
        }
        if (anim === 'round-trip') {
            return {behavior: 'reverse', slow: false, damage: false};
        }
        if ((anim === 'close-stay') && ((closeMargin ?? 0) > 0)) {
            return {behavior: 'stall', slow: true, damage: false};
        }
        return {behavior: 'stall', slow: false, damage: false};
    }

    // Lifts (round-trip plats) blocked while rising go back down and re-wait
    // (T_PlatRaise res==crushed → status=down, count=wait). Perpetuals stay
    // on 'stall' (deliberate deviation: startReverse would end the loop at
    // keyframe 0; the stall freezes pose AND clock, resuming exactly).
    static floorDownPressBehavior(anim) {
        return ((anim === 'round-trip') ? 'reverse' : 'stall');
    }

    // Full press profile of a floor-down shape — the {behavior, slow, damage}
    // contract shared with doorPressProfile / floorUpPressProfile.
    static floorDownPressProfile(anim) {
        return {behavior: WadConstants.floorDownPressBehavior(anim), slow: false, damage: false};
    }

    // Rising floors: only the crush targets 55/56/65/94 (lowestCeilingCrush)
    // carry the vanilla crush flag (EV_DoFloor raiseFloorCrush) — continue +
    // damage, never slowed (floors have no 1/8 rule). Others stall (move undone).
    static floorUpPressProfile(special) {
        const entry = WadConstants.FLOOR_UP_BY_SPECIAL[special];
        if ((entry !== undefined) && (entry.target === 'lowestCeilingCrush')) {
            return {behavior: 'crush', slow: false, damage: true};
        }
        return {behavior: 'stall', slow: false, damage: false};
    }

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
    // The value is the SIGNED scroll rate: positive = leftward drift (48),
    // negative = rightward (profile extensions, e.g. Heretic's 99).
    static SCROLL_WALL_BY_SPECIAL = {48: 35};

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
    // FLOOR_DOWN_ONEWAY: EV_DoFloor one-way lowers — their destination is NOT
    // clamped in vanilla (p_floor.c posts P_Find*FloorSurrounding as-is, and
    // the T_MovePlane DOWN branch jumps to a destination ABOVE the floor on
    // the first tic) — the mappers' "instant floor rise" trick (pop-up
    // bridges, ambushes). The round-trip/perpetual plats DO clamp (p_plats.c:
    // if (plat->low > sec->floorheight) plat->low = sec->floorheight).
    static FLOOR_MOVE_DOWN_SPECIALS   = null;
    static FLOOR_DOWN_ONEWAY_SPECIALS = null;
    static FLOOR_PERPETUAL_SPECIALS   = null;

    // Tics at bottom before rising (Lower Lift)
    static LIFT_WAIT_TICS = 105;

    // --- Floors moving UP (rising floors — single table) ---

    // One COMPLETE entry per floor-up special (one-way raise toward a target).
    // Unlike the floor-down family, the static floor is NOT patched: the moving
    // top-flat sits at the WAD floor height and rises. All are driven by a
    // walk-trigger zone, a switch or an impact line (trigger 'none' on the
    // instance). Fields:
    //  - speed: Doom units/tic — FLOORSPEED = 1, raiseFloorTurbo
    //    129/130/131/132 = 4, the EV_DoPlat raise-and-change variants
    //    14/15/20/22/66/67/68/95 = PLATSPEED/2 = 0.5, donut ring 9 =
    //    FLOORSPEED/2 (EV_DoDonut).
    //  - target: number = fixed delta in Doom units above the current floor;
    //    'lowestCeiling' = P_FindLowestCeilingSurrounding clamped to the own
    //    ceiling ('lowestCeilingCrush' = same minus 8, raiseFloorCrush);
    //    'nextHigher' = P_FindNextHighestFloor (smallest neighbour floor
    //    strictly above; no candidate = no movement).
    //  - change: "+change" floors — flat texture / sector special swapped at
    //    trigger time (p_floor.c raiseFloor24AndChange 59/93 copies floorpic +
    //    special; p_plats.c raiseToNearestAndChange 20/22/68/95 copies the
    //    floorpic and ZEROES the special; raiseAndChange 14/15/66/67 floorpic
    //    only).
    //    source 'donutModel' = the donut's far-side model sector s3, known
    //    only to the donut identification (never resolved by tag).
    //  - donutRingOnly (9): resolved by the donut identification, not by tag —
    //    excluded from the walk/switch membership set below.
    static FLOOR_UP_BY_SPECIAL = {
        5:   {speed: 1,   target: 'lowestCeiling'},
        // S1 raiseAndChange 32/24 (p_switch.c case 14/15) — the one-use twins
        // of the SR pair 67/66.
        14:  {speed: 0.5, target: 32, change: {source: 'front', special: 'keep', at: 'start'}},
        15:  {speed: 0.5, target: 24, change: {source: 'front', special: 'keep', at: 'start'}},
        18:  {speed: 1,   target: 'nextHigher'},
        20:  {speed: 0.5, target: 'nextHigher', change: {source: 'front', special: 'zero', at: 'start'}},
        22:  {speed: 0.5, target: 'nextHigher', change: {source: 'front', special: 'zero', at: 'start'}},
        // Gun (G1) impact lines — P_ShootSpecialLine: 24 = EV_DoFloor
        // raiseFloor (same action as 5), 47 = EV_DoPlat raiseToNearestAndChange
        // (same action as 20/22/68). Started by DoomGunTriggers, never by a zone.
        24:  {speed: 1,   target: 'lowestCeiling'},
        // raiseToTexture 30 (W1) / 96 (WR): up by the shortest lower texture
        // around the sector (P_FindShortestTextureAround)
        30:  {speed: 1,   target: 'shortestLower'},
        47:  {speed: 0.5, target: 'nextHigher', change: {source: 'front', special: 'zero', at: 'start'}},
        55:  {speed: 1,   target: 'lowestCeilingCrush'},
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
        94:  {speed: 1,   target: 'lowestCeilingCrush'},
        95:  {speed: 0.5, target: 'nextHigher', change: {source: 'front', special: 'zero', at: 'start'}},
        96:  {speed: 1,   target: 'shortestLower'},
        101: {speed: 1,   target: 'lowestCeiling'},
        119: {speed: 1,   target: 'nextHigher'},
        128: {speed: 1,   target: 'nextHigher'},
        129: {speed: 4,   target: 'nextHigher'},
        130: {speed: 4,   target: 'nextHigher'},
        131: {speed: 4,   target: 'nextHigher'},
        132: {speed: 4,   target: 'nextHigher'},
        // S1 raiseFloor512 (p_floor.c): plain FLOORSPEED, fixed +512 delta.
        140: {speed: 1,   target: 512},
        // Donut ring: the target height comes from the donut identification
        // (the hole's far-side floor), never from a target rule. Its change is
        // T_MoveFloor donutRaise: the model's floorpic, special zeroed, at rest.
        9:   {speed: 0.5, target: null, donutRingOnly: true, change: {source: 'donutModel', special: 'zero', at: 'complete'}}
    };

    // Derived membership set — never edit this, edit FLOOR_UP_BY_SPECIAL.
    static FLOOR_MOVE_UP_SPECIALS = null;

    // Deliberate deviation from vanilla (which starts the raise instantly):
    // a rising floor waits this long before moving, so a player who fired the
    // trigger next to the platform has time to step onto it and ride up.
    static FLOOR_UP_START_DELAY_S = 1.0;

    // Travel time (s) of one mover leg: Doom units at a vanilla speed (u/tic).
    static moveDurationS(deltaDu, speedPerTic) {
        return (deltaDu / speedPerTic) * WadConstants.SECONDS_PER_TIC;
    }

    // Raise-leg timeline shared by the rising floors and the lift raise
    // cycles: hold the boarding delay, then one ramp to the target.
    static raiseLegKeyframes(startY, endY, moveS) {
        const delayS = WadConstants.FLOOR_UP_START_DELAY_S;

        return [
            {t: 0.0,            translate: [0, startY, 0], rotate: [0, 0, 0]},
            {t: delayS,         translate: [0, startY, 0], rotate: [0, 0, 0]},
            {t: delayS + moveS, translate: [0, endY, 0],   rotate: [0, 0, 0]}
        ];
    }

    // --- Gun (impact) triggers — p_spec.c P_ShootSpecialLine ---

    // The special fires when a hitscan trace CROSSES the linedef in 2D:
    // PTR_ShootTraverse calls P_ShootSpecialLine before any height check, so
    // a shot passing above/through the opening still activates it. G1 lines
    // burn out after one activation, GR (46) re-fires — and 46 is the only
    // impact special non-players may activate. The movers themselves are
    // registered by the tables above (46 → DOOR_BY_SPECIAL, 24/47 →
    // FLOOR_UP_BY_SPECIAL); these entries only carry the trigger behaviour.
    static GUN_BY_SPECIAL = {
        24: {once: true},
        46: {once: false},
        47: {once: true},
    };

    // Derived membership set — never edit this, edit GUN_BY_SPECIAL.
    static GUN_SPECIALS = null;

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
    static STAIR_SPECIALS        = null;
    static STAIR_SWITCH_SPECIALS = null;
    static STAIR_WALK_SPECIALS   = null;

    // --- Switches ---

    // NB: 22 is W1 (raiseToNearestAndChange, P_CrossSpecialLine) — a walk
    // trigger, NOT a switch (it must not appear here).
    static SWITCH_SPECIALS = new Set([
        11, 23, 45, 51, 60, 61, 62, 63, 122, 123,
        7, 9, 21, 29, 41, 43, 49, 64, 65, 66, 67, 68, 69, 70, 71, 101, 102, 103, 111, 112, 113,
        127,
        14, 15, 18, 20, 55, 131, 132, 140,
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
        132: {mode: 'timed', minOnMs: 1000, minOffMs: 1000},
        134: {mode: 'timed', minOnMs: 1000, minOffMs: 1000},
        136: {mode: 'timed', minOnMs: 1000, minOffMs: 1000}
    };
    static SWITCH_INTERACTION_DEFAULT = {mode: 'once', minOnMs: null, minOffMs: null};

    // The check below runs at every level build; one report per mistake is enough.
    static _WARNED_ORPHAN_SWITCHES = new Set();

    // S-type specials that end the level (11 = S1 Exit, 51 = S1 Secret Exit)
    static SWITCH_EXIT_SPECIALS = new Set([11, 51]);

    // W-type specials that end the level when crossed (52 = W1 Exit,
    // 124 = W1 Secret Exit) — routed through the walk-trigger zones.
    static WALK_EXIT_SPECIALS = new Set([52, 124]);

    // Exit specials (switch or walk) that lead to the SECRET level instead of
    // the next sequential one (51 = S1, 124 = W1).
    static EXIT_SECRET_SPECIALS = new Set([51, 124]);

    // --- Teleporters ---

    // Walk-over linedefs that teleport the player to the thing type 14 (teleport
    // landing) in the sector of the same tag. 39 = W1 (once), 97 = WR (repeatable).
    static TELEPORT_SPECIALS = new Set([39, 97]);

    // Monster-only teleport lines (xlat MONWALK) and the walk lines a monster
    // may cross-trigger (vanilla P_CrossSpecialLine whitelist: doors 4, plats
    // 10/88 — the teleports 39/97/125/126 are handled by the teleport tables).
    static MONSTER_TELEPORT_SPECIALS = new Set([125, 126]);
    static MONSTER_WALK_SPECIALS     = new Set([4, 10, 88]);
    static TELEPORT_ONCE_BY_SPECIAL = {39: true, 97: false, 125: true, 126: false};

    // PIT_StompThing telefrag damage (p_map.c)
    static TELEFRAG_DAMAGE = 10000;

    // Vanilla actor physics, shared by the monster modules: P_TryMove step
    // climb cap (24 map units), FLOATSPEED (p_local.h, 4 u/tic) and the BOOM
    // ORIG_FRICTION per-tic momentum keep (ActorExternalForces.DECAY holds the
    // same value engine-side — the engine cannot depend on this class).
    static ACTOR_STEP_HEIGHT = 24 * WadConstants.SCALE;
    static ACTOR_FLOAT_SPEED = 4 * WadConstants.SCALE;
    static ORIG_FRICTION     = 0.90625;

    // Feet-on-the-sector-floor tolerance (world units) of the runtime sector
    // effects (damage / secret / carry / friction): vanilla tests
    // mo->z == floorheight exactly; our float heights need a hair of slack.
    static ON_FLOOR_TOLERANCE = 0.02;

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
    // (W1), 82/83/84 (WR). Walk floor-raisers: 5/22/30/56/58/59/119/130 (W1),
    // 91/92/93/94/95/96/128/129 (WR) — see FLOOR_MOVE_UP_SPECIALS.
    static WALK_TRIGGER_SPECIALS = new Set([
        10, 19, 36, 37, 38, 82, 83, 84, 88, 98, 120, 121,
        5, 22, 30, 56, 58, 59, 119, 130, 91, 92, 93, 94, 95, 96, 128, 129,
        53, 87, 54, 89,
        57, 74
    ]);

    // Walk lines that STOP their tagged targets in place instead of starting
    // them: plats 54 (W1) / 89 (WR) (EV_StopPlat) and crushers 57 (W1) /
    // 74 (WR) (EV_CeilingCrushStop). A later start line resumes the target
    // exactly where it froze.
    static WALK_STOP_SPECIALS = new Set([54, 89, 57, 74]);

    // Longest displacement (world units) still read as a walk step by the
    // line-crossing guard (WadLineCrossing): the player covers at most ~0.22 m
    // per frame on foot or on a conveyor, so anything past a metre is a jump —
    // a teleport arrival, a restored save, or a zone re-entered after walking
    // around the line's end — and must not count as a crossing.
    static WALK_CROSS_MAX_STEP = 64 * WadConstants.SCALE;

    // Broadphase margin of a crossing zone, around its line. It is NOT a reach
    // like DOOR_ACTION_RADIUS: the crossing is only sampled while the player is
    // inside the circle and the first sample there is a warm-up, so the circle
    // must hold several frames of approach on the near side — the shortest
    // lines are 8 map units, and a frame is up to 0.22 m (0.5 m on a stutter).
    static WALK_ZONE_MARGIN = 128 * WadConstants.SCALE;

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
        5: true, 22: true, 30: true, 56: true, 58: true, 59: true, 119: true, 130: true,
        91: false, 92: false, 93: false, 94: false, 95: false, 96: false, 128: false, 129: false,
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
    static ML_SOUNDBLOCK    = 0x40;

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

    // --- Donut (EV_DoDonut) ---

    // True for the donut specials (the 'donutRingOnly' floor-up entries): on a
    // trigger line it identifies a donut; on a built rising floor's special it
    // identifies the sector as a donut RING (only _mergeDonutRings stamps it).
    static isDonutSpecial(special) {
        return (WadConstants.FLOOR_UP_BY_SPECIAL[special]?.donutRingOnly === true);
    }

    // --- Sector damage (P_PlayerInSpecialSector) ---

    // Damage applied to a player standing on the floor of a sector carrying
    // these SECTOR specials, once per windowTics window. leak = radiation-suit
    // leak chance out of 256 per window (0 = full protection, 5 = the Doom
    // super-damage leak, 256 = the suit never protects — e.g. Heretic lava).
    // 11 = E1M8 finale (unprotected damage + normal exit at ≤ 10 health).
    static SECTOR_DAMAGE_BY_SPECIAL = {
        7:  {damage: 5,  windowTics: 32, leak: 0},
        5:  {damage: 10, windowTics: 32, leak: 0},
        4:  {damage: 20, windowTics: 32, leak: 5},
        16: {damage: 20, windowTics: 32, leak: 5},
        11: {damage: 20, windowTics: 32, leak: 0}
    };

    // Secret sector (P_SpawnSpecials counts it in totalsecret, then
    // P_PlayerInSpecialSector credits it once and clears the special)
    static SECTOR_SECRET_SPECIAL = 9;

    // --- Screen feedback tints (st_stuff.c ST_doPaletteStuff) ---

    // Full-screen flash colors of the HUD tint aggregation: death and damage
    // use the PAIN red palettes, the pickup pulse the BONUS gold ones.
    static SCREEN_FLASH_PALETTE = {
        death:  {rgb: [255, 0, 0], alpha: 0.5},
        damage: {rgb: [255, 0, 0], maxAlpha: 0.6},
        pickup: {rgb: [215, 186, 69], maxAlpha: 0.35}
    };

    // Ambient tint of a running power-up (effect code → blend layer):
    //  - radiation: vanilla RADIATIONPAL (palette 13), UZDoom blends
    //    PowerIronFeet as "00 ff 00" at 0.125 (powerups.zs);
    //  - invulnerability: deliberate deviation from the vanilla
    //    INVERSECOLORMAP (user decision) — one golden wash for every game.
    static POWERUP_SCREEN_TINTS = {
        radiation:       {rgb: [0, 255, 0],   alpha: 0.125},
        invulnerability: {rgb: [255, 200, 0], alpha: 0.25}
    };

    // HUD line shown while the effect runs (label code → doomTranslations);
    // effects absent from this table (berserkFlash…) get no line.
    static EFFECT_HUD_LABELS = {
        invulnerability: 'effect.invulnerability',
        radiation:       'effect.radiationSuit',
        light:           'effect.light',
        invisibility:    'effect.invisibility'
    };

    // Same, for the PERMANENT power-ups carried as items (whole level, no
    // countdown). The map items (computerMap / superMap) stay out on purpose:
    // their effect is a no-op without an automap (user decision).
    static PERMANENT_ITEM_HUD_LABELS = {
        berserk: 'effect.berserk'
    };

    // Partial invisibility: the weapon in hand fades to this alpha (GZDoom
    // renders the owner's psprites translucent under MF_SHADOW).
    static INVISIBILITY_WEAPON_ALPHA = 0.33;

    // Night vision (light visor / torch): scene-wide light floor pushed to
    // Engine3d.setLightOverride — 1 = full bright, the vanilla colormap 0.
    static NIGHT_VISION_LIGHT = 1;

    // End-of-powerup blink (ST_doPaletteStuff): the effect stays solid above
    // 4*32 remaining tics, then strobes on the 8-tic bit of the countdown.
    // Fed by the ms-based effect clocks (DoomUser.getEffects()).
    static POWERUP_BLINK_THRESHOLD_TICS = 128;

    static powerupVisibleMs(remainingMs) {
        const remainingTics = WadConstants.msToTics(remainingMs);
        return ((remainingTics > WadConstants.POWERUP_BLINK_THRESHOLD_TICS)
            || ((Math.trunc(remainingTics) & 8) !== 0));
    }

    // Berserk pickup red wash (PowerStrength.GetBlend, powerups.zs): the
    // "ff 00 00" blend starts at 0.5 × 128/256 and fades out over 1024 tics.
    static BERSERK_FLASH_RGB  = [255, 0, 0];
    static BERSERK_FLASH_TICS = 1024;
    static BERSERK_FLASH_MS   = WadConstants.BERSERK_FLASH_TICS * WadConstants.SECONDS_PER_TIC * 1000;

    static berserkFlashAlpha(elapsedTics) {
        const cnt = 128 - (Math.trunc(elapsedTics) >> 3);
        return ((cnt > 0) ? (0.5 * cnt / 256) : 0);
    }

    static msToTics(ms) {
        return ((ms / 1000) / WadConstants.SECONDS_PER_TIC);
    }

    // --- Sector pushes (wind / conveyor floors) ---

    // Player push of a SECTOR special, in map units per tic. kind 'wind' =
    // per-tic thrust, applied on the ground AND in the air (Heretic windTab);
    // kind 'carry' = terminal carry speed, feet on the sector floor only
    // (BOOM scroller mechanics). Doom has none — the tables are filled by
    // game profiles (Heretic 20-51 + lava 4).
    static SECTOR_PUSH_BY_SPECIAL = {};

    // Ground slipperiness of a SECTOR special: per-tic momentum keep factor
    // fed to ActorExternalForces.setGroundFriction (Heretic ice = 0.97265625).
    static SECTOR_FRICTION_BY_SPECIAL = {};

    // Visual floor-flat scroll of a SECTOR special, in map units per tic
    // eastward (Heretic east carriers + scrolling lava — vanilla only
    // scrolls the texture for the EAST family).
    static SECTOR_FLAT_SCROLL_BY_SPECIAL = {};

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
        // Run by default (cl_run), tuned to ~2/3 of the vanilla forwardmove 50
        // (≈ 0.0091): deliberate deviation — the jump (absent from vanilla)
        // extends the reach, so the run-across gaps stay crossable (playtested
        // on MAP20's alcove) at a tamer top speed. The walk-slow modifier
        // halves it, and a partial analog deflection covers everything in
        // between.
        moveSpeed:       0.006,
        stepHeight:      0.375,
        // Kill plane: below every real map floor — falling out of the map
        // (through a geometry hole) kills the player instead of falling forever.
        voidKillY:       -100
    };

    static DEFAULT_BACKGROUND = [200, 200, 200];
    static DEFAULT_AMBIENT    = [235, 235, 235];

    // Doom light diminishing — transcription of the UZDoom default lighting
    // (shaders/glsl/main.fp R_ZDoomColormap, r_visibility = 8): the darkness
    // colormap index of a pixel is (shade − vis) × 31 with
    // vis = min(GlobVis/z, 24/32) and shade = 2 − (L+12)/128 (L = sector light
    // 0..255). GlobVis = R_GetGlobVis()/32 = 40 in Doom units — resolution
    // independent (320×200 4:3 and 1920×1080 16:9 both yield 1280/32,
    // r_utility.cpp:375). The engine depth is in metres (1 m = 64 u), so the
    // visibility constant is pre-divided by 64; the light input is L/255.
    // Composition difference vs UZDoom: there the curve is the ONLY light
    // application (vertex colours stay white in software lighting); here it
    // multiplies faces already linearly baked with the sector light, so the
    // scene reads darker and the vanilla close-up over-brightening is absent.
    static LIGHT_DIMINISH_VISIBILITY     = 40 / 64;
    static LIGHT_DIMINISH_VISIBILITY_MAX = 24 / 32;
    static LIGHT_DIMINISH_SHADE_BASE     = 2 - (12 / 128);
    static LIGHT_DIMINISH_SHADE_SCALE    = 255 / 128;
    static LIGHT_DIMINISH_RAMP_COUNT     = 32;
    // Fraction of the computed darkness actually applied (user setting: the
    // full UZDoom curve reads slightly too strong here).
    static LIGHT_DIMINISH_STRENGTH       = 0.8;

    // Floor the rendered sector light converges to: an absolute black is
    // something the original never showed — vanilla's darkest colormap still
    // averages 2.9/255, and 40 through the diminishing curve lands in the same
    // 3-5% band.
    static SECTOR_LIGHT_MIN              = 40;
    // Knee of sectorLightLevel. The higher, the closer the curve hugs the raw
    // level: at 4 it is already within 1% from 96 up, so only the near-black
    // end is lifted and the contrast between rooms is left alone.
    static SECTOR_LIGHT_KNEE             = 4;

    /**
     * Rendered level of a raw sector light — the SINGLE conversion every light
     * goes through, whether it is baked once by the parser or stepped every tic
     * by a light thinker. A soft knee rather than a clamp: max(raw, MIN) would
     * flatten every level below the floor onto it, which erases the gradation
     * between a pitch-dark room and a dim one; this stays strictly increasing.
     *
     * @param {number} raw 0..255 from the SECTORS lump
     * @returns {number} MIN..255
     */
    static sectorLightLevel(raw) {
        const knee = WadConstants.SECTOR_LIGHT_KNEE;
        const lit  = Math.pow(Math.pow(raw, knee) + Math.pow(WadConstants.SECTOR_LIGHT_MIN, knee), 1 / knee);

        return Math.min(255, lit);
    }

    // Parameters for Engine3d.setDepthShading (common to every doom-format
    // game — an engine behaviour, not a per-game profile datum).
    static lightDiminishParams() {
        return {
            visibility:    WadConstants.LIGHT_DIMINISH_VISIBILITY,
            visibilityMax: WadConstants.LIGHT_DIMINISH_VISIBILITY_MAX,
            shadeBase:     WadConstants.LIGHT_DIMINISH_SHADE_BASE,
            shadeScale:    WadConstants.LIGHT_DIMINISH_SHADE_SCALE,
            rampCount:     WadConstants.LIGHT_DIMINISH_RAMP_COUNT,
            strength:      WadConstants.LIGHT_DIMINISH_STRENGTH
        };
    }

    // Recompute every derived membership set from its source table — called
    // once at class load and again after each applyGameExtensions.
    static _recomputeDerivedSets() {
        WadConstants.DOOR_SPECIALS               = WadConstants._specialsWhere(WadConstants.DOOR_BY_SPECIAL, (d) => (d.kind !== 'close'));
        WadConstants.DOOR_CLOSE_SPECIALS         = WadConstants._specialsWhere(WadConstants.DOOR_BY_SPECIAL, (d) => (d.kind === 'close'));
        WadConstants.DOOR_CEILING_RAISE_SPECIALS = WadConstants._specialsWhere(WadConstants.DOOR_BY_SPECIAL, (d) => (d.kind === 'ceilingRaise'));
        WadConstants.FLOOR_MOVE_DOWN_SPECIALS    = WadConstants._specialsWhere(WadConstants.FLOOR_DOWN_BY_SPECIAL, () => true);
        WadConstants.FLOOR_DOWN_ONEWAY_SPECIALS  = WadConstants._specialsWhere(WadConstants.FLOOR_DOWN_BY_SPECIAL, (d) => (d.anim === 'one-way'));
        WadConstants.FLOOR_PERPETUAL_SPECIALS    = WadConstants._specialsWhere(WadConstants.FLOOR_DOWN_BY_SPECIAL, (f) => (f.anim === 'perpetual'));
        WadConstants.FLOOR_MOVE_UP_SPECIALS      = WadConstants._specialsWhere(WadConstants.FLOOR_UP_BY_SPECIAL, (f) => (f.donutRingOnly !== true));
        WadConstants.GUN_SPECIALS                = WadConstants._specialsWhere(WadConstants.GUN_BY_SPECIAL, () => true);
        WadConstants.STAIR_SPECIALS              = WadConstants._specialsWhere(WadConstants.STAIR_BY_SPECIAL, () => true);
        WadConstants.STAIR_SWITCH_SPECIALS       = WadConstants._specialsWhere(WadConstants.STAIR_BY_SPECIAL, (s) => (s.activation === 'switch'));
        WadConstants.STAIR_WALK_SPECIALS         = WadConstants._specialsWhere(WadConstants.STAIR_BY_SPECIAL, (s) => (s.activation === 'walk'));
        WadConstants._warnOrphanSwitchProfiles();
    }

    // Such a special builds no panel at all: its profile is dead data and the
    // line is silently inert. Warned, never thrown — a table mistake must not
    // cost a level.
    static _warnOrphanSwitchProfiles() {
        for (const key of Object.keys(WadConstants.SWITCH_INTERACTION_BY_SPECIAL)) {
            const special = Number(key);
            if (WadConstants.SWITCH_SPECIALS.has(special) || WadConstants._WARNED_ORPHAN_SWITCHES.has(special)) {
                continue;
            }
            WadConstants._WARNED_ORPHAN_SWITCHES.add(special);
            console.warn('WadConstants - special [' + special + '] has a switch interaction profile but is not a switch special');
        }
    }

    static {
        WadConstants._recomputeDerivedSets();
    }
}
