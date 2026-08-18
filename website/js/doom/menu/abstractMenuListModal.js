/**
 * Base of the list-carrying modals (options, save slots, pause): one
 * MenuListNavigation wired to the back action and the top-overlay rule, the
 * onClose contract fired on a real close, and the shared wide shell (title,
 * scrollable body, bottom action button joined to the navigation).
 */
class AbstractMenuListModal extends MenuModal {
    /**
     * @param {MenuDisplay} display
     */
    constructor(display) {
        super(display);

        this._nav = new MenuListNavigation(() => this._onBack(), () => this._navBlocked())
            .setEscapeAsBack(true);
        this._onClose = null;
    }

    /**
     * Hook fired once the modal is closed. The screen underneath is NOT
     * rebuilt while the modal covers it, so a setting changed here would
     * leave it stale: its owner re-renders it from here.
     *
     * @param {function|null} callback
     */
    setOnClose(callback) {
        this._onClose = callback;

        return this;
    }

    close() {
        // _createShell() closes a not-yet-opened modal before building the
        // shell: the owner's onClose only makes sense after a real display.
        const wasOpen = (this._overlay !== null);

        this._teardown();
        super.close();

        if (wasOpen && (this._onClose !== null)) {
            this._onClose();
        }

        return this;
    }

    // Wide list shell: subtitle-styled title, scrollable body, bottom actions
    // row whose button is the navigation's bottom target.
    _openShell(title, buttonLabel) {
        const {modal, messageEl} = this._createShell(title,
            'doom-menu-modal doom-menu-modal-wide doom-menu-modal-options', 'doom-menu-subtitle');
        const bodyEl  = MenuDom.addElement(modal, 'div', 'doom-menu-modal-options-body');
        const actions = MenuDom.addElement(modal, 'div', 'doom-menu-modal-actions');
        const button  = MenuDom.addButton(actions, 'doom-menu-button', buttonLabel, () => {
            this._onBack();
        });
        this._nav.setBottomButton(button);
        this._nav.attach();

        return {titleEl: messageEl, bodyEl: bodyEl, button: button};
    }

    // Extra teardown of a subclass (timers, key capture, stacked children).
    _teardown() {
    }

    _onBack() {
        this.close();
    }

    _navBlocked() {
        return !this._isTopOverlay();
    }

    // Nested confirmation stacked above this modal (its overlay suspends our
    // navigation through the top-overlay rule).
    _confirm(message, onConfirm, confirmLabel = null, cancelLabel = null) {
        return new MenuModal(this._display).confirm(message, onConfirm, confirmLabel, cancelLabel);
    }
}
