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

    allowsCooperative() {
        return true;
    }

    admitsSubPlayers() {
        return false;
    }

    respawnsDeadPlayers() {
        return false;
    }

    leavesPickedItems() {
        return false;
    }

    allowsFriendlyFire() {
        return false;
    }
}
