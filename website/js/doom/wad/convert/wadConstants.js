/**
 * Configuration constants of the WAD converter (transposition of convert_wad.py).
 */
class WadConstants {
    // 64 Doom units = 1 metre
    static SCALE = 1.0 / 64.0;

    // Max distance (Doom units) a thing may be from the nearest sector polygon
    // when no sector strictly contains it; beyond this the thing is dropped.
    static THING_SECTOR_MAX_DIST = 64;

    // --- Doors ---

    // Linedef types that trigger door-open actions
    static DOOR_SPECIALS = new Set([1, 2, 26, 27, 28, 31, 32, 33, 34, 63, 117, 118]);

    // Speed in Doom units/tic for each door special type (35 tics/s)
    static DOOR_SPEED_BY_SPECIAL = {
        1: 2, 2: 2, 3: 2, 4: 2, 26: 2, 27: 2, 28: 2, 29: 2,
        42: 2, 50: 2, 61: 2, 75: 2, 76: 2, 86: 2, 90: 2, 103: 2,
        31: 8, 32: 8, 33: 8, 34: 8, 63: 8,
        117: 12, 118: 12
    };

    // Tics before auto-close (~4.3 s)
    static DOOR_WAIT_TICS = 150;

    // Trigger type per door special ('action' = press E, 'proximity' = walk)
    static DOOR_TRIGGER_BY_SPECIAL = {
        1: 'action', 26: 'action', 27: 'action', 28: 'action',
        31: 'action', 32: 'action', 33: 'action', 34: 'action',
        63: 'action', 117: 'action', 118: 'action',
        2: 'proximity', 86: 'proximity', 75: 'proximity', 76: 'proximity', 90: 'proximity'
    };

    static DOOR_LOOP_BY_SPECIAL = {
        1: false, 26: false, 27: false, 28: false, 63: false, 117: false,
        2: false, 31: false, 32: false, 33: false, 34: false, 118: false
    };

    static DOOR_ONLY_ONCE_BY_SPECIAL = {
        2: true, 31: true, 32: true, 33: true, 34: true, 118: true,
        1: false, 26: false, 27: false, 28: false, 63: false, 117: false
    };

    static DOOR_ANIM_BY_SPECIAL = {
        2: 'one-way', 31: 'one-way', 32: 'one-way', 33: 'one-way', 34: 'one-way', 118: 'one-way',
        1: 'round-trip', 26: 'round-trip', 27: 'round-trip', 28: 'round-trip',
        63: 'round-trip', 117: 'round-trip'
    };

    // Action radius in metres (xz_diagonal/2 + this margin)
    static DOOR_ACTION_RADIUS = 0.5;

    // Doom units left at the top of a door panel for the ceiling track mechanism
    static DOOR_TRACK_OFFSET = 4;

    // --- Lifts / moving floors ---

    static FLOOR_MOVE_DOWN_SPECIALS = new Set([23, 36, 37, 38, 56, 62, 82, 83, 84, 88]);

    static LIFT_SPEED_BY_SPECIAL = {
        62: 4, 88: 4,
        23: 2, 38: 2, 82: 2, 83: 2,
        36: 8, 37: 2, 56: 2, 84: 2
    };

    static LIFT_ANIM_BY_SPECIAL = {
        62: 'round-trip', 88: 'round-trip',
        23: 'one-way', 36: 'one-way', 37: 'one-way', 38: 'one-way',
        56: 'one-way', 82: 'one-way', 83: 'one-way', 84: 'one-way'
    };

    static LIFT_TRIGGER_BY_SPECIAL = {
        62: 'none',
        88: 'proximity',
        23: 'none',
        36: 'always', 37: 'always', 38: 'always',
        56: 'always', 82: 'always', 83: 'always', 84: 'always'
    };

    static LIFT_LOOP_BY_SPECIAL = {
        62: false, 88: false,
        23: false, 36: false, 37: false, 38: false,
        56: false, 82: false, 83: false, 84: false
    };

    static LIFT_ONLY_ONCE_BY_SPECIAL = {
        62: false, 88: false,
        23: true, 36: true, 37: true, 38: true,
        56: true, 82: true, 83: true, 84: true
    };

    // Tics at bottom before rising (Lower Lift)
    static LIFT_WAIT_TICS = 105;

    // --- Switches ---

    static SWITCH_SPECIALS = new Set([
        11, 23, 51, 62,
        7, 9, 21, 22, 29, 41, 64, 65, 66, 67, 68, 69, 70, 71, 101, 102, 103, 111, 112, 113
    ]);

    // mode, minOnTime (ms), minOffTime (ms)
    static SWITCH_INTERACTION_BY_SPECIAL = {
        11: ['once', null, null],
        23: ['once', null, null],
        51: ['once', null, null],
        62: ['timed', 1000, 1000]
    };

    // S-type specials that end the level (11 = S1 Exit, 51 = S1 Secret Exit)
    static SWITCH_EXIT_SPECIALS = new Set([11, 51]);

    // --- Linedef flags ---

    static ML_BLOCKING      = 0x01;
    static ML_BLOCKMONSTERS = 0x02;
    static ML_DONTPEGTOP    = 0x08;
    static ML_DONTPEGBOTTOM = 0x10;

    // Doom picture-column format sentinel
    static PATCH_END_COLUMN = 0xFF;

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
