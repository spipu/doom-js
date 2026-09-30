/**
 * The rules of a cooperative game: every sub plays its own player, the
 * multiplayer things appear from the next level built, and friendly fire is
 * the one chosen on the game settings screen when the game opened.
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
     * @returns {{friendlyFire: boolean}} the game settings as stored now, the preset of a new game
     */
    static optionsFromSettings() {
        return {friendlyFire: doomSettings.getMultiplayerFriendlyFire()};
    }

    getOptions() {
        return this._options;
    }

    spawnsMultiplayerThings() {
        return true;
    }

    opensDeathMenu() {
        return true;
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

    allowsFriendlyFire() {
        return (this._options.friendlyFire === true);
    }
}

// The settings the game settings screen lists for a cooperative game.
DoomCoopRules.SETTING_KEYS = ['multiplayer.friendly_fire'];
