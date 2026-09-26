class DoomSinglePlayerRules extends DoomGameRules {
    spawnsMultiplayerThings() {
        return false;
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

    allowsFriendlyFire() {
        return false;
    }
}
