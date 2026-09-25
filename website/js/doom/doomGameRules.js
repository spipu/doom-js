/**
 * The questions whose answer depends on the game mode, one implementation per
 * mode: DoomGame and the systems ask the rules, never test the mode.
 */
class DoomGameRules {
    // MTF_NOT_SINGLE things.
    spawnsMultiplayerThings() {
        throw new Error('DoomGameRules: spawnsMultiplayerThings not implemented');
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
}
