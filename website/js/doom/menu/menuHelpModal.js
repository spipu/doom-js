/**
 * Help modal of the menus, opened by the ? button of the WAD list screen.
 * A page stack sharing one MenuListNavigation: the root lists the help topics
 * (scrolling list, same mouse/keyboard/gamepad navigation as the screens),
 * entering a topic pushes a page, and the title shows the breadcrumb of the
 * stack ("Aide > À propos"). The bottom-right button reads "Fermer" at the
 * root and "Retour" deeper; Backspace / gamepad circle follow the same back
 * path.
 */
class MenuHelpModal extends MenuModal {
    static get DEVICE_REFRESH_MS() {
        return 500;
    }

    // Settings key prefixes of each input mode (DoomSettings definitions) —
    // keyboard+mouse carries both the mouse options and the key bindings.
    static get SETTING_PREFIXES_BY_MODE() {
        return {
            gamepad:        ['pad.'],
            virtualGamepad: ['virtual_pad.'],
            keyboardMouse:  ['mouse.', 'keyboard.']
        };
    }

    // The browser's own names do the job (getLayoutMap below is layout
    // aware, the code suffixes read fine elsewhere) — the only key whose
    // name needs an override is the space bar.
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

        this._nav            = new MenuListNavigation(() => this._onBack(), () => this._navBlocked());
        this._titleEl        = null;
        this._bodyEl         = null;
        this._actionButton   = null;
        this._stack          = [];
        this._pageTimer      = null;
        this._deviceLineEl   = null;
        this._controlsMode   = null;
        this._captureHandler = null;
        this._restoreIndex   = null;
        this._layoutMap      = null;
        this._onClose        = null;
    }

    /**
     * Hook fired once the modal is closed. The screen underneath is NOT rebuilt
     * while the modal covers it, so a setting changed here (the language, the
     * size units…) would leave it stale: its owner re-renders it from here.
     *
     * @param {function} callback
     */
    setOnClose(callback) {
        this._onClose = callback;

        return this;
    }

    show() {
        this._loadLayoutMap();
        // The page title reuses the screens' subtitle design (uppercase,
        // left-aligned, red underline) instead of the centred modal message.
        const {modal, messageEl} = this._createShell('', 'doom-menu-modal doom-menu-modal-wide doom-menu-modal-help', 'doom-menu-subtitle');
        this._titleEl = messageEl;
        this._bodyEl  = MenuDom.addElement(modal, 'div', 'doom-menu-modal-help-body');

        const actions = MenuDom.addElement(modal, 'div', 'doom-menu-modal-actions');
        this._actionButton = MenuDom.addButton(actions, 'doom-menu-button', appTranslator.get('menu.close'), () => {
            this._onBack();
        });

        this._nav.attach();
        this._stack = [];
        this._pushPage('help.title', () => this._buildRoot());

        return this;
    }

    close() {
        this._stopKeyCapture();
        this._clearPageTimer();
        this._nav.detach().clear();
        super.close();

        if (this._onClose !== null) {
            this._onClose();
        }

        return this;
    }

    // --- Page stack ---

    // Inputs are ignored while the modal is closed, a key capture is running,
    // or another overlay (reset confirmation…) sits ABOVE this one — only the
    // top-most overlay of the stack may react.
    _navBlocked() {
        if ((this._overlay === null) || (this._captureHandler !== null)) {
            return true;
        }
        const overlays = this._display.getContainer().querySelectorAll('.doom-menu-overlay');

        return (overlays[overlays.length - 1] !== this._overlay);
    }

    // titleCode, not a resolved label: the breadcrumb is rebuilt from the codes
    // at every render, so a language switch reaches the pages already stacked.
    _pushPage(titleCode, builder, noBack = false) {
        this._stack.push({titleCode: titleCode, builder: builder, noBack: (noBack === true)});
        this._renderPage();
    }

    // "Fermer" at the root, "Retour" deeper — same path as Backspace and the
    // gamepad back button.
    _onBack() {
        if (this._stack.length <= 1) {
            this.close();
            return;
        }
        this._stack.pop();
        this._renderPage();
    }

    _renderPage() {
        this._clearPageTimer();
        const current = this._stack[this._stack.length - 1];
        this._titleEl.textContent        = this._stack.map((page) => appTranslator.get(page.titleCode)).join(' > ');
        const actionCode                 = ((this._stack.length > 1) ? 'menu.back' : 'menu.close');
        this._actionButton.textContent   = appTranslator.get(actionCode);
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

    // Pages carrying live content (the detected device) refresh on a small
    // interval, dropped as soon as the page changes or the modal closes.
    _clearPageTimer() {
        if (this._pageTimer !== null) {
            clearInterval(this._pageTimer);
            this._pageTimer = null;
        }
    }

    // --- Pages ---

    _buildRoot() {
        const list = MenuDom.addElement(this._bodyEl, 'div', 'doom-menu-list');
        this._nav.addItemIn(list, appTranslator.get('help.display'), () => this._pushPage('help.display', () => this._buildDisplay()));
        this._nav.addItemIn(list, appTranslator.get('help.controls'), () => this._pushPage('help.controls', () => this._buildControls()));
        this._nav.addItemIn(list, appTranslator.get('help.reset'), () => this._confirmReset());
        this._nav.addItemIn(list, appTranslator.get('help.about'), () => this._pushPage('help.about', () => this._buildAbout()));
        this._nav.selectFirst();
    }

    // Wipes every saved setting after a nested confirmation (its overlay
    // stacks above this modal and suspends our navigation, DOM-detected).
    _confirmReset() {
        new MenuModal(this._display).confirm(appTranslator.get('help.resetConfirm'), () => {
            doomSettings.resetAll().applyToInputs(new Inputs()).applyToTranslator(appTranslator);
            this._renderPage();
        }, null, appTranslator.get('menu.back'));
    }

    // Adapts to what the game itself would use (same device priority as
    // Inputs): virtual gamepad on touch-only devices, the named physical
    // gamepad when one is active, keyboard+mouse otherwise. The settings list
    // is auto-built from the DoomSettings definitions matching the device's
    // key prefix; Enter on a bool entry flips it (label left, value right).
    // Refreshed live — a device change rebuilds the page, like in game.
    _buildControls() {
        const inputs = new Inputs();
        this._controlsMode = inputs.getMode();
        this._deviceLineEl = MenuDom.addText(this._bodyEl, 'doom-menu-modal-line', this._deviceLabel(inputs));

        const list = MenuDom.addElement(this._bodyEl, 'div', 'doom-menu-list');
        for (const prefix of MenuHelpModal.SETTING_PREFIXES_BY_MODE[this._controlsMode]) {
            for (const def of doomSettings.getDefinitions(prefix)) {
                this._addSettingItem(list, def, inputs);
            }
        }
        this._nav.selectFirst();

        this._pageTimer = setInterval(() => {
            if (inputs.getMode() !== this._controlsMode) {
                this._renderPage();
                return;
            }
            this._deviceLineEl.textContent = this._deviceLabel(inputs);
        }, MenuHelpModal.DEVICE_REFRESH_MS);
    }

    // Display options page: every 'display.' setting, same rows as the
    // controls page — device-agnostic, so no device line nor refresh timer.
    _buildDisplay() {
        const inputs = new Inputs();
        const list   = MenuDom.addElement(this._bodyEl, 'div', 'doom-menu-list');
        for (const def of doomSettings.getDefinitions('display.')) {
            this._addSettingItem(list, def, inputs);
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

    // One navigable row per setting: name on the left, current value on the
    // right.
    _addSettingItem(listEl, def, inputs) {
        let valueEl = null;
        const item = this._nav.addItemIn(listEl, appTranslator.get(def.nameCode), () => {
            if (def.type === 'char') {
                this._startKeyCapture(def, inputs);
                return;
            }
            this._stepSettingValue(def, inputs, valueEl);
        });
        valueEl = MenuDom.addText(item, 'doom-menu-item-value', this._settingValueText(def));

        return item;
    }

    // The language is the one value that rewrites the WHOLE page — its own row
    // included — so the page is rebuilt instead of patched, keeping the
    // selection where it was.
    _stepSettingValue(def, inputs, valueEl) {
        const next = ((def.type === 'bool')
            ? !(doomSettings.get(def.key) === true)
            : doomSettings.nextListValue(def));

        doomSettings.set(def.key, next).applyToInputs(inputs).applyToTranslator(appTranslator);

        if (def.key === 'display.language') {
            this._restoreIndex = this._nav.getSelectedIndex();
            this._renderPage();
            return;
        }
        valueEl.textContent = this._settingValueText(def);
    }

    _settingValueText(def) {
        if (def.type === 'bool') {
            const valueCode = ((doomSettings.get(def.key) === true) ? 'value.yes' : 'value.no');

            return appTranslator.get(valueCode);
        }
        if (def.type === 'list') {
            return doomSettings.getListLabel(def);
        }
        if (def.type === 'char') {
            return this._keyLabel(doomSettings.get(def.key));
        }

        return String(doomSettings.get(def.key));
    }

    // --- Key binding capture ---

    // Dedicated page that can only be left by pressing a key: the pressed key
    // is saved for the binding (and removed from any other binding carrying
    // it — one key, one action), then the settings list comes back on the
    // same row. The listener runs in capture phase so neither the list
    // navigation nor the game shortcuts see the press; F1-F12 stay with the
    // browser.
    _startKeyCapture(def, inputs) {
        // Consumed by the settings list re-render on the way back — never by
        // the (list-less) capture page itself.
        const returnIndex = this._nav.getSelectedIndex();
        this._pushPage(def.nameCode, () => {
            MenuDom.addText(this._bodyEl, 'doom-menu-modal-line',
                appTranslator.get('help.keyCapture', {action: appTranslator.get(def.nameCode)}));
        }, true);

        this._captureHandler = (event) => {
            if (event.code.startsWith('F') && (event.code.length <= 3)) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            if (event.repeat) {
                return;
            }
            doomSettings.unbindKeyCode(event.code, def.key);
            doomSettings.set(def.key, event.code);
            doomSettings.applyToInputs(inputs);
            this._stopKeyCapture();
            this._stack.pop();
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

    // Real keyboard layout (code → printed character), Chrome/Edge only —
    // loaded once per modal, null elsewhere (code-suffix fallback below).
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
        const labelCode = MenuHelpModal.KEY_LABELS[code];
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

    _buildAbout() {
        const lines = [
            appTranslator.get('help.about.what'),
            appTranslator.get('help.about.author'),
            appTranslator.get('help.about.licence'),
            appTranslator.get('help.about.wads'),
            appTranslator.get('help.about.copyright', {year: new Date().getFullYear()})
        ];
        for (const line of lines) {
            MenuDom.addText(this._bodyEl, 'doom-menu-modal-line', line);
        }
    }
}
