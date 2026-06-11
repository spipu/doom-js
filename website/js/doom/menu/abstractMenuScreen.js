/**
 * Base class of the menu screens, displayed inside the MenuDisplay virtual screen.
 */
class AbstractMenuScreen {
    /**
     * @param {MenuNavigator} navigator
     * @param {MenuDisplay}   display
     */
    constructor(navigator, display) {
        this._navigator = navigator;
        this._display   = display;
        this._container = null;
        this._statusEl  = null;
    }

    show() {
        if (this._container !== null) {
            this.hide();
        }

        this._container = document.createElement('div');
        this._container.className = 'doom-menu';
        this._display.getContainer().appendChild(this._container);

        this._build();

        return this;
    }

    hide() {
        if (this._container !== null) {
            this._container.remove();
            this._container = null;
            this._statusEl = null;
        }

        return this;
    }

    isVisible() {
        return (this._container !== null);
    }

    _build() {
        throw new Error('AbstractMenuScreen._build must be implemented');
    }

    // --- DOM helpers ---

    _addElement(tagName, className, parent = null) {
        const element = document.createElement(tagName);
        element.className = className;
        (parent ?? this._container).appendChild(element);

        return element;
    }

    _addTitle(text, parent = null) {
        const title = this._addElement('div', 'doom-menu-title', parent);
        title.textContent = text;

        return title;
    }

    _addButton(label, onClick, parent = null) {
        const button = this._addElement('button', 'doom-menu-button', parent);
        button.type = 'button';
        button.textContent = label;
        button.addEventListener('click', onClick);

        return button;
    }

    _addList(parent = null) {
        return this._addElement('div', 'doom-menu-list', parent);
    }

    _confirm(message, onConfirm) {
        return new MenuModal(this._display).confirm(message, onConfirm);
    }

    // --- Status / error helpers ---

    _setStatus(message) {
        if (this._statusEl === null) {
            return;
        }
        this._statusEl.className = 'doom-menu-status';
        this._statusEl.textContent = message;
    }

    _setError(message) {
        if (this._statusEl === null) {
            return;
        }
        this._statusEl.className = 'doom-menu-status doom-menu-error';
        this._statusEl.textContent = message;
    }

    _clearStatus() {
        this._setStatus('');
    }

    _showError(error) {
        const messages = {
            'fetch-failed':        'Téléchargement impossible (réseau ou CORS)',
            'invalid-format':      'Ce fichier n\'est pas un WAD valide (IWAD/PWAD attendu)',
            'quota-exceeded':      'Espace de stockage insuffisant — supprimez un WAD',
            'storage-unavailable': 'Stockage navigateur indisponible',
            'not-found':           'WAD introuvable'
        };

        const code = ((error instanceof WadError) ? error.getCode() : null);
        this._setError(messages[code] ?? ('Erreur : ' + error.message));
    }

    // --- Format helpers ---

    _formatSize(bytes) {
        if (bytes >= 1048576) {
            return (bytes / 1048576).toFixed(1) + ' Mo';
        }
        if (bytes >= 1024) {
            return (bytes / 1024).toFixed(1) + ' Ko';
        }

        return bytes + ' o';
    }

    _formatDate(timestamp) {
        const date = new Date(timestamp);

        return date.toLocaleDateString('fr-FR')
            + ' ' + date.toLocaleTimeString('fr-FR', {hour: '2-digit', minute: '2-digit'});
    }
}
