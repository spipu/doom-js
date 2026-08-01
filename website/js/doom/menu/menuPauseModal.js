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
class MenuPauseModal extends MenuModal {
    /**
     * @param {MenuDisplay} display
     */
    constructor(display) {
        super(display);

        this._nav           = new MenuListNavigation(() => this._resume(), () => !this._isTopOverlay());
        this._onResume      = null;
        this._onQuit        = null;
        this._titleProvider = null;
        this._optionsModal  = null;
        this._saveContext   = null;
        this._slotsModal    = null;
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

    close() {
        if (this._optionsModal !== null) {
            this._optionsModal.setOnClose(null).close();
            this._optionsModal = null;
        }
        if (this._slotsModal !== null) {
            this._slotsModal.setOnClose(null).close();
            this._slotsModal = null;
        }
        this._nav.detach().clear();
        super.close();

        return this;
    }

    // --- Internal ---

    _resume() {
        if (this._onResume !== null) {
            this._onResume();
        }
    }

    // Stacked over this modal, whose navigation goes silent until it closes
    // (top-most overlay rule); the pause modal is then fully re-rendered — a
    // language change must reach its title and entries.
    _openOptions() {
        this._optionsModal = new MenuOptionsModal(this._display)
            .setOnClose(() => {
                this._optionsModal = null;
                this.show();
            })
            .show();
    }

    // The save entry stays visible while dead, but only opens an information
    // modal: a save taken there would be a trap slot.
    _trySave() {
        if (this._saveContext.canSave() !== true) {
            new MenuModal(this._display).info(appTranslator.get('menu.save.deadInfo'));
            return;
        }
        this._openSlots(MenuSaveSlotsModal.MODE_SAVE);
    }

    // Save slots stacked like the options modal; loading a slot replaces the
    // running game (the game closes this modal on its way out). show() is
    // async (it reads the slots): the modal is kept BEFORE calling it, so
    // close() always holds the modal and never a promise.
    _openSlots(mode) {
        this._slotsModal = new MenuSaveSlotsModal(this._display)
            .setMode(mode)
            .setWad(this._saveContext.wadMeta)
            .setSaveContext(this._saveContext)
            .setOnLoad((saveMeta) => this._saveContext.onLoad(saveMeta))
            .setOnClose(() => {
                this._slotsModal = null;
                this.show();
            });
        this._slotsModal.show();
    }

    _quit() {
        if (this._onQuit !== null) {
            this._onQuit();
        }
    }
}
