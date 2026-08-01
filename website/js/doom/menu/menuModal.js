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

        MenuDom.addButton(actions, 'doom-menu-button doom-menu-button-secondary', cancelLabel, () => {
            this.close();
        });

        MenuDom.addButton(actions, 'doom-menu-button', confirmLabel, () => {
            this.close();
            onConfirm();
        });

        this._overlay.addEventListener('click', (event) => {
            if (event.target === this._overlay) {
                this.close();
            }
        });

        return this;
    }

    /**
     * Loading modal: pulsing message, without buttons and not closable by
     * clicking. Closed programmatically via close().
     *
     * @param {string} message
     */
    showLoading(message) {
        return this._showText(message, true);
    }

    /**
     * Simple message modal: without buttons and not closable by clicking.
     * Closed programmatically via close().
     *
     * @param {string} message
     */
    showMessage(message) {
        return this._showText(message, false);
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

        MenuDom.addButton(actions, 'doom-menu-button', appTranslator.get('menu.close'), () => {
            this.close();
            onClose();
        });

        return this;
    }

    close() {
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
        const overlays = this._display.getContainer().querySelectorAll('.doom-menu-overlay');

        return (overlays[overlays.length - 1] === this._overlay);
    }

    _showText(message, pulsing) {
        this._createShell(message, 'doom-menu-modal',
            'doom-menu-modal-message ' + ((pulsing) ? 'doom-menu-modal-loading' : 'doom-menu-modal-static'));

        return this;
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
