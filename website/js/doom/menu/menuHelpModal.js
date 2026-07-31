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
            Space: 'Espace'
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
    }

    show() {
        this._loadLayoutMap();
        // The page title reuses the screens' subtitle design (uppercase,
        // left-aligned, red underline) instead of the centred modal message.
        const {modal, messageEl} = this._createShell('', 'doom-menu-modal doom-menu-modal-wide doom-menu-modal-help', 'doom-menu-subtitle');
        this._titleEl = messageEl;
        this._bodyEl  = MenuDom.addElement(modal, 'div', 'doom-menu-modal-help-body');

        const actions = MenuDom.addElement(modal, 'div', 'doom-menu-modal-actions');
        this._actionButton = MenuDom.addButton(actions, 'doom-menu-button', 'Fermer', () => {
            this._onBack();
        });

        this._nav.attach();
        this._stack = [];
        this._pushPage('Aide', () => this._buildRoot());

        return this;
    }

    close() {
        this._stopKeyCapture();
        this._clearPageTimer();
        this._nav.detach().clear();

        return super.close();
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

    _pushPage(title, builder, noBack = false) {
        this._stack.push({title: title, builder: builder, noBack: (noBack === true)});
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
        this._titleEl.textContent        = this._stack.map((page) => page.title).join(' > ');
        this._actionButton.textContent   = ((this._stack.length > 1) ? 'Retour' : 'Fermer');
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
        this._nav.addItemIn(list, 'Affichage', () => this._pushPage('Affichage', () => this._buildDisplay()));
        this._nav.addItemIn(list, 'Contrôles', () => this._pushPage('Contrôles', () => this._buildControls()));
        this._nav.addItemIn(list, 'Réinitialiser tous les paramétrages', () => this._confirmReset());
        this._nav.addItemIn(list, 'À propos', () => this._pushPage('À propos', () => this._buildAbout()));
        this._nav.selectFirst();
    }

    // Wipes every saved setting after a nested confirmation (its overlay
    // stacks above this modal and suspends our navigation, DOM-detected).
    _confirmReset() {
        new MenuModal(this._display).confirm('Supprimer tous les paramétrages enregistrés ?', () => {
            doomSettings.resetAll().applyToInputs(new Inputs());
        }, 'Confirmer', 'Retour');
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
            return 'Manette virtuelle';
        }
        if (mode === 'gamepad') {
            return ('Manette ' + (inputs.getGamepadName() ?? '')).trim();
        }

        return 'Clavier et souris';
    }

    // One navigable row per setting: name on the left, current value on the
    // right. Activating a bool flips it in place, a list steps to its next
    // value (wrapping); activating a char (key binding) opens the capture page.
    _addSettingItem(listEl, def, inputs) {
        let valueEl = null;
        const item = this._nav.addItemIn(listEl, def.name, () => {
            if (def.type === 'bool') {
                doomSettings.set(def.key, !(doomSettings.get(def.key) === true));
                doomSettings.applyToInputs(inputs);
                valueEl.textContent = this._settingValueText(def);
            }
            if (def.type === 'list') {
                doomSettings.set(def.key, doomSettings.nextListValue(def));
                doomSettings.applyToInputs(inputs);
                valueEl.textContent = this._settingValueText(def);
            }
            if (def.type === 'char') {
                this._startKeyCapture(def, inputs);
            }
        });
        valueEl = MenuDom.addText(item, 'doom-menu-item-value', this._settingValueText(def));

        return item;
    }

    _settingValueText(def) {
        if (def.type === 'bool') {
            return ((doomSettings.get(def.key) === true) ? 'Oui' : 'Non');
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
        this._pushPage(def.name, () => {
            MenuDom.addText(this._bodyEl, 'doom-menu-modal-line', 'Appuyez sur la touche à utiliser pour « ' + def.name + ' »…');
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
        const label = MenuHelpModal.KEY_LABELS[code];
        if (label !== undefined) {
            return label;
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
            return 'Num ' + code.slice(6);
        }

        return code;
    }

    _buildAbout() {
        const lines = [
            'Spipu-Doom convertit et fait tourner vos fichiers WAD Doom à la volée, entièrement dans le navigateur : rendu WebGL, physique FPS, éléments mouvants et armes fidèles au jeu original.',
            'Développé par Spipu (Laurent Minguet).',
            'Licence MIT — à l\'exception des graphismes de decals d\'impact, repris d\'UZDoom sous licence GPL v3.',
            'Aucun fichier WAD n\'est fourni. Utilisez un WAD libre comme Freedoom, ou vos propres fichiers dont vous détenez les droits — Doom et ses données de jeu restent la propriété de leurs ayants droit.',
            '© 2024-' + new Date().getFullYear() + ' Spipu.'
        ];
        for (const line of lines) {
            MenuDom.addText(this._bodyEl, 'doom-menu-modal-line', line);
        }
    }
}
