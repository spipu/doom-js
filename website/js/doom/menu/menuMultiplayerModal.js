/**
 * Multiplayer sub-menu of the main's pause, its entries following the session
 * state at each render: switch to cooperative, share screen and the
 * multiplayer options outside a session; the lobby, switch to cooperative,
 * stop sharing and the options while the screen is shared; the lobby, the
 * stop entry of the mode and the options in a game the subs play. Its back button,
 * Backspace, Escape and the gamepad back button return to the pause.
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
        if (!DoomNetProtocol.subsPlayOwnPlayers(session.getMode())) {
            this._nav.addItemIn(listEl, appTranslator.get('multiplayer.pause.switchToCooperative'), () => this._switchToCooperative());
        }
        const stopCodes = this._sessionContext.stopCodes();
        this._nav.addItemIn(listEl, appTranslator.get(stopCodes.label), () => this._confirmStop(stopCodes.confirm));
    }

    _addOpeningEntries(listEl) {
        const unavailableReason = this._sessionContext.unavailableReason;
        if (this._sessionContext.offersCooperative()) {
            const coop = this._nav.addItemIn(listEl, appTranslator.get('multiplayer.pause.switchToCooperative'),
                () => this._openGameSettings((nickname) => this._sessionContext.openCooperative(nickname)));
            MenuNetGate.greyWhenUnavailable(coop, unavailableReason);
        }
        if (this._sessionContext.offersScreenSharing()) {
            const share = this._nav.addItemIn(listEl, appTranslator.get('multiplayer.pause.share'),
                () => this._open((nickname) => this._sessionContext.openScreenSharing(nickname)));
            MenuNetGate.greyWhenUnavailable(share, unavailableReason);
        }
    }

    // What is changed here presets the next game: the running one keeps its settings.
    _openOptions() {
        this._openStacked('options', new MenuOptionsModal(this._display)).showMultiplayer();
    }

    // The game settings of the mode first, then the session opens on them.
    _openGameSettings(openSession) {
        MenuNetGate.enter(this._display, this._sessionContext.unavailableReason, (nickname) => {
            this._openCoopSettings(() => this._openWith(openSession, nickname));
        });
    }

    _openCoopSettings(onContinue) {
        this._openStacked('settings', new MenuOptionsModal(this._display)).showGameSettings(DoomCoopRules.SETTING_KEYS, onContinue);
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
        this._openCoopSettings(() => {
            this._sessionContext.switchToCooperative();
            this._openLobby();
        });
    }

    _openLobby() {
        this._openStacked('lobby', new MenuLobbyModal(this._display)).openMain(this._sessionContext.getSession(), {
            start: () => this._resume(),
            back:  null
        });
    }

    _confirmStop(messageCode) {
        this._confirm(appTranslator.get(messageCode), () => {
            if (this._sessionContext.stop()) {
                this.show();
            }
        });
    }

    _resume() {
        if (this._onResume !== null) {
            this._onResume();
        }
    }
}
