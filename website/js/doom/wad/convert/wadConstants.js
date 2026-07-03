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
    // (4 W1 / 86, 90 WR, 109 W1 fast). Only OPEN-type doors (the builder raises
    // a panel); CLOSE-type doors (3, 16, 42, 50, 75, 76, 107, 110…) are out of
    // scope until a descending-panel build exists.
    static DOOR_SPECIALS = new Set([1, 2, 4, 26, 27, 28, 29, 31, 32, 33, 34, 61, 63, 86, 90, 103, 109, 117, 118]);

    // Speed in Doom units/tic (vanilla p_doors.c): VDOORSPEED = 2 for every
    // door — including the manual open-stay 31-34 and the SR 63 — except the
    // blazing ones (109, 117, 118) at VDOORSPEED*4 = 8.
    static DOOR_SPEED_BY_SPECIAL = {
        1: 2, 2: 2, 3: 2, 4: 2, 26: 2, 27: 2, 28: 2, 29: 2,
        42: 2, 50: 2, 61: 2, 86: 2, 90: 2, 103: 2,
        31: 2, 32: 2, 33: 2, 34: 2, 63: 2,
        109: 8, 117: 8, 118: 8
    };

    // Tics before auto-close (~4.3 s)
    static DOOR_WAIT_TICS = 150;

    // Trigger type per door special ('action' = press E, 'proximity' = walk,
    // 'none' = opened only by a remote switch — see WadSwitchBuilder)
    static DOOR_TRIGGER_BY_SPECIAL = {
        1: 'action', 26: 'action', 27: 'action', 28: 'action',
        31: 'action', 32: 'action', 33: 'action', 34: 'action',
        63: 'action', 117: 'action', 118: 'action',
        2: 'proximity', 4: 'proximity', 86: 'proximity', 90: 'proximity',
        109: 'proximity',
        29: 'none', 61: 'none', 103: 'none'
    };

    static DOOR_LOOP_BY_SPECIAL = {
        1: false, 26: false, 27: false, 28: false, 63: false, 117: false,
        2: false, 31: false, 32: false, 33: false, 34: false, 118: false
    };

    // One-way open-stay doors are ALWAYS onlyOnce, even with a repeatable
    // trigger (SR 61, WR 86): a finished one-way anim restarted would snap the
    // door shut and replay the opening — in vanilla re-triggering an open door
    // is a visual no-op. The repeatable part lives on the switch/zone.
    static DOOR_ONLY_ONCE_BY_SPECIAL = {
        2: true, 31: true, 32: true, 33: true, 34: true, 118: true,
        1: false, 26: false, 27: false, 28: false, 63: false, 117: false,
        103: true, 29: true, 109: true,
        4: true,
        61: true, 86: true, 90: false
    };

    // 4 (W1) and 90 (WR) = EV_DoDoor(normal): open-wait-CLOSE (round-trip),
    // unlike the open-stay 86 (EV_DoDoor(open), one-way).
    static DOOR_ANIM_BY_SPECIAL = {
        2: 'one-way', 31: 'one-way', 32: 'one-way', 33: 'one-way', 34: 'one-way', 118: 'one-way',
        1: 'round-trip', 26: 'round-trip', 27: 'round-trip', 28: 'round-trip',
        63: 'round-trip', 117: 'round-trip',
        29: 'round-trip',
        61: 'one-way', 103: 'one-way', 86: 'one-way',
        4: 'round-trip', 90: 'round-trip',
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

    // Vanilla speeds: plats (62/88 = PLATSPEED*4, blaze 120-123 = PLATSPEED*8),
    // floor lowers = FLOORSPEED = 1 (p_floor.c), turboLower (36/71) =
    // FLOORSPEED*4 = 4.
    static LIFT_SPEED_BY_SPECIAL = {
        62: 4, 88: 4,
        19: 1, 23: 1, 38: 1, 82: 1, 83: 1,
        36: 4, 37: 1, 84: 1,
        120: 8, 121: 8, 122: 8, 123: 8,
        71: 4, 102: 1
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

    // Floors that move UP once toward a target (one-way). Unlike the lifts
    // above, the static floor is NOT patched down: the moving top-flat sits at
    // the WAD floor height and rises. All are driven by a walk-trigger zone or
    // a switch (trigger 'none' on the instance). G1/GR gun variants (24, 47)
    // are not handled (they need weapon fire).
    static FLOOR_MOVE_UP_SPECIALS = new Set([
        5, 18, 20, 22, 56, 58, 59, 64, 65, 66, 67, 68, 69,
        91, 92, 93, 101, 119, 128, 129, 130, 131
    ]);

    // Target rule per special (vanilla p_floor.c EV_DoFloor / p_plats.c
    // EV_DoPlat). A number = fixed delta in Doom units above the current floor;
    // 'lowestCeiling' = P_FindLowestCeilingSurrounding clamped to the sector's
    // own ceiling ('lowestCeilingCrush' = same minus 8, raiseFloorCrush);
    // 'nextHigher' = P_FindNextHighestFloor (smallest neighbour floor strictly
    // above the current one; no candidate = no movement).
    static FLOOR_UP_TARGET_BY_SPECIAL = {
        5: 'lowestCeiling', 91: 'lowestCeiling', 101: 'lowestCeiling', 64: 'lowestCeiling',
        56: 'lowestCeilingCrush', 65: 'lowestCeilingCrush',
        119: 'nextHigher', 18: 'nextHigher', 69: 'nextHigher', 128: 'nextHigher',
        130: 'nextHigher', 131: 'nextHigher', 129: 'nextHigher',
        20: 'nextHigher', 22: 'nextHigher', 68: 'nextHigher',
        58: 24, 92: 24, 59: 24, 93: 24, 66: 24,
        67: 32
    };

    // Speed in Doom units/tic (vanilla): FLOORSPEED = 1, raiseFloorTurbo = 4,
    // the EV_DoPlat raise-and-change variants = PLATSPEED/2 = 0.5.
    static FLOOR_UP_SPEED_BY_SPECIAL = {
        129: 4, 130: 4, 131: 4,
        20: 0.5, 22: 0.5, 66: 0.5, 67: 0.5, 68: 0.5
    };
    static FLOOR_UP_DEFAULT_SPEED = 1;

    // Deliberate deviation from vanilla (which starts the raise instantly):
    // a rising floor waits this long before moving, so a player who fired the
    // trigger next to the platform has time to step onto it and ride up.
    static FLOOR_UP_START_DELAY_S = 1.0;

    // --- Stairs (build stairs, EV_BuildStairs) ---

    // A stair special raises a CHAIN of sectors: the tagged base sector rises by
    // one step, then each adjacent sector sharing a two-sided line AND the same
    // floor flat rises to the running cumulated height (base_fh + i*step). Each
    // step is modelled as an independent one-way rising floor (WadStairBuilder);
    // they all start() together — the staggered arrival (different travel) gives
    // the staircase ripple, no native animation loop needed.
    // 7 = S1 +8, 8 = W1 +8, 100 = W1 +16 turbo, 127 = S1 +16 turbo.
    static STAIR_SPECIALS        = new Set([7, 8, 100, 127]);
    static STAIR_SWITCH_SPECIALS = new Set([7, 127]);   // S1 → driven by a switch
    static STAIR_WALK_SPECIALS   = new Set([8, 100]);   // W1 → driven by a walk-zone

    // Step height (Doom units) added per stair sector.
    static STAIR_STEP_BY_SPECIAL  = {7: 8, 8: 8, 100: 16, 127: 16};

    // Speed in Doom units/tic (vanilla EV_BuildStairs): build8 (7/8) =
    // FLOORSPEED/4 = 0.25, turbo16 (100/127) = FLOORSPEED*4 = 4.
    static STAIR_SPEED_BY_SPECIAL = {7: 0.25, 8: 0.25, 100: 4, 127: 4};

    // --- Switches ---

    // NB: 22 is W1 (raiseToNearestAndChange, P_CrossSpecialLine) — a walk
    // trigger, NOT a switch (it must not appear here).
    static SWITCH_SPECIALS = new Set([
        11, 23, 51, 61, 62, 122, 123,
        7, 9, 21, 29, 41, 64, 65, 66, 67, 68, 69, 70, 71, 101, 102, 103, 111, 112, 113,
        127,
        18, 20, 131
    ]);

    // mode, minOnTime (ms), minOffTime (ms). S1 = 'once' (default), SR = 'timed'
    // (vanilla P_ChangeSwitchTexture(line, 1) = re-usable button).
    static SWITCH_INTERACTION_BY_SPECIAL = {
        11: ['once', null, null],
        23: ['once', null, null],
        51: ['once', null, null],
        62: ['timed', 1000, 1000],
        122: ['once', null, null],
        123: ['timed', 1000, 1000],
        61: ['timed', 1000, 1000], 63: ['timed', 1000, 1000],
        70: ['timed', 1000, 1000],
        64: ['timed', 1000, 1000], 65: ['timed', 1000, 1000],
        66: ['timed', 1000, 1000], 67: ['timed', 1000, 1000],
        68: ['timed', 1000, 1000], 69: ['timed', 1000, 1000]
    };

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
        19, 36, 37, 38, 82, 83, 84, 88, 120, 121,
        5, 22, 56, 58, 59, 119, 130, 91, 92, 93, 128, 129
    ]);

    // W1 (once) vs WR (repeatable) — carried by the zone instance's onlyOnce.
    // Includes the tagged WALK door specials (2/109 = W1, 86/90 = WR) routed
    // through the same zone mechanism (see _identifyWalkTriggers).
    static WALK_TRIGGER_ONCE_BY_SPECIAL = {
        88: false, 120: false,
        121: true,
        19: true, 36: true, 37: true, 38: true,
        82: false, 83: false, 84: false,
        2: true, 4: true, 109: true, 86: false, 90: false,
        5: true, 22: true, 56: true, 58: true, 59: true, 119: true, 130: true,
        91: false, 92: false, 93: false, 128: false, 129: false
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
        gravity:         9.81,
        maxJumpVelocity: 3.5,
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
