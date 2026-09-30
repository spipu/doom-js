/**
 * Pause modal, shown by the game over its own frozen frame. Title
 * "{wad} — Episode {n}", navigable entries (resume / load / save / the
 * session entries / options / leave, labelled by the game) and no bottom
 * button: Backspace and the gamepad back button resume, the Escape toggle
 * stays driven by the game loop — and closes everything, the stacked options,
 * save-slots, settings or lobby modal included.
 *
 * Session entries: share screen and cooperative outside a session; the lobby,
 * cooperative and stop sharing while the screen is shared; the lobby and stop
 * cooperative in a cooperative game.
 */
class MenuPauseModal extends AbstractGameMenuModal {
    /**
     * @param {MenuDisplay} display
     */
    constructor(display) {
        super(display);

        this._onResume       = null;
        this._sessionContext = null;
        this._quitCode       = 'game.pause.quit';
    }

    setOnResume(callback) {
        this._onResume = callback;

        return this;
    }

    // The translation code of the leave entry: a sub leaves the screen sharing, not the level.
    setQuitCode(code) {
        this._quitCode = code;

        return this;
    }

    /**
     * Session wiring provided by the running game: {getSession(),
     * offersScreenSharing(), offersCooperative() — read at each render, the
     * mode changing under the pause —, openScreenSharing(nickname) and
     * openCooperative(nickname) → the session, null without a WAD identity,
     * switchToCooperative(), stop(), unavailableReason() → Promise}. Null when
     * the game (no stored WAD metadata, a sub) hosts no session.
     *
     * @param {object|null} context
     */
    setSessionContext(context) {
        this._sessionContext = context;

        return this;
    }

    // The game's Escape toggle only leaves the pause from its root: a stacked
    // modal handles Escape itself (one step back).
    isAtRoot() {
        return this._isTopOverlay();
    }

    _addEntries(listEl) {
        this._nav.addItemIn(listEl, appTranslator.get('game.pause.resume'), () => this._resume());
        if (this._saveContext !== null) {
            this._nav.addItemIn(listEl, appTranslator.get('menu.game.load'), () => this._openSlots(MenuSaveSlotsModal.MODE_LOAD));
            this._nav.addItemIn(listEl, appTranslator.get('game.pause.save'), () => this._trySave());
        }
        this._addSessionEntries(listEl);
        this._nav.addItemIn(listEl, appTranslator.get('menu.game.options'), () => this._openOptions());
        this._nav.addItemIn(listEl, appTranslator.get(this._quitCode), () => this._quit());
    }

    _onBack() {
        this._resume();
    }

    // --- Internal ---

    _resume() {
        if (this._onResume !== null) {
            this._onResume();
        }
    }

    _openOptions() {
        this._openStacked('options', new MenuOptionsModal(this._display).setInGame(true).setRendererLocked(this._inSession())).show();
    }

    // --- Sessions ---

    _session() {
        return ((this._sessionContext !== null) ? this._sessionContext.getSession() : null);
    }

    _inSession() {
        return (this._session() !== null);
    }

    _addSessionEntries(listEl) {
        if (this._sessionContext === null) {
            return;
        }
        const session = this._session();
        if (session === null) {
            this._addOpeningEntries(listEl);
            return;
        }
        this._nav.addItemIn(listEl, appTranslator.get('multiplayer.pause.lobby'), () => this._openLobby());
        if (session.getMode() === DoomNetProtocol.MODE_COOPERATIVE) {
            this._nav.addItemIn(listEl, appTranslator.get('multiplayer.pause.stopCoop'),
                () => this._confirmStop('multiplayer.pause.stopCoopConfirm'));
            return;
        }
        this._nav.addItemIn(listEl, appTranslator.get('multiplayer.pause.cooperative'), () => this._switchToCooperative());
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
            const coop = this._nav.addItemIn(listEl, appTranslator.get('multiplayer.pause.cooperative'),
                () => this._openGameSettings((nickname) => this._sessionContext.openCooperative(nickname)));
            MenuNetGate.greyWhenUnavailable(coop, unavailableReason);
        }
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

    // Start resumes the game: the session starts with it.
    _openLobby() {
        const session = this._session();
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

    // The save entry stays visible while dead, but only opens an information
    // modal: a save taken there would be a trap slot.
    _trySave() {
        if (this._saveContext.canSave() !== true) {
            doomSound.playUi('menu/invalid');
            new MenuModal(this._display).info(appTranslator.get('menu.save.deadInfo'));
            return;
        }
        this._openSlots(MenuSaveSlotsModal.MODE_SAVE, () => this._resume());
    }
}
