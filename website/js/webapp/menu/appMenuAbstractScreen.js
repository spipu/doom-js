/**
 * Base class of the menu screens, displayed inside the AppMenuDisplay virtual screen.
 *
 * Every screen shares the same skeleton (the brand in the top-left corner, a
 * footer) and one of two layouts: a list screen (panel with its subtitle,
 * selectable list, status and bottom buttons, plus an optional detail panel on
 * its right), or a simple menu (a centred column of entries under a header,
 * the exit entry last, small links in the bottom-left corner). Both share
 * the same selection model on their entries, provided by AppMenuListNavigation
 * (mouse hover, touch, keyboard and gamepad all drive one single highlighted
 * entry). A project gives its brand (_titleText), may override the footer
 * prefix (_footerPrefix) and builds its screens on top (_build).
 */
class AppMenuAbstractScreen {
    /**
     * @param {AppMenuDisplay} display
     */
    constructor(display) {
        this._display     = display;
        this._container   = null;
        this._statusEl    = null;
        this._footerEl    = null;
        this._footerTimer = null;
        this._nav         = new AppMenuListNavigation(() => this._onBack(), () => this._navBlocked())
            .setEscapeAsBack(true);
    }

    show() {
        if (this._container !== null) {
            this.hide();
        }

        this._container = document.createElement('div');
        this._container.className = 'app-menu-screen';
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
        throw new Error(this.constructor.name + '._build must be implemented');
    }

    _titleText() {
        throw new Error(this.constructor.name + '._titleText must be implemented');
    }

    // Release stage shown before the version in the footer.
    _footerPrefix() {
        return 'beta';
    }

    // Copyright holder shown at the end of the footer.
    _footerOwner() {
        return 'Spipu';
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

        return AppMenuDom.hasOverlay(displayContainer);
    }

    // --- Shared skeleton ---

    // List screen: brand, panel, subtitle and the empty selectable list.
    _buildPanel(subtitleText) {
        this._addTitle(this._titleText());

        const panel      = this._addElement('div', 'app-menu-panel');
        const subtitleEl = AppMenuDom.addText(panel, 'app-menu-subtitle', subtitleText);

        return {panel: panel, subtitleEl: subtitleEl, listEl: this._addElement('div', 'app-menu-list', panel)};
    }

    // Detail panel on the right of a list screen's panel, which then becomes its left column.
    _addDetailPanel() {
        this._container.classList.add('app-menu-screen-detail');

        return this._addElement('div', 'app-menu-detail');
    }

    /**
     * Simple menu: brand, a centred header (title and an optional subtitle line), a centred column of entries.
     *
     * @param {string}      titleText
     * @param {string|null} subtitleText
     */
    _buildSimpleMenu(titleText, subtitleText = null) {
        this._container.classList.add('app-menu-screen-simple');
        this._addTitle(this._titleText());

        const header     = this._addElement('div', 'app-menu-header');
        const titleEl    = AppMenuDom.addText(header, 'app-menu-header-title', titleText);
        const subtitleEl = AppMenuDom.addText(header, 'app-menu-header-subtitle', (subtitleText ?? ''));

        return {titleEl: titleEl, subtitleEl: subtitleEl, listEl: this._addElement('div', 'app-menu-list app-menu-list-simple')};
    }

    /**
     * Small secondary buttons in the bottom-left corner (about, a bug report…): Down past the last entry reaches
     * them, they never take a back input — a back target is set after them (they reset it).
     *
     * @param {{label: string, action: function}[]} links
     */
    _addLinks(links) {
        const row     = this._addElement('div', 'app-menu-links');
        const buttons = links.map((link) => this._addButton(link.label, link.action, row));
        buttons.forEach((button) => button.classList.add('app-menu-button-secondary', 'app-menu-button-small'));
        this._nav.setBottomButtons(buttons, null);

        return buttons;
    }

    /**
     * Buttons of the top-right corner (language, help…), each led by its icon: Up from the first entry reaches
     * them, Left / Right walk them.
     *
     * @param {{icon: string, label: string, action: function}[]} buttons
     */
    _addCornerButtons(buttons) {
        const row      = this._addElement('div', 'app-menu-corner');
        const elements = buttons.map((button) => AppMenuDom.addIconButton(row, 'app-menu-button app-menu-button-secondary app-menu-button-small',
            button.icon, button.label, button.action));
        this._nav.setSideButtons(elements);

        return elements;
    }

    // Full-screen picture behind the screen, dimmed by the theme; null removes it.
    _setBackground(url) {
        let background = this._container.querySelector(':scope > .app-menu-screen-background');
        if (url === null) {
            if (background !== null) {
                background.remove();
            }
            return;
        }
        if (background === null) {
            background = AppMenuDom.addElement(this._container, 'div', 'app-menu-screen-background');
            this._container.insertBefore(background, this._container.firstChild);
        }
        background.style.backgroundImage = 'url("' + url + '")';
    }

    _addStatus(panel) {
        this._statusEl = this._addElement('div', 'app-menu-status', panel);

        return this._statusEl;
    }

    // Registered as the navigation's bottom target: Down past the list lands
    // on it, and every back input plays it.
    _addBackButton(panel, label = null) {
        const actions = this._addElement('div', 'app-menu-actions', panel);
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
        return AppMenuDom.addText(item, 'app-menu-item-infos', text);
    }

    _addListEmpty(listEl, text) {
        return AppMenuDom.addText(listEl, 'app-menu-empty', text);
    }

    _clearList(listEl) {
        listEl.innerHTML = '';
        this._nav.clear();
    }

    // --- Footer (version + webapp stats + copyright, on every screen) ---

    _addFooter() {
        this._footerEl = this._addElement('div', 'app-menu-footer');
        this._refreshFooter();
        appBootstrap.askStats();
        this._footerTimer = setInterval(() => this._refreshFooter(), AppMenuAbstractScreen.FOOTER_REFRESH_MS);
    }

    _refreshFooter() {
        if (this._footerEl === null) {
            return;
        }
        this._footerEl.textContent = this._footerPrefix() + ' ' + appBootstrap.getVersion()
            + ' - ' + appBootstrap.getStatsText((bytes) => AppMenuDom.formatMegabytes(bytes))
            + ' - © ' + new Date().getFullYear() + ' ' + this._footerOwner();
    }

    // --- DOM helpers (AppMenuDom wrappers defaulting to the screen container) ---

    _addElement(tagName, className, parent = null) {
        return AppMenuDom.addElement(parent ?? this._container, tagName, className);
    }

    _addTitle(text, parent = null) {
        return AppMenuDom.addText(parent ?? this._container, 'app-menu-screen-title', text);
    }

    _addButton(label, onClick, parent = null) {
        return AppMenuDom.addButton(parent ?? this._container, 'app-menu-button', label, onClick);
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
        this._statusEl.className = 'app-menu-status';
        this._statusEl.textContent = message;
    }

    _setError(message) {
        if (this._statusEl === null) {
            return;
        }
        this._statusEl.className = 'app-menu-status app-menu-status-error';
        this._statusEl.textContent = message;
    }

    _clearStatus() {
        this._setStatus('');
    }
}

AppMenuAbstractScreen.FOOTER_REFRESH_MS = 1000;
