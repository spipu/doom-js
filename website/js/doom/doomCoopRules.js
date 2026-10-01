/**
 * The rules of a cooperative game: every sub plays its own player, a dead
 * player respawns by pressing use, the weapons and keys picked up stay on the
 * ground, the multiplayer things appear from the next level built, and
 * friendly fire is the one chosen on the game settings screen when the game
 * opened.
 */
class DoomCoopRules extends DoomGameRules {
    /**
     * @param {{friendlyFire: boolean}} options - the game settings, as the subs get them
     */
    constructor(options) {
        super();
        this._options = options;
    }

    /**
     * @returns {DoomCoopRules} the rules on the game settings as stored now, the preset of a new game
     */
    static fromSettings() {
        return new DoomCoopRules({friendlyFire: doomSettings.getMultiplayerFriendlyFire()});
    }

    getOptions() {
        return this._options;
    }

    thingFilter() {
        return {multiplayer: true, deathmatch: false, monsters: true};
    }

    spawnsAtDeathmatchStarts() {
        return false;
    }

    givesAllKeys() {
        return false;
    }

    sessionStopCodes() {
        return {label: 'multiplayer.pause.stopCoop', confirm: 'multiplayer.pause.stopCoopConfirm'};
    }

    // A dead player respawns by pressing use: no death menu.
    opensDeathMenu() {
        return false;
    }

    allowsSaveAndLoad() {
        return true;
    }

    allowsCheatFullKit() {
        return true;
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

    leavesPickedItems() {
        return true;
    }

    allowsFriendlyFire() {
        return (this._options.friendlyFire === true);
    }

    scoresFrags() {
        return false;
    }

    showsOtherPlayersOnMap() {
        return true;
    }

    respawnsItems() {
        return false;
    }

    givesDeathmatchWeaponAmmo() {
        return false;
    }

    fragLimit() {
        return null;
    }

    timeLimitMs() {
        return null;
    }

    holdsLevelStart() {
        return false;
    }

    endsWhenAlone() {
        return false;
    }

    endOfGameReason() {
        return DoomNetProtocol.END_GAME_OVER;
    }
}

DoomCoopRules.MODE = DoomNetProtocol.MODE_COOPERATIVE;
// The settings the game settings screen lists for a cooperative game.
DoomCoopRules.SETTING_KEYS = ['multiplayer.friendly_fire'];
