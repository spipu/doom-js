/**
 * Confirmation modal displayed above the menu screens, in the SpipuDoom style.
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
     * Loading modal: same box as confirm(), without buttons and not closable
     * by clicking. Closed programmatically via close().
     *
     * @param {string} message
     */
    showLoading(message) {
        this.close();

        this._overlay = document.createElement('div');
        this._overlay.className = 'doom-menu-overlay';
        this._display.getContainer().appendChild(this._overlay);

        const modal = document.createElement('div');
        modal.className = 'doom-menu-modal';
        this._overlay.appendChild(modal);

        const messageEl = document.createElement('div');
        messageEl.className = 'doom-menu-modal-message doom-menu-modal-loading';
        messageEl.textContent = message;
        modal.appendChild(messageEl);

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
