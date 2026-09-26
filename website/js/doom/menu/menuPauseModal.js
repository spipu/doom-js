/**
 * Pause modal, shown by the game over its own frozen frame. Title
 * "{wad} — Episode {n}", navigable entries (resume / load / save / share
 * screen — or the lobby and stop sharing during a session — / options /
 * leave the level) and no bottom button: Backspace and the gamepad back
 * button resume, the Escape toggle stays driven by the game loop — and closes
 * everything, the stacked options or save-slots modal included.
 */
class MenuPauseModal extends AbstractGameMenuModal {
    /**
     * @param {MenuDisplay} display
     */
    constructor(display) {
        super(display);

        this._onResume     = null;
        this._shareContext = null;
    }

    setOnResume(callback) {
        this._onResume = callback;

        return this;
    }

    /**
     * Screen sharing wiring provided by the running game: {getSession(),
     * openSession(nickname) → the session, null without a WAD identity,
     * stop(), unavailableReason() → Promise}. Null when the mode or the game
     * (no stored WAD metadata) offers no sharing.
     *
     * @param {object|null} context
     */
    setShareContext(context) {
        this._shareContext = context;

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
        this._addShareEntries(listEl);
        this._nav.addItemIn(listEl, appTranslator.get('menu.game.options'), () => this._openOptions());
        this._nav.addItemIn(listEl, appTranslator.get('game.pause.quit'), () => this._quit());
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
        this._openStacked('options', new MenuOptionsModal(this._display).setInGame(true).setRendererLocked(this._isSharing())).show();
    }

    // --- Screen sharing ---

    _isSharing() {
        return ((this._shareContext !== null) && (this._shareContext.getSession() !== null));
    }

    _addShareEntries(listEl) {
        if (this._shareContext === null) {
            return;
        }
        if (this._isSharing()) {
            this._nav.addItemIn(listEl, appTranslator.get('multiplayer.pause.lobby'), () => this._openLobby());
            this._nav.addItemIn(listEl, appTranslator.get('multiplayer.pause.stop'), () => this._confirmStop());
            return;
        }
        const share = this._nav.addItemIn(listEl, appTranslator.get('multiplayer.pause.share'), () => this._share());
        MenuNetGate.greyWhenUnavailable(share, this._shareContext.unavailableReason);
    }

    _share() {
        MenuNetGate.enter(this._display, this._shareContext.unavailableReason, (nickname) => {
            if (this._shareContext.openSession(nickname) === null) {
                MenuNetMessages.showNoIdentity(this._display);
                return;
            }
            this._openLobby();
        });
    }

    // Start resumes the game: the session starts with it.
    _openLobby() {
        const session = this._shareContext.getSession();
        this._openStacked('lobby', new MenuLobbyModal(this._display)).openMain(session, {
            addPlayer: () => new MenuPairingModal(this._display).openForMain(session),
            start:     () => this._resume()
        });
    }

    _confirmStop() {
        this._confirm(appTranslator.get('multiplayer.pause.stopConfirm'), () => {
            this._shareContext.stop();
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
