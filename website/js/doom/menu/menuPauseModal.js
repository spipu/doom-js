/**
 * Pause modal, shown by the game over its own frozen frame. Title
 * "{wad} — Episode {n}", navigable entries (resume / load / save / options /
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

        this._onResume = null;
    }

    /**
     * @param {function} callback
     */
    setOnResume(callback) {
        this._onResume = callback;

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
        this._openStacked('options', new MenuOptionsModal(this._display)).show();
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
