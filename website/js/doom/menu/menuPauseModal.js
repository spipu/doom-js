/**
 * Pause modal, shown by the game over its own frozen frame (transparent
 * MenuDisplay + the translucent modal overlay). Title "{wad} — Episode {n}",
 * three navigable entries (resume / options / leave the level) and no bottom
 * button: Backspace and the gamepad back button resume,
 * the Escape toggle stays driven by the game loop — and closes everything,
 * the stacked options modal included. The title is rebuilt through its
 * provider whenever the options modal closes (the language may have changed).
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
     * @param {function} titleProvider returns the (translated) modal title
     */
    show(titleProvider) {
        this._titleProvider = titleProvider ?? this._titleProvider;

        const {modal} = this._createShell(this._titleProvider(), 'doom-menu-modal', 'doom-menu-subtitle');
        const listEl  = MenuDom.addElement(modal, 'div', 'doom-menu-list');

        this._nav.addItemIn(listEl, appTranslator.get('game.pause.resume'), () => this._resume());
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

    _quit() {
        if (this._onQuit !== null) {
            this._onQuit();
        }
    }
}
