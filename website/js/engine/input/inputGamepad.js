/**
 * Physical gamepad input (Gamepad API, W3C "standard" mapping).
 * The browser only exposes a gamepad after a button has been pressed on it
 * (anti-fingerprinting), so isAvailable() stays false until then.
 * Gamepad objects are snapshots: a fresh getGamepads() call is needed on
 * every read.
 * The dead zone only applies to the joysticks (they all drift around zero).
 */
class InputGamepad {
    constructor() {
        this._index    = null;
        this._deadZone = 0.15;
    }

    /**
     * Scans the connected gamepads and keeps one as active, preferring the
     * W3C "standard" mapping (the whole class assumes that layout), with a
     * fallback on the first connected pad.
     * @returns {boolean}
     */
    isAvailable() {
        this._index = null;
        if (!navigator.getGamepads) {
            return false;
        }
        const pads = navigator.getGamepads();
        let fallback = null;
        for (let i = 0; i < pads.length; i++) {
            if ((pads[i] === null) || !pads[i].connected) {
                continue;
            }
            if (pads[i].mapping === 'standard') {
                this._index = i;
                return true;
            }
            if (fallback === null) {
                fallback = i;
            }
        }
        this._index = fallback;
        return (this._index !== null);
    }

    readJoy1X() {
        return this._axis(0);
    }

    // Stick up is -1 in hardware, forward is +1 in the engine convention
    readJoy1Y() {
        return -this._axis(1);
    }

    readJoy2X() {
        return this._axis(2);
    }

    // Stick down is +1, same direction as a mouse moving down
    readJoy2Y() {
        return this._axis(3);
    }

    readButtonJump() {
        return this._button(0);
    }

    readButtonCrouch() {
        return this._button(1);
    }

    readButtonAction() {
        return this._button(2);
    }

    // RT is an analog trigger: an explicit threshold on .value is more
    // deterministic across browsers than the UA-defined .pressed
    readButtonFire() {
        return (this._buttonValue(7) > 0.5);
    }

    // --- Internal ---

    _getPad() {
        if ((this._index === null) || !navigator.getGamepads) {
            return null;
        }
        const pad = navigator.getGamepads()[this._index];
        if ((pad === null) || (pad === undefined) || !pad.connected) {
            return null;
        }
        return pad;
    }

    // Dead zone with rescale: the value restarts at 0 on the dead zone edge
    // and still reaches 1 at full deflection
    _axis(index) {
        const pad = this._getPad();
        if ((pad === null) || (pad.axes.length <= index)) {
            return 0;
        }
        const value = pad.axes[index];
        const abs   = Math.abs(value);
        if (abs < this._deadZone) {
            return 0;
        }
        const scaled = (abs - this._deadZone) / (1 - this._deadZone);
        return ((value < 0) ? -scaled : scaled);
    }

    _button(index) {
        const pad = this._getPad();
        if ((pad === null) || (pad.buttons.length <= index)) {
            return false;
        }
        return pad.buttons[index].pressed;
    }

    _buttonValue(index) {
        const pad = this._getPad();
        if ((pad === null) || (pad.buttons.length <= index)) {
            return 0;
        }
        return pad.buttons[index].value;
    }
}
