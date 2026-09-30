/**
 * Multiplayer sub-menu of the main's pause, its entries following the session
 * state at each render: share screen, cooperative and the multiplayer options
 * outside a session; the lobby, cooperative, stop sharing and the options
 * while the screen is shared; the lobby, stop cooperative and the options in a
 * cooperative game. Its back button, Backspace, Escape and the gamepad back
 * button return to the pause.
 */
class MenuMultiplayerModal extends AbstractGameMenuModal {
    /**
     * @param {MenuDisplay} display
     * @param {object}      sessionContext - see MenuPauseModal.setSessionContext
     */
    constructor(display, sessionContext) {
        super(display);

        this._nav.setEscapeAsBack(true);
        this._sessionContext = sessionContext;
        this._onResume       = null;
    }

    // The lobby's start resumes the game: the session starts with it.
    setOnResume(callback) {
        this._onResume = callback;

        return this;
    }

    // Escape goes through the back button like every stacked modal: its press
    // feedback keeps this modal on top while the game reads the pause toggle.
    show() {
        const {bodyEl} = this._openShell(appTranslator.get('multiplayer.pause.menu'), appTranslator.get('menu.back'));
        this._addEntries(MenuDom.addElement(bodyEl, 'div', 'doom-menu-list'));
        this._nav.selectFirst();

        return this;
    }

    _addEntries(listEl) {
        const session = this._sessionContext.getSession();
        if (session === null) {
            this._addOpeningEntries(listEl);
        } else {
            this._addSessionEntries(listEl, session);
        }
        this._nav.addItemIn(listEl, appTranslator.get('multiplayer.options'), () => this._openOptions());
    }

    _addSessionEntries(listEl, session) {
        this._nav.addItemIn(listEl, appTranslator.get('multiplayer.pause.lobby'), () => this._openLobby());
        if (session.getMode() === DoomNetProtocol.MODE_COOPERATIVE) {
            this._nav.addItemIn(listEl, appTranslator.get('multiplayer.pause.stopCoop'),
                () => this._confirmStop('multiplayer.pause.stopCoopConfirm'));
            return;
        }
        this._nav.addItemIn(listEl, appTranslator.get('multiplayer.cooperative'), () => this._switchToCooperative());
        this._nav.addItemIn(listEl, appTranslator.get('multiplayer.pause.stop'), () => this._confirmStop('multiplayer.pause.stopConfirm'));
    }

    _addOpeningEntries(listEl) {
        const unavailableReason = this._sessionContext.unavailableReason;
        if (this._sessionContext.offersScreenSharing()) {
            const share = this._nav.addItemIn(listEl, appTranslator.get('multiplayer.pause.share'),
                () => this._open((nickname) => this._sessionContext.openScreenSharing(nickname)));
            MenuNetGate.greyWhenUnavailable(share, unavailableReason);
        }
        if (this._sessionContext.offersCooperative()) {
            const coop = this._nav.addItemIn(listEl, appTranslator.get('multiplayer.cooperative'),
                () => this._openGameSettings((nickname) => this._sessionContext.openCooperative(nickname)));
            MenuNetGate.greyWhenUnavailable(coop, unavailableReason);
        }
    }

    // What is changed here presets the next game: the running one keeps its settings.
    _openOptions() {
        this._openStacked('options', new MenuOptionsModal(this._display)).showMultiplayer();
    }

    // The game settings of the mode first, then the session opens on them.
    _openGameSettings(openSession) {
        MenuNetGate.enter(this._display, this._sessionContext.unavailableReason, (nickname) => {
            this._openStacked('settings', new MenuOptionsModal(this._display))
                .showGameSettings(DoomCoopRules.SETTING_KEYS, () => this._openWith(openSession, nickname));
        });
    }

    _open(openSession) {
        MenuNetGate.enter(this._display, this._sessionContext.unavailableReason, (nickname) => this._openWith(openSession, nickname));
    }

    _openWith(openSession, nickname) {
        if (openSession(nickname) === null) {
            MenuNetMessages.showNoIdentity(this._display);
            return;
        }
        this._openLobby();
    }

    // The viewers become players on the settings chosen: no new pairing.
    _switchToCooperative() {
        this._openStacked('settings', new MenuOptionsModal(this._display)).showGameSettings(DoomCoopRules.SETTING_KEYS, () => {
            this._sessionContext.switchToCooperative();
            this._openLobby();
        });
    }

    _openLobby() {
        const session = this._sessionContext.getSession();
        this._openStacked('lobby', new MenuLobbyModal(this._display)).openMain(session, {
            addPlayer: () => new MenuPairingModal(this._display).openForMain(session),
            start:     () => this._resume()
        });
    }

    _confirmStop(messageCode) {
        this._confirm(appTranslator.get(messageCode), () => {
            this._sessionContext.stop();
            this.show();
        });
    }

    _resume() {
        if (this._onResume !== null) {
            this._onResume();
        }
    }
}
