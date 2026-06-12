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
        this._axisMap  = [0, 1, 2, 3];
    }

    /**
     * Scans the connected gamepads and keeps one as active, preferring the
     * W3C "standard" mapping, with a fallback on the first connected pad.
     * The axis map is rebuilt whenever the active pad changes.
     * @returns {boolean}
     */
    isAvailable() {
        if (!navigator.getGamepads) {
            this._index = null;
            return false;
        }
        const previousIndex = this._index;
        const pads = navigator.getGamepads();
        let index    = null;
        let fallback = null;
        for (let i = 0; i < pads.length; i++) {
            if ((pads[i] === null) || !pads[i].connected) {
                continue;
            }
            if (pads[i].mapping === 'standard') {
                index = i;
                break;
            }
            if (fallback === null) {
                fallback = i;
            }
        }
        if (index === null) {
            index = fallback;
        }
        this._index = index;
        if ((index !== null) && (index !== previousIndex)) {
            this._buildAxisMap(pads[index]);
        }
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

    // The standard mapping guarantees the sticks on axes 0-3. On non-standard
    // pads, the triggers are often exposed as axes resting at ±1 (DualSense:
    // L2/R2 → rest pose [0,0,0,-1,-1,0]): keep the first 4 axes resting near
    // 0 as [joy1X, joy1Y, joy2X, joy2Y]. Computed when the active pad changes,
    // so a stick held during the scan cannot corrupt a later rescan.
    _buildAxisMap(pad) {
        this._axisMap = [0, 1, 2, 3];
        if (pad.mapping === 'standard') {
            return;
        }
        const map = [];
        for (let i = 0; (i < pad.axes.length) && (map.length < 4); i++) {
            if (Math.abs(pad.axes[i]) < 0.5) {
                map.push(i);
            }
        }
        if (map.length === 4) {
            this._axisMap = map;
        }
    }

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
    // and still reaches 1 at full deflection. The slot (0-3) goes through the
    // axis map to reach the real hardware axis.
    _axis(slot) {
        const pad   = this._getPad();
        const index = this._axisMap[slot];
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
