/**
 * Base class of the menu screens, displayed inside the MenuDisplay virtual screen.
 *
 * Every screen shares the same skeleton (title, panel, subtitle, selectable
 * list, status, back button) and the same selection model on its list items,
 * provided by MenuListNavigation (mouse hover, keyboard and gamepad all drive
 * one single highlighted entry).
 */

class AbstractMenuScreen {
    /**
     * @param {MenuNavigator} navigator
     * @param {MenuDisplay}   display
     */
    constructor(navigator, display) {
        this._navigator   = navigator;
        this._display     = display;
        this._container   = null;
        this._statusEl    = null;
        this._footerEl    = null;
        this._footerTimer = null;
        this._nav         = new MenuListNavigation(() => this._onBack(), () => this._navBlocked())
            .setEscapeAsBack(true);
    }

    show() {
        if (this._container !== null) {
            this.hide();
        }

        this._container = document.createElement('div');
        this._container.className = 'doom-menu';
        this._display.getContainer().appendChild(this._container);

        this._build();
        this._addFooter();
        this._nav.attach();

        return this;
    }

    hide() {
        this._nav.detach().clear();
        if (this._footerTimer !== null) {
            clearInterval(this._footerTimer);
            this._footerTimer = null;
        }
        this._footerEl = null;
        if (this._container !== null) {
            this._container.remove();
            this._container = null;
            this._statusEl = null;
        }

        return this;
    }

    _build() {
        throw new Error('AbstractMenuScreen._build must be implemented');
    }

    // Screens with a parent screen override this to navigate back
    // (Backspace key / gamepad button 1); the root screens ignore it.
    _onBack() {
    }

    // Navigation is suspended while a modal overlay is open.
    _navBlocked() {
        if (this._container === null) {
            return true;
        }
        const displayContainer = this._display.getContainer();
        if (displayContainer === null) {
            return true;
        }

        return MenuDom.hasOverlay(displayContainer);
    }

    // --- Shared skeleton ---

    // Standard skeleton of every screen: title, panel, subtitle and the empty
    // selectable list.
    _buildPanel(subtitleText) {
        this._addTitle('Spipu-Doom');

        const panel = this._addElement('div', 'doom-menu-panel');
        MenuDom.addText(panel, 'doom-menu-subtitle', subtitleText);

        return {panel: panel, listEl: this._addElement('div', 'doom-menu-list', panel)};
    }

    _buildWadPanel(wadMeta, subtitleLabel) {
        return this._buildPanel(this._wadTitle(wadMeta) + ' — ' + subtitleLabel);
    }

    _wadTitle(meta) {
        return WadRegistry.displayTitle(meta);
    }

    _addStatus(panel) {
        this._statusEl = this._addElement('div', 'doom-menu-status', panel);

        return this._statusEl;
    }

    // Right-aligned actions row with the standard back button; the label may
    // be overridden (the WAD menu reads "Quit {wad}" on the same button).
    // Registered as the navigation's bottom target: Down past the list lands
    // on it, and every back input plays it (press feedback included).
    _addBackButton(panel, label = null) {
        const actions = this._addElement('div', 'doom-menu-actions', panel);
        const button  = this._addButton((label ?? appTranslator.get('menu.back')), () => {
            this._onBack();
        }, actions);
        this._nav.setBottomButton(button);

        return button;
    }

    // --- Selectable list ---

    _addListItem(listEl, labelText, onActivate) {
        return this._nav.addItemIn(listEl, labelText, onActivate);
    }

    // Secondary line of a list item (size, date, skill number...).
    _addListItemInfos(item, text) {
        return MenuDom.addText(item, 'doom-menu-item-infos', text);
    }

    _addListEmpty(listEl, text) {
        return MenuDom.addText(listEl, 'doom-menu-empty', text);
    }

    _openAbout() {
        this._openModal(new MenuOptionsModal(this._display)).showAbout();
    }

    _openHelp() {
        this._openModal(new MenuOptionsModal(this._display)).showHelp();
    }

    _clearList(listEl) {
        listEl.innerHTML = '';
        this._nav.clear();
    }

    // --- Footer (version + webapp stats + copyright, on every screen) ---

    _addFooter() {
        this._footerEl = this._addElement('div', 'doom-menu-footer');
        this._refreshFooter();
        appBootstrap.askStats();
        this._footerTimer = setInterval(() => this._refreshFooter(), 1000);
    }

    _refreshFooter() {
        if (this._footerEl === null) {
            return;
        }
        this._footerEl.textContent = appBootstrap.getVersion()
            + ' — ' + appBootstrap.getStatsText()
            + ' — © ' + new Date().getFullYear() + ' Spipu';
    }

    // --- DOM helpers (MenuDom wrappers defaulting to the screen container) ---

    _addElement(tagName, className, parent = null) {
        return MenuDom.addElement(parent ?? this._container, tagName, className);
    }

    _addTitle(text, parent = null) {
        return MenuDom.addText(parent ?? this._container, 'doom-menu-title', text);
    }

    _addButton(label, onClick, parent = null) {
        return MenuDom.addButton(parent ?? this._container, 'doom-menu-button', label, onClick);
    }

    _confirm(message, onConfirm) {
        return new MenuModal(this._display).confirm(message, onConfirm);
    }

    // Opens a modal over this screen, re-rendered on close: a setting changed
    // under the modal (language, units…) must reach the covered screen.
    _openModal(modal) {
        return modal.setOnClose(() => this.show());
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

    // An error outside the WadError set is a genuine bug: it shows its raw
    // English message, which is what a report needs.
    _showError(error) {
        const codes = {
            'fetch-offline':       'error.fetchOffline',
            'fetch-blocked':       'error.fetchBlocked',
            'fetch-http':          'error.fetchHttp',
            'fetch-failed':        'error.fetchFailed',
            'invalid-format':      'error.invalidFormat',
            'quota-exceeded':      'error.quotaExceeded',
            'storage-unavailable': 'error.storageUnavailable',
            'not-found':           'error.notFound'
        };

        const code = ((error instanceof WadError) ? error.getCode() : null);
        if (codes[code] === undefined) {
            this._setError(appTranslator.get('error.generic', {message: error.message}));
            return;
        }
        const detail = error.getDetail();
        this._setError(appTranslator.get(codes[code]) + ((detail !== null) ? ' (' + detail + ')' : ''));
    }

}
