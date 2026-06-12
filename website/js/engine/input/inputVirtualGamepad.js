/**
 * Virtual on-screen gamepad input (touch devices).
 * API-compatible skeleton: the touch UI (two sticks + buttons) is not
 * implemented yet, every read returns the neutral value.
 */
class InputVirtualGamepad {
    constructor() {
        this._screen = null;
    }

    /**
     * The touch UI will be injected into the screen (container, virtual ratio).
     * @param {ScreenManager} screen
     */
    bindScreen(screen) {
        this._screen = screen;
    }

    readJoy1X() {
        return 0;
    }

    readJoy1Y() {
        return 0;
    }

    readJoy2X() {
        return 0;
    }

    readJoy2Y() {
        return 0;
    }

    readButtonJump() {
        return false;
    }

    readButtonAction() {
        return false;
    }

    readButtonCrouch() {
        return false;
    }

    readButtonFire() {
        return false;
    }

    readButtonPause() {
        return false;
    }
}
