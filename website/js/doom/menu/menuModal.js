/**
 * Confirmation modal displayed above the menu screens, in the Spipu-Doom style.
 */
class MenuModal {
    /**
     * @param {MenuDisplay} display
     */
    constructor(display) {
        this._display = display;
        this._overlay = null;
        this._nav     = null;
    }

    /**
     * @param {string}   message
     * @param {function} onConfirm
     * @param {string}   confirmLabel
     * @param {string}   cancelLabel
     */
    confirm(message, onConfirm, confirmLabel = null, cancelLabel = null) {
        confirmLabel = (confirmLabel ?? appTranslator.get('menu.confirm'));
        cancelLabel  = (cancelLabel ?? appTranslator.get('menu.cancel'));

        const {modal} = this._createShell(message, 'doom-menu-modal', 'doom-menu-modal-message');

        const actions = MenuDom.addElement(modal, 'div', 'doom-menu-modal-actions');

        const cancelButton = MenuDom.addButton(actions, 'doom-menu-button doom-menu-button-secondary', cancelLabel, () => {
            this.close();
        });

        const confirmButton = MenuDom.addButton(actions, 'doom-menu-button', confirmLabel, () => {
            this.close();
            onConfirm();
        });

        // Confirm preselected (the user just asked for the action); every
        // back input plays the cancel button.
        this._attachButtonsNav([cancelButton, confirmButton], cancelButton, 1);
        this._dismissOnOverlayClick(() => this.close());

        return this;
    }

    /**
     * Loading modal: pulsing message, without buttons and not closable by
     * clicking. Closed programmatically via close().
     *
     * @param {string} message
     */
    showLoading(message) {
        this._createShell(message, 'doom-menu-modal',
            'doom-menu-modal-message doom-menu-modal-loading');

        return this;
    }

    /**
     * Information modal: a message and a single "Back" button (e.g. saving is
     * refused while the player is dead). The overlay click dismisses it too.
     *
     * @param {string}        message
     * @param {function|null} onClose
     */
    info(message, onClose = null) {
        const {modal} = this._createShell(message, 'doom-menu-modal', 'doom-menu-modal-message');

        const actions = MenuDom.addElement(modal, 'div', 'doom-menu-modal-actions');
        const dismiss = () => {
            this.close();
            if (onClose !== null) {
                onClose();
            }
        };

        const button = MenuDom.addButton(actions, 'doom-menu-button', appTranslator.get('menu.back'), dismiss);
        this._attachButtonsNav([button], button, 0);
        this._dismissOnOverlayClick(dismiss);

        return this;
    }

    /**
     * Error modal: a prominent centred message plus an optional technical detail
     * (e.g. the top of a stack trace) and a single dismiss button. Used when
     * level generation fails, so the cause is visible on screen and not only in
     * the console.
     *
     * @param {string}      message
     * @param {string|null} detail
     * @param {function}    onClose
     */
    showError(message, detail, onClose) {
        const {modal} = this._createShell(message, 'doom-menu-modal doom-menu-modal-wide', 'doom-menu-modal-message doom-menu-modal-error');

        if (detail) {
            MenuDom.addText(modal, 'doom-menu-modal-detail', detail);
        }

        const actions = MenuDom.addElement(modal, 'div', 'doom-menu-modal-actions');

        const button = MenuDom.addButton(actions, 'doom-menu-button', appTranslator.get('menu.close'), () => {
            this.close();
            onClose();
        });
        this._attachButtonsNav([button], button, 0);

        return this;
    }

    /**
     * End-of-level tally: the level's closing sentence as a title, one line per
     * score (label on the left, value on the right) and a single full-width
     * button. Not dismissable by clicking outside — the player has to press it.
     *
     * @param {string}   title
     * @param {object[]} lines  - [{label, value}], value already formatted
     * @param {string}   label  - button label
     * @param {function} action
     */
    tally(title, lines, label, action) {
        const {modal} = this._createShell(title, 'doom-menu-modal doom-menu-modal-tally', 'doom-menu-modal-message');

        const body = MenuDom.addElement(modal, 'div', 'doom-menu-tally');
        for (const line of lines) {
            const row = MenuDom.addElement(body, 'div', 'doom-menu-tally-line');
            MenuDom.addText(row, 'doom-menu-tally-label', line.label);
            MenuDom.addText(row, 'doom-menu-tally-value', line.value);
        }

        const actions = MenuDom.addElement(modal, 'div', 'doom-menu-modal-actions');
        const button = MenuDom.addButton(actions, 'doom-menu-button doom-menu-button-block', label, () => {
            this.close();
            action();
        });
        this._attachButtonsNav([button], button, 0);

        return this;
    }

    /**
     * Story text of the end of a chapter (or of the game), shown after the
     * tally. The text IS the message of the shell — no title, the tally just
     * announced the end of the level. Like the tally, it waits for its button.
     *
     * @param {string}   text
     * @param {string}   label  - button label
     * @param {function} action
     */
    finale(text, label, action) {
        const {modal} = this._createShell(text, 'doom-menu-modal doom-menu-modal-finale', 'doom-menu-finale');

        const actions = MenuDom.addElement(modal, 'div', 'doom-menu-modal-actions');
        const button = MenuDom.addButton(actions, 'doom-menu-button doom-menu-button-block', label, () => {
            this.close();
            action();
        });
        this._attachButtonsNav([button], button, 0);

        return this;
    }

    close() {
        if (this._nav !== null) {
            this._nav.detach().clear();
        }
        if (this._overlay !== null) {
            this._overlay.remove();
            this._overlay = null;
        }

        return this;
    }

    // --- Internal ---

    // Overlays stack in the display container: only the top-most one may
    // react to inputs (a nested confirmation suspends the modal beneath it).
    _isTopOverlay() {
        if (this._overlay === null) {
            return false;
        }

        return MenuDom.isTopOverlay(this._display.getContainer(), this._overlay);
    }

    _dismissOnOverlayClick(action) {
        this._overlay.addEventListener('click', (event) => {
            if (event.target === this._overlay) {
                action();
            }
        });
    }

    // Horizontal navigation over a buttons row (Left/Right + hover select,
    // Enter/pad-validate clicks, every back input plays backButton).
    _attachButtonsNav(buttons, backButton, selected) {
        this._nav = new MenuListNavigation(() => backButton.click(), () => !this._isTopOverlay())
            .setEscapeAsBack(true)
            .setHorizontal(true);
        for (const button of buttons) {
            this._nav.addButtonItem(button);
        }
        this._nav.attach().selectIndex(selected);
    }

    // Fresh overlay + modal + message shell, shared by every modal flavour.
    _createShell(message, modalClass, messageClass) {
        this.close();

        this._overlay = MenuDom.addElement(this._display.getContainer(), 'div', 'doom-menu-overlay');
        const modal = MenuDom.addElement(this._overlay, 'div', modalClass);
        const messageEl = MenuDom.addText(modal, messageClass, message);

        return {modal: modal, messageEl: messageEl};
    }
}
