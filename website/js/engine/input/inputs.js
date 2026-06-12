/**
 * Inputs coordinator - unified proxy between the game code and the concrete
 * input devices:
 *   - joy 1 axes  : movement, -1..+1 (+X = strafe right, +Y = forward)
 *   - joy 2 deltas: look, pixel-equivalent (mouse delta passthrough, stick
 *                   position converted with the look speed and the given dt)
 *   - buttons     : jump, action, crouch, fire, pause + the keyboard-only
 *                   walk-slow modifier
 * Device priority: gamepad > virtual gamepad (touch-only device) > keyboard+mouse.
 * Gamepad presence is re-evaluated every 5 seconds on the wall clock (the
 * browser only exposes a gamepad after a button has been pressed on it).
 */
let Inputs_private = null;

class Inputs {
    /**
     * Creates and owns all the concrete input devices. Soft singleton:
     * InputKeyboard can only exist once per page, so new Inputs() returns
     * the already existing instance instead of creating a second one
     * (the menu creates a new DoomGame on each level launch).
     */
    constructor() {
        if (Inputs_private) {
            return Inputs_private;
        }
        Inputs_private = this;

        this._keyboard       = new InputKeyboard();
        this._mouse          = new InputMouse();
        this._gamepad        = new InputGamepad();
        this._virtualGamepad = new InputVirtualGamepad();
        this._mode           = 'keyboardMouse';
        this._stickLookSpeed = 1.2;
        this._keyLookSpeed   = 1.5;
        this._lastJoy2Dx     = 0;
        this._lastJoy2Dy     = 0;

        this._selectMode();
        // Never cleared: the single Inputs instance lives as long as the page
        setInterval(() => {this._selectMode(); }, 5000);
    }

    /**
     * Binds the devices to the screen, which is recreated on each level:
     * the mouse needs its canvas, the virtual gamepad will need the screen
     * itself to inject its touch UI and use the virtual ratio.
     * @param {ScreenManager} screen
     */
    bindScreen(screen) {
        this._mouse.bindCanvas(screen.getCanvas());
        this._virtualGamepad.bindScreen(screen);
        return this;
    }

    /**
     * @returns {string} 'gamepad' | 'virtualGamepad' | 'keyboardMouse'
     */
    getMode() {
        return this._mode;
    }

    readJoy1X() {
        const pad = this._pad();
        if (pad !== null) {
            return pad.readJoy1X();
        }
        return this._keyAxis(this._keyboard.readKeyStrafeRight(), this._keyboard.readKeyStrafeLeft());
    }

    readJoy1Y() {
        const pad = this._pad();
        if (pad !== null) {
            return pad.readJoy1Y();
        }
        return this._keyAxis(this._keyboard.readKeyForward(), this._keyboard.readKeyBackward());
    }

    // dt (milliseconds) is only used to convert a stick position into a
    // pixel-equivalent delta - the mouse deltas are passed through unchanged.
    // These reads consume the mouse deltas: call them once per frame.
    readJoy2DeltaX(dt) {
        this._lastJoy2Dx = this._computeJoy2DeltaX(dt);
        return this._lastJoy2Dx;
    }

    readJoy2DeltaY(dt) {
        this._lastJoy2Dy = this._computeJoy2DeltaY(dt);
        return this._lastJoy2Dy;
    }

    // Idempotent getters for display (HUD)
    getLastJoy2DeltaX() {
        return this._lastJoy2Dx;
    }

    getLastJoy2DeltaY() {
        return this._lastJoy2Dy;
    }

    readButtonJump() {
        const pad = this._pad();
        if (pad !== null) {
            return pad.readButtonJump();
        }
        return this._keyboard.readKeyShift();
    }

    readButtonAction() {
        const pad = this._pad();
        if (pad !== null) {
            return pad.readButtonAction();
        }
        return this._keyboard.readKeyAction();
    }

    readButtonCrouch() {
        const pad = this._pad();
        if (pad !== null) {
            return pad.readButtonCrouch();
        }
        return this._keyboard.readKeyCtrl();
    }

    readButtonFire() {
        const pad = this._pad();
        if (pad !== null) {
            return pad.readButtonFire();
        }
        return this._mouse.isLeftClickDown();
    }

    readButtonPause() {
        const pad = this._pad();
        if (pad !== null) {
            return pad.readButtonPause();
        }
        return this._keyboard.readKey('KeyP');
    }

    // Keyboard-only modifier: the analog sticks already give slow walking
    // through partial deflection, so the pad modes return false
    readButtonWalkSlow() {
        if (this._pad() !== null) {
            return false;
        }
        return this._keyboard.readKey('AltLeft') || this._keyboard.readKey('AltRight');
    }

    // --- Internal ---

    // Active pad-like device (gamepad and virtual gamepad share the same API),
    // or null in keyboard+mouse mode
    _pad() {
        if (this._mode === 'gamepad') {
            return this._gamepad;
        }
        if (this._mode === 'virtualGamepad') {
            return this._virtualGamepad;
        }
        return null;
    }

    // Binary axis from two key states: +1, -1 or 0
    _keyAxis(positive, negative) {
        return ((positive) ? 1 : 0) - ((negative) ? 1 : 0);
    }

    _computeJoy2DeltaX(dt) {
        const pad = this._pad();
        if (pad !== null) {
            return pad.readJoy2X() * this._stickLookSpeed * dt;
        }
        // J/L keys keep a keyboard look fallback (pointer lock is broken in some VMs)
        const keys = this._keyAxis(this._keyboard.readKey('KeyL'), this._keyboard.readKey('KeyJ')) * this._keyLookSpeed * dt;
        return keys + this._mouse.readDeltaX();
    }

    _computeJoy2DeltaY(dt) {
        const pad = this._pad();
        if (pad !== null) {
            return pad.readJoy2Y() * this._stickLookSpeed * dt;
        }
        // I/K keys keep a keyboard look fallback (pointer lock is broken in some VMs)
        const keys = this._keyAxis(this._keyboard.readKey('KeyK'), this._keyboard.readKey('KeyI')) * this._keyLookSpeed * dt;
        return keys + this._mouse.readDeltaY();
    }

    _selectMode() {
        let mode = 'keyboardMouse';
        if (this._isTouchOnlyDevice()) {
            mode = 'virtualGamepad';
        }
        if (this._gamepad.isAvailable()) {
            mode = 'gamepad';
        }
        this._mode = mode;
    }

    // No fine pointer at all (mouse, trackpad, stylus) but a touch screen:
    // iOS / Android used with fingers. An iPad with a trackpad keeps the
    // keyboard+mouse mode because it does have a real pointer.
    _isTouchOnlyDevice() {
        const finePointer = window.matchMedia('(any-hover: hover) and (any-pointer: fine)').matches;
        return (!finePointer && (navigator.maxTouchPoints > 0));
    }
}
