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

    allowsScreenSharing() {
        return true;
    }

    allowsFriendlyFire() {
        return false;
    }
}
