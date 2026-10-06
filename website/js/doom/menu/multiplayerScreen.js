/**
 * Multiplayer screen of a WAD, above its options: start a new cooperative
 * game or deathmatch, join a game, and a shortcut to the multiplayer options.
 * A new game asks for the nickname if there is none and checks the WAD's
 * identity first, then goes on to the episodes; joining is the MenuJoinFlow
 * of the WAD list, whatever WAD the main plays.
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
        this._join         = new MenuJoinFlow(navigator, display, this._links, this._availability);
    }

    setWad(meta) {
        this._wadMeta = meta;

        return this;
    }

    _build() {
        const {panel, listEl} = this._buildWadPanel(this._wadMeta, appTranslator.get('help.multiplayer'));

        const coop       = this._addNewGameItem(listEl, 'multiplayer.newCooperative', DoomCoopRules);
        const deathmatch = this._addNewGameItem(listEl, 'multiplayer.newDeathmatch', DoomDeathmatchRules);
        const join       = this._addListItem(listEl, appTranslator.get('multiplayer.join'), () => this._join.start());
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

    // Availability and nickname, then the WAD's identity, before a new game.
    _afterChecks(onReady) {
        MenuNetGate.enter(this._display, () => this._availability.unavailableReason(), async (nickname) => {
            if ((await this._navigator.ensureWadIdentity(this._wadMeta)) === null) {
                MenuNetMessages.showNoIdentity(this._display);
                return;
            }
            onReady(nickname);
        });
    }
}
