/**
 * The questions whose answer depends on the game mode, one implementation per
 * mode: DoomGame and the systems ask the rules, never test the mode.
 */
class DoomGameRules {
    /**
     * The rules a session's mode plays by, on a device that only follows it.
     *
     * @param {int}    mode    - DoomNetProtocol.MODE_*
     * @param {object} options - the game settings the session carries
     * @returns {DoomGameRules}
     */
    static forMode(mode, options) {
        if (mode === DoomCoopRules.MODE) {
            return new DoomCoopRules(options);
        }
        if (mode === DoomDeathmatchRules.MODE) {
            return new DoomDeathmatchRules(options);
        }

        return new DoomSinglePlayerRules();
    }

    /**
     * Which things of the map the level is built with; every device builds
     * with the same filter, so it travels with the level.
     *
     * @returns {{multiplayer: boolean, deathmatch: boolean, monsters: boolean}}
     *          multiplayer: the MTF_NOT_SINGLE things spawn; deathmatch: the
     *          NOTDMATCH things (keys) do not; monsters: the monsters spawn
     */
    thingFilter() {
        throw new Error('DoomGameRules: thingFilter not implemented');
    }

    // Whether the players enter and respawn on the map's deathmatch starts.
    spawnsAtDeathmatchStarts() {
        throw new Error('DoomGameRules: spawnsAtDeathmatchStarts not implemented');
    }

    // Whether every player gets every key each time it spawns (P_SpawnPlayer in deathmatch).
    givesAllKeys() {
        throw new Error('DoomGameRules: givesAllKeys not implemented');
    }

    /**
     * @returns {{label: string, confirm: string}} the translation codes of the
     *          main's pause entry that stops the session these rules play, and
     *          of its confirmation
     */
    sessionStopCodes() {
        throw new Error('DoomGameRules: sessionStopCodes not implemented');
    }

    opensDeathMenu() {
        throw new Error('DoomGameRules: opensDeathMenu not implemented');
    }

    allowsSaveAndLoad() {
        throw new Error('DoomGameRules: allowsSaveAndLoad not implemented');
    }

    allowsCheatFullKit() {
        throw new Error('DoomGameRules: allowsCheatFullKit not implemented');
    }

    // Whether the main's pause menu offers to share its screen.
    allowsScreenSharing() {
        throw new Error('DoomGameRules: allowsScreenSharing not implemented');
    }

    // Whether the main's pause menu offers to open the game to cooperative players.
    allowsCooperative() {
        throw new Error('DoomGameRules: allowsCooperative not implemented');
    }

    // Whether the subs of the session play their own player, or only watch the main's.
    admitsSubPlayers() {
        throw new Error('DoomGameRules: admitsSubPlayers not implemented');
    }

    // Whether a dead player comes back by pressing use (instead of the death menu).
    respawnsDeadPlayers() {
        throw new Error('DoomGameRules: respawnsDeadPlayers not implemented');
    }

    // Whether the weapons and keys a player picks up stay on the ground for the others.
    leavesPickedItems() {
        throw new Error('DoomGameRules: leavesPickedItems not implemented');
    }

    // Whether a player's attack hurts the other players (its own blast always hurts itself).
    allowsFriendlyFire() {
        throw new Error('DoomGameRules: allowsFriendlyFire not implemented');
    }

    // Whether the HUD scores the frags (in place of the kills and secrets).
    scoresFrags() {
        throw new Error('DoomGameRules: scoresFrags not implemented');
    }

    // Whether the automap draws the other players.
    showsOtherPlayersOnMap() {
        throw new Error('DoomGameRules: showsOtherPlayersOnMap not implemented');
    }

    // Whether a map item taken comes back after a while (deathmatch 2, P_RespawnSpecials).
    respawnsItems() {
        throw new Error('DoomGameRules: respawnsItems not implemented');
    }

    // Whether a weapon left on the ground gives the deathmatch ammo of the profile (P_GiveWeapon).
    givesDeathmatchWeaponAmmo() {
        throw new Error('DoomGameRules: givesDeathmatchWeaponAmmo not implemented');
    }

    // The frag score that ends the level for the player reaching it, null for none.
    fragLimit() {
        throw new Error('DoomGameRules: fragLimit not implemented');
    }

    // The simulated time that ends the level (ms), null for none.
    timeLimitMs() {
        throw new Error('DoomGameRules: timeLimitMs not implemented');
    }

    // Whether the main waits, at a level start, for every sub to have built the level.
    holdsLevelStart() {
        throw new Error('DoomGameRules: holdsLevelStart not implemented');
    }

    // Whether the main's game ends once every sub of a started session has gone.
    endsWhenAlone() {
        throw new Error('DoomGameRules: endsWhenAlone not implemented');
    }

    // The DoomNetProtocol.END_* the subs are told when the main's game is over.
    endOfGameReason() {
        throw new Error('DoomGameRules: endOfGameReason not implemented');
    }
}
