/**
 * The explicit messages of the multiplayer flows, shared by the main's pause
 * menu and the sub's screens: why this device cannot play, and why a session
 * ended.
 */
class MenuNetMessages {
    /**
     * @param {MenuDisplay} display
     * @param {string}      reason  - DoomNetAvailability.NO_*
     */
    static showUnavailable(display, reason) {
        doomSound.playUi('menu/invalid');
        new MenuModal(display).info(appTranslator.get(MenuNetMessages.UNAVAILABLE[reason]));
    }

    /**
     * @param {MenuDisplay}   display
     * @param {string}        reason  - DoomNetProtocol.END_*
     * @param {function|null} onClose
     */
    static showEnd(display, reason, onClose = null) {
        new MenuModal(display).info(appTranslator.get(MenuNetMessages.ENDS[reason] ?? MenuNetMessages.ENDS[DoomNetProtocol.END_LOST]), onClose);
    }

    static showNoIdentity(display) {
        doomSound.playUi('menu/invalid');
        new MenuModal(display).info(appTranslator.get('multiplayer.error.identity'));
    }
}

MenuNetMessages.UNAVAILABLE = {
    [DoomNetAvailability.NO_WEBGL]:  'multiplayer.unavailable.webgl',
    [DoomNetAvailability.NO_CAMERA]: 'multiplayer.unavailable.camera'
};
MenuNetMessages.ENDS = {
    [DoomNetProtocol.END_STOPPED]:   'multiplayer.end.stopped',
    [DoomNetProtocol.END_REMOVED]:   'multiplayer.end.removed',
    [DoomNetProtocol.END_TIMEOUT]:   'multiplayer.end.timeout',
    [DoomNetProtocol.END_LOST]:      'multiplayer.end.lost',
    [DoomNetProtocol.END_GAME_OVER]: 'multiplayer.end.gameOver'
};
