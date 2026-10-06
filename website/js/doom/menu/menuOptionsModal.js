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

    static get DEVICE_KEY() {
        return 'controls.device';
    }

    static get GAMEPAD_NAME_MAX_LENGTH() {
        return 24;
    }

    static get CAPTURE_POLL_MS() {
        return 16;
    }

    // Travel from its rest value that captures an axis, then that brings it back to rest.
    static get AXIS_CAPTURE_DELTA() {
        return 0.5;
    }

    static get AXIS_REST_DELTA() {
        return 0.25;
    }

    // Sign of a push towards each capture direction, in the hardware convention (down positive).
    static get AXIS_DIRECTION_SIGNS() {
        return {right: 1, up: -1};
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

        this._titleEl         = null;
        this._bodyEl          = null;
        this._actionButton    = null;
        this._pageStack       = [];
        this._pageTimer       = null;
        this._shownDevices    = null;
        this._captureHandler  = null;
        this._captureTimer    = null;
        this._pendingListView = null;
        this._layoutMap       = null;
        this._mode            = null;
        this._inGame          = false;
        this._rendererLocked  = false;
    }

    // Over a running game: the multiplayer settings only apply to the next
    // game, so they are not offered there.
    setInGame(inGame) {
        this._inGame = (inGame === true);

        return this;
    }

    // A multiplayer session renders with WebGL whatever the setting: the
    // renderer is not offered meanwhile.
    setRendererLocked(locked) {
        this._rendererLocked = (locked === true);

        return this;
    }

    show() {
        return this._open('options', 'menu.game.options', () => this._buildRoot());
    }

    // The multiplayer section alone, from the shortcut of the Multiplayer screen.
    showMultiplayer() {
        return this._open('standalone', 'help.multiplayer', () => this._buildSettingsPage('multiplayer.'));
    }

    /**
     * The settings of the game about to open, shown to the main just before
     * its lobby: what is changed here is stored, the preset of the next game.
     * Back gives up the opening.
     *
     * @param {string[]} keys       - the settings of the launched mode
     * @param {function} onContinue - once the settings are chosen, after this modal closed
     */
    showGameSettings(keys, onContinue) {
        const continuation = {label: appTranslator.get('multiplayer.settings.continue'), action: () => {
            this.close();
            onContinue();
        }};

        return this._open('options', 'multiplayer.settings.title', () => this._buildSettingsList(keys.map((key) => doomSettings.getDefinition(key))), continuation);
    }

    showAbout() {
        return this._open('standalone', 'help.about', () => this._buildAbout());
    }

    showHelp() {
        return this._open('standalone', 'help.guide', () => this._buildHelp());
    }

    // A confirmation ({label, action}) joins the back button in the bottom row.
    _open(mode, titleCode, builder, confirmation = null) {
        this._mode = mode;
        this._loadLayoutMap();
        const {titleEl, bodyEl, button} = this._openShell('', appTranslator.get('menu.close'), confirmation);
        this._titleEl      = titleEl;
        this._bodyEl       = bodyEl;
        this._actionButton = button;
        this._pageStack    = [];
        this._pushPage(titleCode, builder);

        return this;
    }

    _teardown() {
        this._stopCapture();
        this._clearPageTimer();
    }

    // --- Page stack ---

    // Also blocked while a key or gamepad capture is running.
    _navBlocked() {
        return ((this._captureHandler !== null) || (this._captureTimer !== null) || !this._isTopOverlay());
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
        if (this._pendingListView !== null) {
            this._applyListView(this._pendingListView);
            this._pendingListView = null;
        }
    }

    // The selected row and the exact scroll of the list, so a rebuilt page
    // shows the player the very same view.
    _readListView() {
        const list = this._bodyEl.querySelector('.doom-menu-list');

        return {index: this._nav.getSelectedIndex(), scrollTop: ((list !== null) ? list.scrollTop : 0)};
    }

    // The scroll first: selecting a visible row then leaves it untouched.
    _applyListView(view) {
        const list = this._bodyEl.querySelector('.doom-menu-list');
        if (list !== null) {
            list.scrollTop = view.scrollTop;
        }
        this._nav.selectIndex(view.index);
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

    // The Device line picks the device the game plays with (automatic or one
    // of the available ones), and the settings below are those of the device
    // in use; a change of the available devices rebuilds the page.
    _buildControls() {
        const inputs = new Inputs();
        const list   = MenuDom.addElement(this._bodyEl, 'div', 'doom-menu-list');
        const device = this._nav.addItemIn(list, appTranslator.get('settings.controls.device'), () => {
            this._stepDevice(inputs, 1);
        }, (dir) => {
            this._stepDevice(inputs, dir);
        });
        MenuDom.addText(device, 'doom-menu-item-value', this._deviceChoiceLabel(this._currentDeviceChoice(inputs), inputs));

        this._shownDevices = this._devicesState(inputs);
        for (const prefix of MenuOptionsModal.SETTING_PREFIXES_BY_MODE[inputs.getMode()]) {
            for (const definition of doomSettings.getDefinitions(prefix)) {
                this._addSettingItem(list, definition, inputs);
            }
        }
        this._nav.selectFirst();

        this._pageTimer = setInterval(() => {
            if (this._devicesState(inputs) !== this._shownDevices) {
                this._renderPage();
            }
        }, MenuOptionsModal.DEVICE_REFRESH_MS);
    }

    // Automatic first, then the devices available right now.
    _deviceChoices(inputs) {
        return [DoomSettings.DEVICE_AUTO].concat(inputs.getAvailableModes());
    }

    // A saved device that is not available shows as the automatic choice it falls back on.
    _currentDeviceChoice(inputs) {
        const saved = doomSettings.get(MenuOptionsModal.DEVICE_KEY);

        return ((this._deviceChoices(inputs).includes(saved)) ? saved : DoomSettings.DEVICE_AUTO);
    }

    // The settings listed below follow the device: the page is rebuilt.
    _stepDevice(inputs, dir) {
        const choices = this._deviceChoices(inputs);
        const index   = choices.indexOf(this._currentDeviceChoice(inputs));
        const next    = choices[((index + dir + choices.length) % choices.length)];

        doomSettings.set(MenuOptionsModal.DEVICE_KEY, next).applyToInputs(inputs);
        this._renderPage();
    }

    // What the page shows depends on: the devices offered, the one in use, the gamepad's name.
    _devicesState(inputs) {
        return [inputs.getAvailableModes().join(','), inputs.getMode(), (inputs.getGamepadName() ?? '')].join('|');
    }

    _deviceChoiceLabel(choice, inputs) {
        if (choice === DoomSettings.DEVICE_AUTO) {
            return appTranslator.get('device.auto', {device: this._deviceLabel(inputs.getAutoMode(), inputs)});
        }

        return this._deviceLabel(choice, inputs);
    }

    _deviceLabel(mode, inputs) {
        if (mode === 'virtualGamepad') {
            return appTranslator.get('device.virtualPad');
        }
        if (mode === 'gamepad') {
            return appTranslator.get('device.gamepad', {name: MenuOptionsModal.gamepadDisplayName(inputs.getGamepadName() ?? '')});
        }

        return appTranslator.get('device.keyboardMouse');
    }

    /**
     * The browser's gamepad id stripped of its vendor / product numbers
     * (Firefox "054c-0ce6-Name", Chrome "Name (STANDARD GAMEPAD Vendor: 054c
     * Product: 0ce6)"), cut to fit the settings line.
     * @param {string} id
     * @returns {string}
     */
    static gamepadDisplayName(id) {
        const name = (id.replace(/^[0-9a-f]{1,4}-[0-9a-f]{1,4}-/i, '').replace(/\s*\([^)]*Vendor:[^)]*\)\s*$/i, '').trim() || id.trim());
        if (name.length <= MenuOptionsModal.GAMEPAD_NAME_MAX_LENGTH) {
            return name;
        }

        return name.slice(0, (MenuOptionsModal.GAMEPAD_NAME_MAX_LENGTH - 1)).trimEnd() + '…';
    }

    _buildSettingsPage(prefix) {
        const definitions = doomSettings.getDefinitions(prefix)
            .filter((definition) => (!this._rendererLocked || (definition.key !== MenuOptionsModal.RENDERER_KEY)));
        this._buildSettingsList(definitions);
    }

    _buildSettingsList(definitions) {
        const inputs = new Inputs();
        const list   = MenuDom.addElement(this._bodyEl, 'div', 'doom-menu-list');
        for (const definition of definitions) {
            this._addSettingItem(list, definition, inputs);
        }
        this._nav.selectFirst();
    }

    _addSettingItem(listEl, definition, inputs) {
        let valueEl = null;
        const cycles = ((definition.type === 'bool') || (definition.type === 'list'));
        const item   = this._nav.addItemIn(listEl, appTranslator.get(definition.nameCode), () => {
            if (definition.type === 'char') {
                this._startKeyCapture(definition, inputs);
                return;
            }
            if (definition.type === 'padButton') {
                this._startPadButtonCapture(definition, inputs);
                return;
            }
            if (definition.type === 'padAxis') {
                this._startPadAxisCapture(definition, inputs);
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
            this._pendingListView = this._readListView();
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
        if (definition.type === 'padButton') {
            return this._padButtonLabel(doomSettings.get(definition.key));
        }
        if (definition.type === 'padAxis') {
            return this._padAxisLabel(doomSettings.get(definition.key));
        }

        return String(doomSettings.get(definition.key));
    }

    _padButtonLabel(index) {
        return ((index !== null) ? appTranslator.get('pad.button', {number: index}) : '');
    }

    _padAxisLabel(code) {
        const binding = DoomSettings.parseAxisCode(code);
        if (binding.index === null) {
            return '';
        }

        return appTranslator.get((binding.inverted ? 'pad.axisInverted' : 'pad.axis'), {number: binding.index});
    }

    // --- Binding capture ---

    // A page left only by pressing a key: one key, one action, so the key is
    // unbound elsewhere. Capture phase, so neither the list navigation nor the
    // game shortcuts see the press.
    _startKeyCapture(definition, inputs) {
        const returnView = this._openCapturePage(definition, 'help.keyCapture');

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
            this._saveBinding(definition, event.code, inputs);
            this._endCapture(returnView);
        };
        document.addEventListener('keydown', this._captureHandler, true);
    }

    // A button held when the page opens (the one that opened it) is only
    // armed once released.
    _startPadButtonCapture(definition, inputs) {
        const pad   = inputs.getGamepad();
        const armed = pad.readRawButtons().map((down) => !down);
        let held    = null;

        this._pollPadCapture(definition, inputs, 'help.padButtonCapture', () => {
            const buttons = pad.readRawButtons();
            if (held !== null) {
                return ((buttons[held] === true) ? null : held);
            }
            buttons.forEach((down, index) => {
                armed[index] = (armed[index] || !down);
            });
            const index = buttons.findIndex((down, i) => (down && armed[i]));

            held = ((index >= 0) ? index : null);

            return null;
        });
    }

    // The first axis that leaves its rest value is taken, inverted when pushed
    // against the asked direction.
    _startPadAxisCapture(definition, inputs) {
        const pad    = inputs.getGamepad();
        const rest   = pad.readRawAxes();
        const travel = (axes, index) => (axes[index] - (rest[index] ?? 0));
        let pushed   = null;

        this._pollPadCapture(definition, inputs, 'help.padAxisCapture.' + definition.direction, () => {
            const axes = pad.readRawAxes();
            if (pushed !== null) {
                return ((Math.abs(travel(axes, pushed.index)) < MenuOptionsModal.AXIS_REST_DELTA) ? pushed.code : null);
            }
            const index = axes.findIndex((value, i) => (Math.abs(travel(axes, i)) > MenuOptionsModal.AXIS_CAPTURE_DELTA));
            if (index < 0) {
                return null;
            }
            const inverted = (Math.sign(travel(axes, index)) !== MenuOptionsModal.AXIS_DIRECTION_SIGNS[definition.direction]);

            pushed = {index: index, code: DoomSettings.axisCode(index, inverted)};

            return null;
        });
    }

    /**
     * Polls the gamepad until `step` returns the captured value, which it only
     * does once released: the press never reaches the list navigation when the
     * page closes. A pad lost meanwhile cancels.
     *
     * @param {function} step - the captured value, null while waiting
     */
    _pollPadCapture(definition, inputs, promptCode, step) {
        const returnView = this._openCapturePage(definition, promptCode);
        const pad        = inputs.getGamepad();

        this._captureTimer = setInterval(() => {
            if (!pad.isAvailable()) {
                this._endCapture(returnView);
                return;
            }
            const value = step();
            if (value !== null) {
                this._saveBinding(definition, value, inputs);
                this._endCapture(returnView);
            }
        }, MenuOptionsModal.CAPTURE_POLL_MS);
    }

    // Returns the view of the list, restored when the capture ends.
    _openCapturePage(definition, promptCode) {
        const returnView = this._readListView();
        this._pushPage(definition.nameCode, () => {
            MenuDom.addText(this._bodyEl, 'doom-menu-modal-line',
                appTranslator.get(promptCode, {action: appTranslator.get(definition.nameCode)}));
        }, true);

        return returnView;
    }

    _saveBinding(definition, value, inputs) {
        doomSettings.bind(definition, value).applyToInputs(inputs);
    }

    _endCapture(returnView) {
        this._stopCapture();
        this._pageStack.pop();
        this._pendingListView = returnView;
        this._renderPage();
    }

    _stopCapture() {
        if (this._captureHandler !== null) {
            document.removeEventListener('keydown', this._captureHandler, true);
            this._captureHandler = null;
        }
        if (this._captureTimer !== null) {
            clearInterval(this._captureTimer);
            this._captureTimer = null;
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
        const modifier = code.match(MenuOptionsModal.MODIFIER_CODE);
        if (modifier !== null) {
            return this._modifierLabel(modifier[1], modifier[2]);
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

    // 'ShiftLeft' → 'Left Shift' / 'Maj gauche': the side reads in each language's order.
    _modifierLabel(name, side) {
        const key = ((name === 'Shift') ? appTranslator.get('key.shift') : MenuOptionsModal.MODIFIER_NAMES[name]);

        return appTranslator.get(((side === 'Left') ? 'key.left' : 'key.right'), {key: key});
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

MenuOptionsModal.RENDERER_KEY   = 'display.renderer';
MenuOptionsModal.MODIFIER_CODE  = /^(Shift|Control|Alt)(Left|Right)$/;
// Key cap names, the same in every language (Shift alone is translated).
MenuOptionsModal.MODIFIER_NAMES = {Control: 'Ctrl', Alt: 'Alt'};
