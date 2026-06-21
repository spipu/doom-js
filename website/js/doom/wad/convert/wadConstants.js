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

    // --- Doors ---

    // Linedef types that trigger door-OPEN actions. Includes the tag-targeted
    // remote doors (29, 61, 103) opened by their switch, and the walk-open doors
    // (86/90 WR, 109 W1 fast). Only OPEN-type doors (the builder raises a panel);
    // CLOSE-type doors (3, 16, 42, 50, 75, 76, 107, 110…) are out of scope until
    // a descending-panel build exists.
    static DOOR_SPECIALS = new Set([1, 2, 26, 27, 28, 29, 31, 32, 33, 34, 61, 63, 86, 90, 103, 109, 117, 118]);

    // Speed in Doom units/tic for each door special type (35 tics/s)
    static DOOR_SPEED_BY_SPECIAL = {
        1: 2, 2: 2, 3: 2, 4: 2, 26: 2, 27: 2, 28: 2, 29: 2,
        42: 2, 50: 2, 61: 2, 86: 2, 90: 2, 103: 2,
        31: 8, 32: 8, 33: 8, 34: 8, 63: 8, 109: 8,
        117: 12, 118: 12
    };

    // Tics before auto-close (~4.3 s)
    static DOOR_WAIT_TICS = 150;

    // Trigger type per door special ('action' = press E, 'proximity' = walk,
    // 'none' = opened only by a remote switch — see WadSwitchBuilder)
    static DOOR_TRIGGER_BY_SPECIAL = {
        1: 'action', 26: 'action', 27: 'action', 28: 'action',
        31: 'action', 32: 'action', 33: 'action', 34: 'action',
        63: 'action', 117: 'action', 118: 'action',
        2: 'proximity', 86: 'proximity', 90: 'proximity',
        109: 'proximity',
        29: 'none', 61: 'none', 103: 'none'
    };

    static DOOR_LOOP_BY_SPECIAL = {
        1: false, 26: false, 27: false, 28: false, 63: false, 117: false,
        2: false, 31: false, 32: false, 33: false, 34: false, 118: false
    };

    static DOOR_ONLY_ONCE_BY_SPECIAL = {
        2: true, 31: true, 32: true, 33: true, 34: true, 118: true,
        1: false, 26: false, 27: false, 28: false, 63: false, 117: false,
        103: true, 29: true, 109: true,
        61: false, 86: false, 90: false
    };

    static DOOR_ANIM_BY_SPECIAL = {
        2: 'one-way', 31: 'one-way', 32: 'one-way', 33: 'one-way', 34: 'one-way', 118: 'one-way',
        1: 'round-trip', 26: 'round-trip', 27: 'round-trip', 28: 'round-trip',
        63: 'round-trip', 117: 'round-trip',
        29: 'round-trip',
        61: 'one-way', 103: 'one-way', 86: 'one-way', 90: 'one-way',
        109: 'one-way'
    };

    // Action radius in metres (xz_diagonal/2 + this margin)
    static DOOR_ACTION_RADIUS = 0.5;

    // Key item required to open a locked door, by linedef special (Doom canon:
    // DR variants 26/27/28, D1 variants 32/33/34). Doors absent here open freely.
    static DOOR_KEY_BY_SPECIAL = {
        26: 'blueKey', 27: 'yellowKey', 28: 'redKey',
        32: 'blueKey', 33: 'redKey', 34: 'yellowKey'
    };

    // Doom units left at the top of a door panel for the ceiling track mechanism
    static DOOR_TRACK_OFFSET = 4;

    // --- Lifts / moving floors ---

    // Lifts 62/88 (SR/WR) + fast 120/121/122/123 (WR/W1/S1/SR), remote
    // floor-lowers 71 (8 above highest) / 102 (to highest) / 19 (to highest, W1),
    // and the walk floor-lowers 36/37/38/82/83/84. (56 is a RAISE-crush, handled
    // elsewhere — not a down-floor.)
    static FLOOR_MOVE_DOWN_SPECIALS = new Set([19, 23, 36, 37, 38, 62, 71, 82, 83, 84, 88, 102, 120, 121, 122, 123]);

    static LIFT_SPEED_BY_SPECIAL = {
        62: 4, 88: 4,
        19: 2, 23: 2, 38: 2, 82: 2, 83: 2,
        36: 8, 37: 2, 84: 2,
        120: 8, 121: 8, 122: 8, 123: 8,
        71: 8, 102: 2
    };

    static LIFT_ANIM_BY_SPECIAL = {
        62: 'round-trip', 88: 'round-trip',
        19: 'one-way', 23: 'one-way', 36: 'one-way', 37: 'one-way', 38: 'one-way',
        82: 'one-way', 83: 'one-way', 84: 'one-way',
        120: 'round-trip', 121: 'round-trip', 122: 'round-trip', 123: 'round-trip',
        71: 'one-way', 102: 'one-way'
    };

    // 'none' = driven externally (switch or walk-trigger zone). The WR/W1 walk
    // lifts (88, 120, 121, 122) are 'none' here and started by a walk-trigger
    // zone at their linedef (see WALK_TRIGGER_SPECIALS) — not by self-proximity,
    // which fails on elevated platforms (the 3D radius never reaches the raised
    // centre).
    // 'none' = driven externally (switch or walk-trigger zone). Switch lifts
    // (62/123 SR, 122 S1) and walk lifts (88/120 WR, 121 W1) are 'none'; the
    // walk floor-lowers 19/36/37/38 (W1) and 82/83/84 (WR) too — all started by
    // their walk-trigger zone / switch, never by self-proximity.
    static LIFT_TRIGGER_BY_SPECIAL = {
        62: 'none',
        88: 'none',
        23: 'none',
        19: 'none', 36: 'none', 37: 'none', 38: 'none',
        82: 'none', 83: 'none', 84: 'none',
        120: 'none', 121: 'none', 122: 'none', 123: 'none',
        71: 'none', 102: 'none'
    };

    static LIFT_LOOP_BY_SPECIAL = {
        62: false, 88: false,
        19: false, 23: false, 36: false, 37: false, 38: false,
        82: false, 83: false, 84: false,
        120: false, 121: false, 122: false, 123: false,
        71: false, 102: false
    };

    static LIFT_ONLY_ONCE_BY_SPECIAL = {
        62: false, 88: false,
        19: true, 23: true, 36: true, 37: true, 38: true,
        82: true, 83: true, 84: true,
        120: false, 121: true, 122: true, 123: false,
        71: true, 102: true
    };

    // Target floor height rule per special: 'lowest' (default) = min adjacent
    // floor (classic lower lift), 'highest' = max adjacent floor (19/83/102),
    // 'highest+8' = max adjacent floor + 8 (36/71). Consumed by _identifyLifts.
    static LIFT_TARGET_BY_SPECIAL = {
        71: 'highest+8', 36: 'highest+8', 102: 'highest', 19: 'highest', 83: 'highest'
    };

    // Tics at bottom before rising (Lower Lift)
    static LIFT_WAIT_TICS = 105;

    // --- Rising floors ---

    // Floors that move UP a fixed delta when walked over (one-way). Unlike the
    // lifts above, the static floor is NOT patched down: the moving top-flat
    // sits at the WAD floor height and rises. 'raise to next/highest' variants
    // (5, 24, 91...) need an adjacent-target computation and are out of scope.
    static FLOOR_MOVE_UP_SPECIALS = new Set([58]);

    // Delta in Doom units for each fixed-delta rising floor.
    static FLOOR_UP_DELTA_BY_SPECIAL = {
        58: 24
    };

    // Speed in Doom units/tic for rising floors (slow floor = 2).
    static FLOOR_UP_SPEED_BY_SPECIAL = {
        58: 2
    };

    // --- Switches ---

    static SWITCH_SPECIALS = new Set([
        11, 23, 51, 61, 62, 122, 123,
        7, 9, 21, 22, 29, 41, 64, 65, 66, 67, 68, 69, 70, 71, 101, 102, 103, 111, 112, 113
    ]);

    // mode, minOnTime (ms), minOffTime (ms)
    static SWITCH_INTERACTION_BY_SPECIAL = {
        11: ['once', null, null],
        23: ['once', null, null],
        51: ['once', null, null],
        62: ['timed', 1000, 1000],
        122: ['once', null, null],
        123: ['timed', 1000, 1000]
    };

    // S-type specials that end the level (11 = S1 Exit, 51 = S1 Secret Exit)
    static SWITCH_EXIT_SPECIALS = new Set([11, 51]);

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
    // (W1), 82/83/84 (WR).
    static WALK_TRIGGER_SPECIALS = new Set([19, 36, 37, 38, 82, 83, 84, 88, 120, 121]);

    // W1 (once) vs WR (repeatable) — carried by the zone instance's onlyOnce.
    // Includes the tagged WALK door specials (2/109 = W1, 86/90 = WR) routed
    // through the same zone mechanism (see _identifyWalkTriggers).
    static WALK_TRIGGER_ONCE_BY_SPECIAL = {
        88: false, 120: false,
        121: true,
        19: true, 36: true, 37: true, 38: true,
        82: false, 83: false, 84: false,
        2: true, 109: true, 86: false, 90: false
    };

    // --- Linedef flags ---

    static ML_BLOCKING      = 0x01;
    static ML_BLOCKMONSTERS = 0x02;
    static ML_DONTPEGTOP    = 0x08;
    static ML_DONTPEGBOTTOM = 0x10;

    // Doom picture-column format sentinel
    static PATCH_END_COLUMN = 0xFF;

    // --- Pickups ---

    // Proximity radius (metres) at which a pickup is collected. The sprite's
    // half-width is added on top per thing; this base covers the player radius
    // plus the vertical gap between the player centre and a floor sprite centre.
    static PICKUP_RADIUS = 0.6;

    // --- Player / world defaults ---

    static PLAYER_HEIGHT = 0.875;

    static USER_DEFAULTS = {
        maxEnergy:       100,
        eyeRatio:        0.73,
        radius:          0.275,
        gravity:         9.81,
        maxJumpVelocity: 3.5,
        maxSlopeAngle:   50,
        moveSpeed:       0.0036,
        stepHeight:      0.375
    };

    static DEFAULT_BACKGROUND = [200, 200, 200];
    static DEFAULT_AMBIENT    = [235, 235, 235];
}
