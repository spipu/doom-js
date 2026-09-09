/**
 * Base of the modals the game shows over its own level (pause, death): the
 * transparent MenuDisplay plus the translucent modal overlay, a title
 * rebuilt through its provider whenever a stacked child closes (the language
 * may have changed), the game's save/load context feeding the stacked slots
 * modal, and the quit entry. Escape stays with the game loop.
 */
class AbstractGameMenuModal extends AbstractMenuListModal {
    /**
     * @param {MenuDisplay} display
     */
    constructor(display) {
        super(display);

        this._nav.setEscapeAsBack(false);
        this._onQuit        = null;
        this._titleProvider = null;
        this._saveContext   = null;
        this._stacked       = {};
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
     * without stored WAD metadata) hides the save and load entries.
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
        this._addEntries(listEl);

        this._nav.attach();
        this._nav.selectFirst();

        return this;
    }

    // The entries of the concrete modal, in display order.
    _addEntries(listEl) {
        throw new Error('AbstractGameMenuModal._addEntries must be implemented');
    }

    _teardown() {
        for (const key of Object.keys(this._stacked)) {
            this._stacked[key].setOnClose(null).close();
            delete this._stacked[key];
        }
    }

    // Stacked child modal, silenced by the top-overlay rule until it closes;
    // this modal is then fully re-rendered — a language change must reach
    // its title and entries.
    _openStacked(key, modal) {
        this._stacked[key] = modal.setOnClose(() => {
            delete this._stacked[key];
            this.show();
        });

        return modal;
    }

    // Loading a slot replaces the running game (the game closes this modal on
    // its way out) and a written save resumes it. show() is async (it reads
    // the slots): the modal is memoed BEFORE calling it, so close() always
    // holds the modal, never a promise.
    _openSlots(mode, onSaved = null) {
        this._openStacked('slots', new MenuSaveSlotsModal(this._display)
            .setMode(mode)
            .setWad(this._saveContext.wadMeta)
            .setSaveContext(this._saveContext)
            .setOnLoad((saveMeta) => this._saveContext.onLoad(saveMeta))
            .setOnSaved(onSaved))
            .show();
    }

    _quit() {
        if (this._onQuit !== null) {
            this._onQuit();
        }
    }
}
