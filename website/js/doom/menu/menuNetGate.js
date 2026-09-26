/**
 * The way into every multiplayer flow: its menu entry greys out once the
 * device proves unable to play, pressing it then explains why, and a missing
 * nickname is asked for before the flow goes on.
 */
class MenuNetGate {
    /**
     * @param {HTMLElement}                    item
     * @param {function(): Promise<string|null>} unavailableReason - DoomNetAvailability.unavailableReason
     */
    static greyWhenUnavailable(item, unavailableReason) {
        unavailableReason().then((reason) => {
            if (reason !== null) {
                item.classList.add('doom-menu-item-disabled');
            }
        });
    }

    /**
     * @param {MenuDisplay}                    display
     * @param {function(): Promise<string|null>} unavailableReason
     * @param {function(string)}               onReady           - receives the nickname
     */
    static async enter(display, unavailableReason, onReady) {
        const reason = await unavailableReason();
        if (reason !== null) {
            MenuNetMessages.showUnavailable(display, reason);
            return;
        }
        MenuNicknamePrompt.ensure(display, onReady);
    }
}
