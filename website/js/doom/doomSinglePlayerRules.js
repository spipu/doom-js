class DoomSinglePlayerRules extends DoomGameRules {
    thingFilter() {
        return {multiplayer: false, deathmatch: false, monsters: true};
    }

    spawnsAtDeathmatchStarts() {
        return false;
    }

    givesAllKeys() {
        return false;
    }

    // The only session a single player game hosts is the screen sharing.
    sessionStopCodes() {
        return {label: 'multiplayer.pause.stop', confirm: 'multiplayer.pause.stopConfirm'};
    }

    opensDeathMenu() {
        return true;
    }

    allowsSaveAndLoad() {
        return true;
    }

    allowsLevelRestart() {
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
