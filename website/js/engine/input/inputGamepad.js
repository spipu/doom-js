/**
 * Physical gamepad input (Gamepad API). The W3C "standard" mapping is
 * preferred when several pads are connected.
 * The browser only exposes a gamepad after a button has been pressed on it
 * (anti-fingerprinting), so isAvailable() stays false until then.
 * Gamepad objects are snapshots: a fresh getGamepads() call is needed on
 * every read.
 * The dead zone only applies to the joysticks (they all drift around zero).
 * Buttons and stick axes can be rebound (setButtonMapping / setAxisMapping).
 */
class InputGamepad {
    // Default button of each game action, indices (0-based) of the DualSense
    // raw layout; null = unmapped.
    static get DEFAULT_MAPPING() {
        return {
            run:        10,
            jump:       1,
            crouch:     0,
            action:     3,
            fire:       7,
            weaponPrev: 4,
            weaponNext: 5,
            map:        12,
            pause:      9
        };
    }

    // Default stick axis of each slot, in the hardware convention (right and
    // down positive), on the same DualSense raw layout [LX, LY, RX, L2, R2, RY].
    static get DEFAULT_AXIS_MAPPING() {
        return {
            moveX: {index: 0, inverted: false},
            moveY: {index: 1, inverted: false},
            lookX: {index: 2, inverted: false},
            lookY: {index: 5, inverted: false}
        };
    }

    // Analog triggers report a pressed flag at a light touch: a button counts
    // as down past half of its travel.
    static get PRESS_THRESHOLD() {
        return 0.5;
    }

    static get DPAD_FIRST_BUTTON() {
        return 12;
    }

    constructor() {
        this._index          = null;
        this._deadZone       = 0.15;
        this._buttonMapping  = InputGamepad.DEFAULT_MAPPING;
        this._reboundActions = new Set();
        this._axisMapping    = InputGamepad.DEFAULT_AXIS_MAPPING;
    }

    /**
     * Optional per-action rebinding: one button index per given action (null
     * unmaps it). Unknown actions are ignored, missing ones keep their defaults.
     *
     * @param {object} mapping - {action: int|null}
     */
    setButtonMapping(mapping) {
        this._buttonMapping  = Inputs.mergeMapping(InputGamepad.DEFAULT_MAPPING, mapping);
        this._reboundActions = new Set(Object.keys(mapping ?? {}));

        return this;
    }

    /**
     * Optional stick axis rebinding: {slot: {index, inverted}} (see
     * DEFAULT_AXIS_MAPPING), an index null unmapping the slot. Unknown slots
     * are ignored, missing ones keep their defaults.
     *
     * @param {object} mapping
     */
    setAxisMapping(mapping) {
        this._axisMapping = Inputs.mergeMapping(InputGamepad.DEFAULT_AXIS_MAPPING, mapping);

        return this;
    }

    readRawButtons() {
        const pad = this._getPad();

        return ((pad !== null) ? Array.from(pad.buttons, (button) => this._isDown(button)) : []);
    }

    readRawAxes() {
        const pad = this._getPad();

        return ((pad !== null) ? Array.from(pad.axes) : []);
    }

    /**
     * Scans the connected gamepads and keeps one as active, preferring the
     * W3C "standard" mapping, with a fallback on the first connected pad.
     * @returns {boolean}
     */
    isAvailable() {
        if (!navigator.getGamepads) {
            this._index = null;
            return false;
        }
        const pads   = navigator.getGamepads();
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
        return (this._index !== null);
    }

    // Human-readable name of the active pad (Gamepad.id), null without one.
    getName() {
        const pad = this._getPad();

        return ((pad !== null) ? pad.id : null);
    }

    readJoy1X() {
        return this._axis('moveX');
    }

    // Stick up is -1 in hardware, forward is +1 in the engine convention
    readJoy1Y() {
        return -this._axis('moveY');
    }

    readJoy2X() {
        return this._axis('lookX');
    }

    // Stick down is +1, same direction as a mouse moving down
    readJoy2Y() {
        return this._axis('lookY');
    }

    readButtonCrouch() {
        return this._readAction('crouch');
    }

    readButtonJump() {
        return this._readAction('jump');
    }

    readButtonAction() {
        return this._readAction('action');
    }

    readButtonFire() {
        return this._readAction('fire');
    }

    readButtonPause() {
        return this._readAction('pause');
    }

    readButtonRun() {
        return this._readAction('run');
    }

    readButtonWeaponPrev() {
        return this._readAction('weaponPrev');
    }

    readButtonWeaponNext() {
        return this._readAction('weaponNext');
    }

    readButtonMap() {
        return this._readAction('map');
    }

    // D-pad up/down, only trusted on the standard mapping (buttons 12/13).
    // Raw layouts expose the d-pad as a hat axis on other slots, where 12/13
    // may be unrelated physical buttons — there, the caller falls back on the
    // left stick.
    readDpadUp() {
        return (this._isStandardMapping() && this._button(12));
    }

    readDpadDown() {
        return (this._isStandardMapping() && this._button(13));
    }

    readDpadLeft() {
        return (this._isStandardMapping() && this._button(14));
    }

    readDpadRight() {
        return (this._isStandardMapping() && this._button(15));
    }

    // Generic UI navigation: validate on face button 0 (✕ on a DualSense),
    // back on face button 1 (○), used by the DOM menus.
    readButtonValidate() {
        return this._button(0);
    }

    readButtonBack() {
        return this._button(1);
    }

    // --- Internal ---

    // A default on the d-pad is only trusted on the standard mapping, where
    // 12-15 are the d-pad (see readDpadUp); a button the player bound is.
    _readAction(action) {
        const index = this._buttonMapping[action];
        if ((index === null) || (index === undefined)) {
            return false;
        }
        if (!this._reboundActions.has(action) && (index >= InputGamepad.DPAD_FIRST_BUTTON) && !this._isStandardMapping()) {
            return false;
        }

        return this._button(index);
    }

    _isStandardMapping() {
        const pad = this._getPad();

        return ((pad !== null) && (pad.mapping === 'standard'));
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

    _axis(slot) {
        const pad   = this._getPad();
        const index = this._axisMapping[slot].index;
        if ((pad === null) || (index === null) || (pad.axes.length <= index)) {
            return 0;
        }
        const value  = (this._axisMapping[slot].inverted ? -pad.axes[index] : pad.axes[index]);
        const scaled = Inputs.rescaleDeadZone(Math.abs(value), this._deadZone);
        return ((value < 0) ? -scaled : scaled);
    }

    _button(index) {
        const pad = this._getPad();
        if ((pad === null) || (pad.buttons.length <= index)) {
            return false;
        }
        return this._isDown(pad.buttons[index]);
    }

    _isDown(button) {
        return (button.value > InputGamepad.PRESS_THRESHOLD);
    }
}
