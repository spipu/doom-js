/**
 * Multiplayer screen of a WAD, above its options: join a game, and a shortcut
 * to the multiplayer options. Joining asks for the nickname if there is none,
 * pairs with the main — its code read, the answer shown — and lands in the
 * lobby until the session ends.
 */
class MultiplayerScreen extends AbstractMenuScreen {
    /**
     * @param {MenuNavigator} navigator
     * @param {MenuDisplay}   display
     */
    constructor(navigator, display) {
        super(navigator, display);

        this._wadMeta      = null;
        this._links        = new DoomNetLinks();
        this._availability = new DoomNetAvailability(this._links);
    }

    setWad(meta) {
        this._wadMeta = meta;

        return this;
    }

    _build() {
        const {panel, listEl} = this._buildWadPanel(this._wadMeta, appTranslator.get('help.multiplayer'));
        const join = this._addListItem(listEl, appTranslator.get('multiplayer.join'), () => this._join());
        this._addListItem(listEl, appTranslator.get('multiplayer.options'), () => {
            this._openModal(new MenuOptionsModal(this._display)).showMultiplayer();
        });
        this._addBackButton(panel);
        this._nav.selectFirst();
        MenuNetGate.greyWhenUnavailable(join, () => this._availability.unavailableReason());
    }

    _onBack() {
        this._navigator.openWadMenu(this._wadMeta);
    }

    _join() {
        MenuNetGate.enter(this._display, () => this._availability.unavailableReason(), (nickname) => this._pair(nickname));
    }

    async _pair(nickname) {
        const wadSha256 = await this._navigator.ensureWadIdentity(this._wadMeta);
        if (wadSha256 === null) {
            MenuNetMessages.showNoIdentity(this._display);
            return;
        }
        const session = new DoomNetSubSession(this._links, wadSha256, nickname);
        new MenuPairingModal(this._display).openForSub(session, () => this._showLobby(session));
    }

    // The lobby until the main's game sends its level, which this device then builds.
    _showLobby(session) {
        const lobby = new MenuLobbyModal(this._display);
        session.setOnEnd((reason) => {
            lobby.close();
            MenuNetMessages.showEnd(this._display, reason);
        });
        session.setCycle({
            levelLoad:     (level) => {
                lobby.setOnClose(null).close();
                this._navigator.joinSharedGame(this._wadMeta, session, level);
            },
            state:         () => {},
            waiting:       () => {},
            phase:         () => {},
            modeChanged:   () => {},
            playerRemoved: () => {}
        });
        lobby.openSub(session, {leave: () => session.leave()});
    }
}
