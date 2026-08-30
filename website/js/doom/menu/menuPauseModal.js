/**
 * Pause modal, shown by the game over its own frozen frame (transparent
 * MenuDisplay + the translucent modal overlay). Title "{wad} — Episode {n}",
 * navigable entries (resume / load / save / options / leave the level) and no
 * bottom button: Backspace and the gamepad back button resume,
 * the Escape toggle stays driven by the game loop — and closes everything,
 * the stacked options or save-slots modal included. The title is rebuilt
 * through its provider whenever a stacked modal closes (the language may have
 * changed).
 */
class MenuPauseModal extends AbstractMenuListModal {
    /**
     * @param {MenuDisplay} display
     */
    constructor(display) {
        super(display);

        // The game loop owns the Escape key at the pause root (its toggle).
        this._nav.setEscapeAsBack(false);
        this._onResume      = null;
        this._onQuit        = null;
        this._titleProvider = null;
        this._saveContext   = null;
        this._stacked       = {options: null, slots: null};
    }

    /**
     * @param {function} callback
     */
    setOnResume(callback) {
        this._onResume = callback;

        return this;
    }

    /**
     * @param {function} callback
     */
    setOnQuit(callback) {
        this._onQuit = callback;

        return this;
    }

    /**
     * Save/load wiring provided by the running game: {wadMeta, buildMeta(slot),
     * capture(), canSave(), onLoad(saveMeta)}. Null (direct test shortcut
     * without stored WAD metadata) hides both entries.
     *
     * @param {object|null} context
     */
    setSaveContext(context) {
        this._saveContext = context;

        return this;
    }

    /**
     * @param {function} titleProvider returns the (translated) modal title
     */
    show(titleProvider) {
        this._titleProvider = titleProvider ?? this._titleProvider;

        const {modal} = this._createShell(this._titleProvider(), 'doom-menu-modal', 'doom-menu-subtitle');
        const listEl  = MenuDom.addElement(modal, 'div', 'doom-menu-list');

        this._nav.addItemIn(listEl, appTranslator.get('game.pause.resume'), () => this._resume());
        if (this._saveContext !== null) {
            this._nav.addItemIn(listEl, appTranslator.get('menu.game.load'), () => this._openSlots(MenuSaveSlotsModal.MODE_LOAD));
            this._nav.addItemIn(listEl, appTranslator.get('game.pause.save'), () => this._trySave());
        }
        this._nav.addItemIn(listEl, appTranslator.get('menu.game.options'), () => this._openOptions());
        this._nav.addItemIn(listEl, appTranslator.get('game.pause.quit'), () => this._quit());

        this._nav.attach();
        this._nav.selectFirst();

        return this;
    }

    _teardown() {
        for (const key of Object.keys(this._stacked)) {
            if (this._stacked[key] !== null) {
                this._stacked[key].setOnClose(null).close();
                this._stacked[key] = null;
            }
        }
    }

    // Stacked child modal, silenced by the top-overlay rule until it closes;
    // the pause is then fully re-rendered — a language change must reach its
    // title and entries.
    _openStacked(key, modal) {
        this._stacked[key] = modal.setOnClose(() => {
            this._stacked[key] = null;
            this.show();
        });

        return modal;
    }

    // The game's Escape toggle only leaves the pause from its root: a stacked
    // modal handles Escape itself (one step back).
    isAtRoot() {
        return this._isTopOverlay();
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
        this._openSlots(MenuSaveSlotsModal.MODE_SAVE);
    }

    // Loading a slot replaces the running game (the game closes this modal on
    // its way out). show() is async (it reads the slots): the modal is memoed
    // BEFORE calling it, so close() always holds the modal, never a promise.
    _openSlots(mode) {
        this._openStacked('slots', new MenuSaveSlotsModal(this._display)
            .setMode(mode)
            .setWad(this._saveContext.wadMeta)
            .setSaveContext(this._saveContext)
            .setOnLoad((saveMeta) => this._saveContext.onLoad(saveMeta)))
            .show();
    }

    _quit() {
        if (this._onQuit !== null) {
            this._onQuit();
        }
    }
}
