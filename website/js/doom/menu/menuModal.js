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
     */
    confirm(message, onConfirm) {
        this.close();

        this._overlay = document.createElement('div');
        this._overlay.className = 'doom-menu-overlay';
        this._display.getContainer().appendChild(this._overlay);

        const modal = document.createElement('div');
        modal.className = 'doom-menu-modal';
        this._overlay.appendChild(modal);

        const messageEl = document.createElement('div');
        messageEl.className = 'doom-menu-modal-message';
        messageEl.textContent = message;
        modal.appendChild(messageEl);

        const actions = document.createElement('div');
        actions.className = 'doom-menu-modal-actions';
        modal.appendChild(actions);

        this._addButton(actions, 'Annuler', 'doom-menu-button doom-menu-button-secondary', () => {
            this.close();
        });

        this._addButton(actions, 'Confirmer', 'doom-menu-button', () => {
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

    close() {
        if (this._overlay !== null) {
            this._overlay.remove();
            this._overlay = null;
        }

        return this;
    }

    // --- Internal ---

    _showText(message, pulsing) {
        this.close();

        this._overlay = document.createElement('div');
        this._overlay.className = 'doom-menu-overlay';
        this._display.getContainer().appendChild(this._overlay);

        const modal = document.createElement('div');
        modal.className = 'doom-menu-modal';
        this._overlay.appendChild(modal);

        const messageEl = document.createElement('div');
        messageEl.className = 'doom-menu-modal-message '
            + ((pulsing) ? 'doom-menu-modal-loading' : 'doom-menu-modal-static');
        messageEl.textContent = message;
        modal.appendChild(messageEl);

        return this;
    }

    _addButton(parent, label, className, onClick) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = className;
        button.textContent = label;
        button.addEventListener('click', onClick);
        parent.appendChild(button);

        return button;
    }
}
