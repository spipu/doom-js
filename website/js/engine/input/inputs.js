/**
 * Inputs coordinator - unified proxy between the game code and the concrete
 * input devices:
 *   - joy 1 axes  : movement, -1..+1 (+X = strafe right, +Y = forward)
 *   - joy 2 deltas: look, pixel-equivalent (mouse delta passthrough, stick
 *                   position converted with the look speed and the given dt)
 *   - buttons     : jump, action, crouch, fire, pause + the keyboard-only
 *                   walk-slow modifier
 * Device priority: gamepad > virtual gamepad (touch-only device) > keyboard+mouse.
 * Gamepad presence is event-driven (gamepadconnected / gamepaddisconnected —
 * the browser only exposes a gamepad after a button has been pressed on it).
 */
let Inputs_private = null;

class Inputs {
    // Dead-zone rescale shared by the physical and virtual gamepads: the
    // value restarts at 0 on the dead-zone edge and still reaches 1 at full
    // deflection. Returns 0 below the dead zone.
    static rescaleDeadZone(magnitude, deadZone) {
        if (magnitude < deadZone) {
            return 0;
        }
        return (magnitude - deadZone) / (1 - deadZone);
    }

    // Movement stick reaches full speed at 80% of its travel, not only at the
    // very edge (the look stick keeps its full range).
    static get MOVE_SATURATION() {
        return 0.8;
    }

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
        this._lookInvertY    = {gamepad: false, virtualGamepad: false, keyboardMouse: false};

        this._selectMode();
        // gamepadconnected fires on the first button press of the pad
        // (anti-fingerprinting), gamepaddisconnected on unplug / BT sleep.
        // Never removed: the single Inputs instance lives as long as the page
        window.addEventListener('gamepadconnected', () => {this._selectMode(); });
        window.addEventListener('gamepaddisconnected', () => {this._selectMode(); });
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

    /**
     * Name (Gamepad.id) of the active physical gamepad, null when the
     * current mode is not 'gamepad'.
     */
    getGamepadName() {
        return ((this._mode === 'gamepad') ? this._gamepad.getName() : null);
    }

    // Look Y inversion, one flag per input mode ('gamepad' | 'virtualGamepad'
    // | 'keyboardMouse'). Game settings: the engine only carries the switch.
    setLookInvertY(mode, inverted) {
        if (this._lookInvertY[mode] !== undefined) {
            this._lookInvertY[mode] = (inverted === true);
        }
        return this;
    }

    // Optional keyboard rebinding ({action: code}, see
    // InputKeyboard.DEFAULT_MAPPING): actions left out keep their defaults.
    // Game keys only — the DOM menus read their own fixed keys.
    setKeyMapping(mapping) {
        this._keyboard.setMapping(mapping);
        return this;
    }

    // Dead zone of one virtual-pad gesture ('move' | 'aim' | 'fire'), as a
    // fraction of the stick travel. Game settings: the coordinator only carries
    // the value to the device, which owns the behaviour.
    setVirtualPadDeadZone(kind, fraction) {
        this._virtualGamepad.setDeadZone(kind, fraction);
        return this;
    }

    // Output sensitivity of the virtual pad's FIRING gesture (1 = same as its
    // silent aim gesture). Scoped to that device — the physical pad and the
    // mouse look speed are untouched.
    setVirtualPadSensitivity(factor) {
        this._virtualGamepad.setFireSensitivity(factor);
        return this;
    }

    readJoy1X() {
        const pad = this._pad();
        if (pad !== null) {
            return this._saturateMove(pad.readJoy1X(), pad.readJoy1Y()).x;
        }
        return this._keyAxis(this._keyboard.readAction('strafeRight'), this._keyboard.readAction('strafeLeft'));
    }

    readJoy1Y() {
        const pad = this._pad();
        if (pad !== null) {
            return this._saturateMove(pad.readJoy1X(), pad.readJoy1Y()).y;
        }
        return this._keyAxis(this._keyboard.readAction('forward'), this._keyboard.readAction('backward'));
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
        return this._keyboard.readAction('jump');
    }

    readButtonAction() {
        const pad = this._pad();
        if (pad !== null) {
            return pad.readButtonAction();
        }
        return this._keyboard.readAction('action');
    }

    readButtonCrouch() {
        const pad = this._pad();
        if (pad !== null) {
            return pad.readButtonCrouch();
        }
        return this._keyboard.readAction('crouch');
    }

    readButtonFire() {
        const pad = this._pad();
        if (pad !== null) {
            return pad.readButtonFire();
        }
        return (this._mouse.isLeftClickDown() || this._keyboard.readAction('fire'));
    }

    readButtonPause() {
        const pad = this._pad();
        if (pad !== null) {
            return pad.readButtonPause();
        }
        return this._keyboard.readAction('pause');
    }

    // Keyboard-only modifier: the analog sticks already give slow walking
    // through partial deflection, so the pad modes return false
    readButtonWalkSlow() {
        if (this._pad() !== null) {
            return false;
        }
        return this._keyboard.readAction('walkSlow');
    }

    // Keyboard-only debug cheat (fixed 'o' key, not remappable): grant the
    // full Doom test kit.
    readButtonCheatFullKit() {
        return this._keyboard.readKey('KeyO');
    }

    // Keyboard-only: toggle between the game HUD and the debug HUD.
    // Reads the keyboard directly so gamepad / virtual gamepad never trigger it.
    readButtonToggleHud() {
        return this._keyboard.readAction('toggleHud');
    }

    // Cycle to the next weapon. On a pad (physical or virtual) it
    // comes from the active device.
    readButtonWeaponNext() {
        const pad = this._pad();
        if (pad !== null) {
            return pad.readButtonWeaponNext();
        }
        return this._keyboard.readAction('weaponNext');
    }

    // Cycle to the previous weapon. On a pad it comes from the
    // active device (the virtual gamepad has no previous binding → false).
    readButtonWeaponPrev() {
        const pad = this._pad();
        if (pad !== null) {
            return pad.readButtonWeaponPrev();
        }
        return this._keyboard.readAction('weaponPrev');
    }

    // Net mouse-wheel weapon steps since the last call (up = next, down = prev).
    // Discrete and consumable, unlike the held weapon buttons above.
    readWeaponWheel() {
        return this._mouse.readWheelNotches();
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

    // Rescales the joy1 vector so the movement stick saturates to full at
    // MOVE_SATURATION of its travel, keeping its direction. Pad path only —
    // keyboard axes are already ±1 and the look stick (joy2) is untouched.
    _saturateMove(x, y) {
        const mag = Math.sqrt((x * x) + (y * y));
        if (mag < 1e-10) {
            return { x: 0, y: 0 };
        }
        const factor = Math.min(mag / Inputs.MOVE_SATURATION, 1) / mag;
        return { x: (x * factor), y: (y * factor) };
    }

    _computeJoy2DeltaX(dt) {
        const pad = this._pad();
        if (pad !== null) {
            return pad.readJoy2X() * this._stickLookSpeed * dt;
        }
        // The look keys keep a keyboard fallback (pointer lock is broken in some VMs)
        const keys = this._keyAxis(this._keyboard.readAction('lookRight'), this._keyboard.readAction('lookLeft')) * this._keyLookSpeed * dt;
        return keys + this._mouse.readDeltaX();
    }

    _computeJoy2DeltaY(dt) {
        const factor = ((this._lookInvertY[this._mode] === true) ? -1 : 1);
        const pad = this._pad();
        if (pad !== null) {
            return pad.readJoy2Y() * this._stickLookSpeed * dt * factor;
        }
        // The look keys keep a keyboard fallback (pointer lock is broken in some VMs)
        const keys = this._keyAxis(this._keyboard.readAction('lookDown'), this._keyboard.readAction('lookUp')) * this._keyLookSpeed * dt;
        return (keys + this._mouse.readDeltaY()) * factor;
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
        // Only the active virtualGamepad mode shows its on-screen controls
        this._virtualGamepad.setVisible((mode === 'virtualGamepad'));
    }

    // Primary pointer, not `any-pointer`: the latter reports *possible*
    // capabilities, so Android/Samsung falsely claim a fine pointer with no mouse.
    _isTouchOnlyDevice() {
        return (window.matchMedia('(pointer: coarse)').matches && (navigator.maxTouchPoints > 0));
    }
}
