/**
 * Pause modal, shown by the game over its own frozen frame. Title
 * "{wad} — Episode {n}", navigable entries (resume / load / save /
 * multiplayer / options / leave, labelled by the game) and no bottom button:
 * Backspace and the gamepad back button resume, the Escape toggle stays
 * driven by the game loop — and closes everything, the stacked options,
 * save-slots or multiplayer modal included.
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
     * switchToCooperative(), stop() → whether the game goes on, stopCodes() →
     * the label and confirmation codes of the stop entry, unavailableReason()
     * → Promise}. Null when the game (no stored WAD metadata, a sub) hosts no
     * session.
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
        this._addMultiplayerEntry(listEl);
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

    _inSession() {
        return ((this._sessionContext !== null) && (this._sessionContext.getSession() !== null));
    }

    // Only on the main with the WAD metadata, which a session context stands for.
    _addMultiplayerEntry(listEl) {
        if (this._sessionContext === null) {
            return;
        }
        this._nav.addItemIn(listEl, appTranslator.get('multiplayer.pause.menu'), () => this._openMultiplayer());
    }

    _openMultiplayer() {
        this._openStacked('multiplayer', new MenuMultiplayerModal(this._display, this._sessionContext).setOnResume(() => this._resume()))
            .show();
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
