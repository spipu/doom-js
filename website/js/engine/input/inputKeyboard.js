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
            if (e.ctrlKey && (e.code.startsWith('Key') || e.code.startsWith('Digit'))) {
                e.preventDefault();
            }
        });
        document.addEventListener('keyup', (e) => {
            this._keys.delete(e.code);
        });
    }

    // FPS movement — arrows + WASD physical position (= ZQSD on AZERTY, WASD on QWERTY)
    readKeyForward() {
        return this._keys.has('ArrowUp') || this._keys.has('KeyW');
    }

    readKeyBackward() {
        return this._keys.has('ArrowDown') || this._keys.has('KeyS');
    }

    readKeyStrafeLeft() {
        return this._keys.has('ArrowLeft') || this._keys.has('KeyA');
    }

    readKeyStrafeRight() {
        return this._keys.has('ArrowRight') || this._keys.has('KeyD');
    }

    readKey(code) {
        return this._keys.has(code);
    }

    readKeyCtrl() {
        return this._keys.has('ControlLeft') || this._keys.has('ControlRight');
    }

    readKeyShift() {
        return this._keys.has('ShiftLeft') || this._keys.has('ShiftRight');
    }

    readKeyAction() {
        return this._keys.has('KeyE');
    }
}
