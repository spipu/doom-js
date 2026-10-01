/**
 * Multiplayer screen of a WAD, above its options: start a new cooperative
 * game or deathmatch, join a game, and a shortcut to the multiplayer options.
 * Each flow asks for the nickname if there is none and checks the WAD's
 * identity first. Joining pairs with the main — its code read, the answer
 * shown — and lands in the lobby until the session ends; a new game goes on
 * to the episodes.
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

        const coop       = this._addNewGameItem(listEl, 'multiplayer.newCooperative', DoomCoopRules);
        const deathmatch = this._addNewGameItem(listEl, 'multiplayer.newDeathmatch', DoomDeathmatchRules);
        const join       = this._addListItem(listEl, appTranslator.get('multiplayer.join'),
            () => this._afterChecks((nickname, wadSha256) => this._pair(nickname, wadSha256)));
        this._addListItem(listEl, appTranslator.get('multiplayer.options'), () => {
            this._openModal(new MenuOptionsModal(this._display)).showMultiplayer();
        });
        this._addBackButton(panel);
        this._nav.selectFirst();
        for (const item of [coop, deathmatch, join]) {
            MenuNetGate.greyWhenUnavailable(item, () => this._availability.unavailableReason());
        }
    }

    _addNewGameItem(listEl, labelCode, rules) {
        return this._addListItem(listEl, appTranslator.get(labelCode),
            () => this._afterChecks((nickname) => this._navigator.openSessionEpisodes(this._wadMeta, nickname, rules)));
    }

    _onBack() {
        this._navigator.openWadMenu(this._wadMeta);
    }

    // Availability and nickname, then the WAD's identity, before any session flow.
    _afterChecks(onReady) {
        MenuNetGate.enter(this._display, () => this._availability.unavailableReason(), async (nickname) => {
            const wadSha256 = await this._navigator.ensureWadIdentity(this._wadMeta);
            if (wadSha256 === null) {
                MenuNetMessages.showNoIdentity(this._display);
                return;
            }
            onReady(nickname, wadSha256);
        });
    }

    _pair(nickname, wadSha256) {
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
            playerRemoved: () => {},
            playerAway:    () => {}
        });
        lobby.openSub(session, {leave: () => session.leave()});
    }
}
