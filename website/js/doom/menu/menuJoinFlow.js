/**
 * Joining a main's game, from the WAD list or from a WAD's Multiplayer screen:
 * the stored WAD the main plays is found from its invite, never picked by the
 * player. Pairs with the main — its code read, the answer shown — then shows
 * the lobby until the main's game sends its level, built on that WAD.
 */
class MenuJoinFlow {
    /**
     * @param {MenuNavigator}       navigator
     * @param {MenuDisplay}         display
     * @param {DoomNetLinks}        links
     * @param {DoomNetAvailability} availability
     */
    constructor(navigator, display, links, availability) {
        this._navigator    = navigator;
        this._display      = display;
        this._links        = links;
        this._availability = availability;
    }

    greyWhenUnavailable(item) {
        MenuNetGate.greyWhenUnavailable(item, () => this._availability.unavailableReason());

        return this;
    }

    start() {
        MenuNetGate.enter(this._display, () => this._availability.unavailableReason(), async (nickname) => {
            const wads = await this._navigator.getIdentifiedWads();
            this._pair(new DoomNetSubSession(this._links, wads, nickname));
        });
    }

    _pair(session) {
        new MenuPairingModal(this._display).openForSub(session, () => this._showLobby(session), () => session.dispose());
    }

    _showLobby(session) {
        const lobby = new MenuLobbyModal(this._display);
        session.setOnEnd((reason) => {
            lobby.close();
            MenuNetMessages.showEnd(this._display, reason);
        });
        session.setCycle({
            levelLoad: (level) => {
                lobby.setOnClose(null).close();
                this._navigator.joinSharedGame(session.getWad(), session, level);
            }
        });
        lobby.openSub(session, {leave: () => session.leave()});
    }
}
