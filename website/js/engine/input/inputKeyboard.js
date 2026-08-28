let InputKeyboard_private = null;

class InputKeyboard {
    // Default binding of each game action: ONE physical key code per action
    // (layout independent: WASD = ZQSD on AZERTY), '' = unmapped.
    // ⚠️ Crouch on left Ctrl: held with the key printing 'q' (strafe left on
    // AZERTY, fire on QWERTY) it QUITS Firefox — a browser-privileged
    // shortcut no page JS can cancel; the dev Playwright profile disables
    // it, players may rebind.
    static get DEFAULT_MAPPING() {
        return {
            forward:     'KeyW',
            backward:    'KeyS',
            strafeLeft:  'KeyA',
            strafeRight: 'KeyD',
            jump:        'ShiftLeft',
            crouch:      'ControlLeft',
            action:      'KeyE',
            fire:        'KeyQ',
            weaponPrev:  'KeyF',
            weaponNext:  'KeyG',
            walkSlow:    'AltLeft',
            toggleHud:   'KeyH',
            // Layout-independent, unlike a letter: 'KeyM' is the QWERTY
            // position, which prints ',' on AZERTY.
            map:         'Tab',
            // Keyboard look fallback ("fake mouse", pointer lock broken in
            // some VMs): +/- deltas on both axes.
            lookUp:      'KeyI',
            lookDown:    'KeyK',
            lookLeft:    'KeyJ',
            lookRight:   'KeyL'
        };
    }

    constructor() {
        if (InputKeyboard_private) {
            throw new Error('InputKeyboard object already exists...');
        }
        InputKeyboard_private = this;
        this._keys    = new Set();
        this._mapping = InputKeyboard.DEFAULT_MAPPING;

        document.addEventListener('keydown', (e) => {
            this._keys.add(e.code);
            // Suppress the interceptable browser shortcuts (Ctrl+S/D/F…) while
            // playing — but never inside a text field (menu URL paste).
            // Ctrl+Q/Ctrl+W are browser-privileged: they CANNOT be cancelled
            // from page JS (see the DEFAULT_MAPPING warning).
            const typing = ((e.target instanceof HTMLInputElement) || (e.target instanceof HTMLTextAreaElement));
            if (e.ctrlKey && !typing && (e.code.startsWith('Key') || e.code.startsWith('Digit'))) {
                e.preventDefault();
            }
            // Tab would walk the browser focus, and a focused button then eats
            // the next Enter as a native re-click.
            if ((e.code === 'Tab') && !typing) {
                e.preventDefault();
            }
        });
        document.addEventListener('keyup', (e) => {
            this._keys.delete(e.code);
        });
        // A keyup fired while the page has lost focus (Alt+Tab with a key held)
        // never reaches us — clear everything so no key stays stuck down.
        window.addEventListener('blur', () => {
            this._keys.clear();
        });
    }

    /**
     * Optional per-action rebinding: one code per given action ('' unmaps
     * it). Unknown actions are ignored, missing ones keep their defaults.
     *
     * @param {object} mapping - {action: string}
     */
    setMapping(mapping) {
        const merged = InputKeyboard.DEFAULT_MAPPING;
        for (const action of Object.keys(mapping ?? {})) {
            if (merged[action] !== undefined) {
                merged[action] = mapping[action];
            }
        }
        this._mapping = merged;

        return this;
    }

    // True while the key bound to the action is held ('' or unknown: never).
    readAction(action) {
        const code = this._mapping[action];
        if ((code === undefined) || (code === '')) {
            return false;
        }

        return this._keys.has(code);
    }

    // True while the given physical key code is held, whatever the mapping
    // (fixed engine keys like the debug cheat).
    readKey(code) {
        return this._keys.has(code);
    }
}
