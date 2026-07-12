let InputKeyboard_private = null;

class InputKeyboard {
    constructor() {
        if (InputKeyboard_private) {
            throw new Error('InputKeyboard object already exists...');
        }
        InputKeyboard_private = this;
        this._keys = new Set();

        document.addEventListener('keydown', (e) => {
            this._keys.add(e.code);
            // Suppress the interceptable browser shortcuts (Ctrl+S/D/F…) while
            // playing — but never inside a text field (menu URL paste), and
            // Ctrl+Q/Ctrl+W are browser-privileged: they CANNOT be cancelled
            // from page JS (hence the crouch alternative on C).
            const typing = ((e.target instanceof HTMLInputElement) || (e.target instanceof HTMLTextAreaElement));
            if (e.ctrlKey && !typing && (e.code.startsWith('Key') || e.code.startsWith('Digit'))) {
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

    // FPS movement — arrows + WASD physical position (= ZQSD on AZERTY, WASD on QWERTY)
    readKeyForward() {
        return (this._keys.has('ArrowUp') || this._keys.has('KeyW'));
    }

    readKeyBackward() {
        return (this._keys.has('ArrowDown') || this._keys.has('KeyS'));
    }

    readKeyStrafeLeft() {
        return (this._keys.has('ArrowLeft') || this._keys.has('KeyA'));
    }

    readKeyStrafeRight() {
        return (this._keys.has('ArrowRight') || this._keys.has('KeyD'));
    }

    readKey(code) {
        return this._keys.has(code);
    }

    // C is the safe crouch key: holding Ctrl while strafing left on AZERTY
    // (Ctrl+Q) QUITS Firefox — a browser-privileged shortcut no page JS can
    // cancel. Ctrl stays accepted for the habit, at the player's own risk.
    readKeyCrouch() {
        return (this._keys.has('ControlLeft') || this._keys.has('ControlRight') || this._keys.has('KeyC'));
    }

    readKeyShift() {
        return (this._keys.has('ShiftLeft') || this._keys.has('ShiftRight'));
    }

    readKeyAction() {
        return this._keys.has('KeyE');
    }
}
