/**
 * Options modal of the menus: show() opens the options root (settings topics,
 * controls, reset), showAbout() and showHelp() open a standalone page. A page
 * stack sharing one MenuListNavigation: entering a topic pushes a page and the
 * title shows the breadcrumb of the stack ("Options > Controls").
 */
class MenuOptionsModal extends AbstractMenuListModal {
    static get DEVICE_REFRESH_MS() {
        return 500;
    }

    // Settings key prefixes of each input mode (DoomSettings definitions).
    static get SETTING_PREFIXES_BY_MODE() {
        return {
            gamepad:        ['pad.'],
            virtualGamepad: ['virtual_pad.'],
            keyboardMouse:  ['mouse.', 'keyboard.']
        };
    }

    // Keys whose layout / code-suffix name does not read well.
    static get KEY_LABELS() {
        return {
            Space: 'key.space'
        };
    }

    /**
     * @param {MenuDisplay} display
     */
    constructor(display) {
        super(display);

        this._titleEl        = null;
        this._bodyEl         = null;
        this._actionButton   = null;
        this._pageStack      = [];
        this._pageTimer      = null;
        this._deviceLineEl   = null;
        this._controlsMode   = null;
        this._captureHandler = null;
        this._restoreIndex   = null;
        this._layoutMap      = null;
        this._mode           = null;
        this._inGame         = false;
    }

    // Over a running game: the multiplayer settings only apply to the next
    // game, so they are not offered there.
    setInGame(inGame) {
        this._inGame = (inGame === true);

        return this;
    }

    show() {
        return this._open('options', 'menu.game.options', () => this._buildRoot());
    }

    showAbout() {
        return this._open('standalone', 'help.about', () => this._buildAbout());
    }

    showHelp() {
        return this._open('standalone', 'help.guide', () => this._buildHelp());
    }

    _open(mode, titleCode, builder) {
        this._mode = mode;
        this._loadLayoutMap();
        const {titleEl, bodyEl, button} = this._openShell('', appTranslator.get('menu.close'));
        this._titleEl      = titleEl;
        this._bodyEl       = bodyEl;
        this._actionButton = button;
        this._pageStack    = [];
        this._pushPage(titleCode, builder);

        return this;
    }

    _teardown() {
        this._stopKeyCapture();
        this._clearPageTimer();
    }

    // --- Page stack ---

    // Also blocked while a key capture is running.
    _navBlocked() {
        return ((this._captureHandler !== null) || !this._isTopOverlay());
    }

    // titleCode, not a resolved label: the breadcrumb is rebuilt from the codes
    // at every render, so a language switch reaches the pages already stacked.
    _pushPage(titleCode, builder, noBack = false) {
        this._pageStack.push({titleCode: titleCode, builder: builder, noBack: (noBack === true)});
        this._renderPage();
    }

    _onBack() {
        if (this._pageStack.length <= 1) {
            this.close();
            return;
        }
        this._pageStack.pop();
        this._renderPage();
    }

    _renderPage() {
        this._clearPageTimer();
        const current = this._pageStack[this._pageStack.length - 1];
        this._titleEl.textContent        = this._pageStack.map((page) => appTranslator.get(page.titleCode)).join(' > ');
        // The options root closes back to the menu it came from: "Back" there too.
        const rootCode                   = ((this._mode === 'standalone') ? 'menu.close' : 'menu.back');
        this._actionButton.textContent   = appTranslator.get(((this._pageStack.length > 1) ? 'menu.back' : rootCode));
        // A capture page cannot be left by any mean but pressing a key.
        this._actionButton.style.display = ((current.noBack === true) ? 'none' : '');
        this._bodyEl.innerHTML           = '';
        this._nav.clear();
        current.builder();
        if (this._restoreIndex !== null) {
            this._nav.selectIndex(this._restoreIndex);
            this._restoreIndex = null;
        }
    }

    _clearPageTimer() {
        if (this._pageTimer !== null) {
            clearInterval(this._pageTimer);
            this._pageTimer = null;
        }
    }

    // --- Pages ---

    _buildRoot() {
        const list = MenuDom.addElement(this._bodyEl, 'div', 'doom-menu-list');
        this._nav.addItemIn(list, appTranslator.get('help.display'), () => this._pushPage('help.display', () => this._buildSettingsPage('display.')));
        this._nav.addItemIn(list, appTranslator.get('help.game'), () => this._pushPage('help.game', () => this._buildSettingsPage('game.')));
        if (!this._inGame) {
            this._nav.addItemIn(list, appTranslator.get('help.multiplayer'), () => this._pushPage('help.multiplayer', () => this._buildSettingsPage('multiplayer.')));
        }
        this._nav.addItemIn(list, appTranslator.get('help.sound'), () => this._pushPage('help.sound', () => this._buildSettingsPage('sound.')));
        this._nav.addItemIn(list, appTranslator.get('help.controls'), () => this._pushPage('help.controls', () => this._buildControls()));
        this._nav.addItemIn(list, appTranslator.get('help.reset'), () => this._confirmReset());
        this._nav.selectFirst();
    }

    // Wipes every saved setting after a confirmation.
    _confirmReset() {
        this._confirm(appTranslator.get('help.resetConfirm'), () => {
            doomSettings.resetAll().applyToInputs(new Inputs()).applyToTranslator(appTranslator);
            doomSound.applyVolumes();
            this._renderPage();
        }, null, appTranslator.get('menu.back'));
    }

    // Lists the settings of the device the game itself would use (Inputs'
    // priority); a device change rebuilds the page.
    _buildControls() {
        const inputs = new Inputs();
        this._controlsMode = inputs.getMode();
        this._deviceLineEl = MenuDom.addText(this._bodyEl, 'doom-menu-modal-line', this._deviceLabel(inputs));

        const list = MenuDom.addElement(this._bodyEl, 'div', 'doom-menu-list');
        for (const prefix of MenuOptionsModal.SETTING_PREFIXES_BY_MODE[this._controlsMode]) {
            for (const definition of doomSettings.getDefinitions(prefix)) {
                this._addSettingItem(list, definition, inputs);
            }
        }
        this._nav.selectFirst();

        this._pageTimer = setInterval(() => {
            if (inputs.getMode() !== this._controlsMode) {
                this._renderPage();
                return;
            }
            this._deviceLineEl.textContent = this._deviceLabel(inputs);
        }, MenuOptionsModal.DEVICE_REFRESH_MS);
    }

    _buildSettingsPage(prefix) {
        const inputs = new Inputs();
        const list   = MenuDom.addElement(this._bodyEl, 'div', 'doom-menu-list');
        for (const definition of doomSettings.getDefinitions(prefix)) {
            this._addSettingItem(list, definition, inputs);
        }
        this._nav.selectFirst();
    }

    _deviceLabel(inputs) {
        const mode = inputs.getMode();
        if (mode === 'virtualGamepad') {
            return appTranslator.get('device.virtualPad');
        }
        if (mode === 'gamepad') {
            return appTranslator.get('device.gamepad', {name: (inputs.getGamepadName() ?? '')}).trim();
        }

        return appTranslator.get('device.keyboardMouse');
    }

    _addSettingItem(listEl, definition, inputs) {
        let valueEl = null;
        const cycles = ((definition.type === 'bool') || (definition.type === 'list'));
        const item   = this._nav.addItemIn(listEl, appTranslator.get(definition.nameCode), () => {
            if (definition.type === 'char') {
                this._startKeyCapture(definition, inputs);
                return;
            }
            if (definition.type === 'text') {
                this._openTextEntry(definition, valueEl);
                return;
            }
            this._stepSettingValue(definition, inputs, valueEl, 1);
        }, (cycles ? (dir) => {
            this._stepSettingValue(definition, inputs, valueEl, dir);
        } : null));
        valueEl = MenuDom.addText(item, 'doom-menu-item-value', this._settingValueText(definition));

        return item;
    }

    // The language rewrites the WHOLE page, so the page is rebuilt instead of
    // patched, keeping the selection.
    _stepSettingValue(definition, inputs, valueEl, dir) {
        const next = ((definition.type === 'bool')
            ? !(doomSettings.get(definition.key) === true)
            : doomSettings.nextListValue(definition, dir));

        doomSettings.set(definition.key, next).applyToInputs(inputs).applyToTranslator(appTranslator);
        doomSound.applyVolumes();

        if (definition.key === 'display.language') {
            this._restoreIndex = this._nav.getSelectedIndex();
            this._renderPage();
            return;
        }
        valueEl.textContent = this._settingValueText(definition);
    }

    // Stacked above the options: the top-overlay rule mutes this modal meanwhile.
    _openTextEntry(definition, valueEl) {
        new MenuTextEntryModal(this._display).open(appTranslator.get(definition.nameCode), definition,
            doomSettings.get(definition.key), (value) => {
                doomSettings.set(definition.key, value);
                valueEl.textContent = this._settingValueText(definition);
            });
    }

    _settingValueText(definition) {
        if (definition.type === 'bool') {
            const valueCode = ((doomSettings.get(definition.key) === true) ? 'value.yes' : 'value.no');

            return appTranslator.get(valueCode);
        }
        if (definition.type === 'list') {
            return doomSettings.getListLabel(definition);
        }
        if (definition.type === 'char') {
            return this._keyLabel(doomSettings.get(definition.key));
        }

        return String(doomSettings.get(definition.key));
    }

    // --- Key binding capture ---

    // A page left only by pressing a key: one key, one action, so the key is
    // unbound elsewhere. Capture phase, so neither the list navigation nor the
    // game shortcuts see the press.
    _startKeyCapture(definition, inputs) {
        const returnIndex = this._nav.getSelectedIndex();
        this._pushPage(definition.nameCode, () => {
            MenuDom.addText(this._bodyEl, 'doom-menu-modal-line',
                appTranslator.get('help.keyCapture', {action: appTranslator.get(definition.nameCode)}));
        }, true);

        this._captureHandler = (event) => {
            // F1-F12 stay with the browser; Escape is the fixed pause key.
            if ((event.code.startsWith('F') && (event.code.length <= 3)) || (event.code === 'Escape')) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            if (event.repeat) {
                return;
            }
            doomSettings.unbindKeyCode(event.code, definition.key);
            doomSettings.set(definition.key, event.code);
            doomSettings.applyToInputs(inputs);
            this._stopKeyCapture();
            this._pageStack.pop();
            this._restoreIndex = returnIndex;
            this._renderPage();
        };
        document.addEventListener('keydown', this._captureHandler, true);
    }

    _stopKeyCapture() {
        if (this._captureHandler !== null) {
            document.removeEventListener('keydown', this._captureHandler, true);
            this._captureHandler = null;
        }
    }

    // Real keyboard layout (code → printed character), Chrome/Edge only.
    _loadLayoutMap() {
        if ((this._layoutMap !== null) || !navigator.keyboard || !navigator.keyboard.getLayoutMap) {
            return;
        }
        navigator.keyboard.getLayoutMap().then((map) => {
            this._layoutMap = map;
        }).catch(() => {
            this._layoutMap = null;
        });
    }

    _keyLabel(code) {
        if ((code === '') || (code === null) || (code === undefined)) {
            return '';
        }
        const labelCode = MenuOptionsModal.KEY_LABELS[code];
        if (labelCode !== undefined) {
            return appTranslator.get(labelCode);
        }
        if ((this._layoutMap !== null) && this._layoutMap.has(code)) {
            return this._layoutMap.get(code).toUpperCase();
        }
        if (code.startsWith('Key')) {
            return code.slice(3);
        }
        if (code.startsWith('Digit')) {
            return code.slice(5);
        }
        if (code.startsWith('Numpad')) {
            return appTranslator.get('key.numpad', {key: code.slice(6)});
        }

        return code;
    }

    _buildHelp() {
        this._addLines(['help.guide.wad', 'help.guide.freedoom'], {
            addFile: appTranslator.get('menu.wad.addFile')
        });
        this._addExternalLink(DoomExternalLinks.FREEDOOM);
        this._addLines(['help.guide.own', 'help.guide.install', 'help.guide.controls'], {
            addUrl: appTranslator.get('menu.wad.addUrl')
        });

        MenuDom.addText(this._bodyEl, 'doom-menu-modal-heading', appTranslator.get('help.about'));
        this._buildAbout();
    }

    _buildAbout() {
        this._addLines(['help.about.what', 'help.about.author', 'help.about.source']);
        this._addExternalLink(DoomExternalLinks.PROJECT);
        this._addLines(['help.about.licence', 'help.about.wads']);
        this._addLines(['help.about.copyright'], {year: new Date().getFullYear()});
    }

    _addLines(codes, params = {}) {
        for (const code of codes) {
            MenuDom.addText(this._bodyEl, 'doom-menu-modal-line', appTranslator.get(code, params));
        }
    }

    // The URL is its own label: an address is a proper noun, never translated.
    _addExternalLink(url) {
        MenuDom.addLink(this._bodyEl, 'doom-menu-modal-link', url, url);
    }
}
