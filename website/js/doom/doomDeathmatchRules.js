/**
 * The rules of a deathmatch: every sub plays its own player, every attack
 * hurts every other player, the players enter and respawn on the deathmatch
 * starts with every key, the keys of the map are left out, the monsters are
 * there as the game settings say, and nothing is saved, loaded or cheated.
 */
class DoomDeathmatchRules extends DoomGameRules {
    /**
     * @param {{monsters: boolean, fragLimit: int|null, timeLimit: int|null, items: string}} options
     *        - the game settings, as the subs get them (time limit in minutes,
     *          items a DoomSettings.DEATHMATCH_* code)
     */
    constructor(options) {
        super();
        this._options = options;
    }

    /**
     * @returns {DoomDeathmatchRules} the rules on the game settings as stored now, the preset of a new game
     */
    static fromSettings() {
        return new DoomDeathmatchRules({
            monsters:  doomSettings.getMultiplayerDeathmatchMonsters(),
            fragLimit: doomSettings.getMultiplayerFragLimit(),
            timeLimit: doomSettings.getMultiplayerTimeLimit(),
            items:     doomSettings.getMultiplayerDeathmatchItems()
        });
    }

    getOptions() {
        return this._options;
    }

    thingFilter() {
        return {multiplayer: true, deathmatch: true, monsters: (this._options.monsters === true)};
    }

    spawnsAtDeathmatchStarts() {
        return true;
    }

    givesAllKeys() {
        return true;
    }

    sessionStopCodes() {
        return {label: 'multiplayer.pause.stopDeathmatch', confirm: 'multiplayer.pause.stopDeathmatchConfirm'};
    }

    // A dead player respawns by pressing use: no death menu.
    opensDeathMenu() {
        return false;
    }

    allowsSaveAndLoad() {
        return false;
    }

    allowsLevelRestart() {
        return false;
    }

    allowsCheatFullKit() {
        return false;
    }

    allowsScreenSharing() {
        return false;
    }

    allowsCooperative() {
        return false;
    }

    admitsSubPlayers() {
        return true;
    }

    respawnsDeadPlayers() {
        return true;
    }

    // "Weapons stay" (deathmatch 1): a placed weapon stays; "items respawn" (deathmatch 2): everything goes, then comes back.
    leavesPickedItems() {
        return (this._options.items === DoomSettings.DEATHMATCH_WEAPONS_STAY);
    }

    allowsFriendlyFire() {
        return true;
    }

    scoresFrags() {
        return true;
    }

    // AM_drawPlayers: in deathmatch a player only sees itself.
    showsOtherPlayersOnMap() {
        return false;
    }

    respawnsItems() {
        return (this._options.items === DoomSettings.DEATHMATCH_ITEMS_RESPAWN);
    }

    givesDeathmatchWeaponAmmo() {
        return true;
    }

    fragLimit() {
        return this._options.fragLimit;
    }

    timeLimitMs() {
        return ((this._options.timeLimit !== null) ? (this._options.timeLimit * DoomDeathmatchRules.MS_PER_MINUTE) : null);
    }

    // The seconds before the subs arrive would be free frags.
    holdsLevelStart() {
        return true;
    }

    endsWhenAlone() {
        return true;
    }

    endOfGameReason() {
        return DoomNetProtocol.END_MATCH_OVER;
    }
}

DoomDeathmatchRules.MODE = DoomNetProtocol.MODE_DEATHMATCH;
// The settings the game settings screen lists for a deathmatch.
DoomDeathmatchRules.SETTING_KEYS = ['multiplayer.dm_monsters', 'multiplayer.frag_limit', 'multiplayer.time_limit', 'multiplayer.dm_items'];
DoomDeathmatchRules.MS_PER_MINUTE = 60000;
