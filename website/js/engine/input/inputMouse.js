class InputMouse {
    constructor() {
        this._canvas = null;
        // Set outside _reset: it is a page policy, and _reset runs again on
        // every canvas rebind.
        this._lockAllowed = true;
        this._reset();

        document.addEventListener('pointerlockchange', () => {
            const wasLocked = this._locked;
            this._locked = ((this._canvas !== null) && (document.pointerLockElement === this._canvas));
            if (!this._locked) {
                this._dx = 0;
                this._dy = 0;
            }
            // Escape is reserved by the browser to leave the pointer lock and
            // never reaches the page as a key event while locked: losing the
            // lock IS the pause signal (any other loss counts too).
            if (wasLocked && !this._locked) {
                this._pauseRequested = true;
            }
        });

        document.addEventListener('pointerlockerror', () => {
            console.warn('InputMouse: pointer lock failed');
        });

        // mouseup listened on the document, registered ONCE: with the
        // pointer lock unavailable (some VMs) a release outside the canvas
        // would never reach a canvas listener and the button would stay down.
        document.addEventListener('mouseup', (e) => {
            if (e.button === 0) {
                this._leftClick  = false;
                this._focusClick = false;
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (!this._locked) {
                return;
            }
            this._dx += e.movementX;
            this._dy += e.movementY;
        });
    }

    // The canvas listeners die with the canvas when the ScreenManager destroys
    // it - bindCanvas is called again with the new canvas on each level
    bindCanvas(canvas) {
        this._canvas = canvas;
        this._reset();

        canvas.addEventListener('click', () => this.requestLock());

        canvas.addEventListener('mousedown', (e) => {
            if (e.button === 0) {
                this._leftClick = true;
                // A press made while not yet pointer-locked is the click that
                // grabs focus — it must not fire, even if the lock engages while
                // the button is still held (cleared on release).
                if (!this._locked) {
                    this._focusClick = true;
                }
            }
        });
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            this._wheel += ((e.deltaY < 0) ? 1 : -1);
        }, { passive: false });
    }

    // Net wheel notches since the last call (up = +1, down = -1), then reset.
    readWheelNotches() {
        const notches = this._wheel;
        this._wheel = 0;
        return notches;
    }

    // Returns accumulated delta since last call and resets to 0 — call once per frame.
    readDeltaX() {
        const delta = this._dx;
        this._dx = 0;
        return delta;
    }

    readDeltaY() {
        const delta = this._dy;
        this._dy = 0;
        return delta;
    }

    isLeftClickDown() {
        return (this._leftClick && !this._focusClick);
    }

    // True once when the pointer lock was lost since the last call (the
    // browser's Escape path — the key itself is swallowed while locked).
    consumePauseRequest() {
        const requested = this._pauseRequested;
        this._pauseRequested = false;

        return requested;
    }

    // Release the pointer lock if this input holds it — leaving the game must
    // hand the mouse back to the browser (no-op when Escape already did).
    releaseLock() {
        if (this._locked) {
            document.exitPointerLock();
        }
    }

    // Withdraws the pointer lock on a page that never looks with the mouse: a
    // click then leaves the cursor alone instead of capturing it for nothing.
    allowLock(allowed) {
        this._lockAllowed = (allowed === true);
        if (!this._lockAllowed) {
            this.releaseLock();
        }

        return this;
    }

    // Grab the pointer lock on the bound canvas. Also callable by the game on
    // a user gesture (resuming from a pause menu) — fails silently without one.
    requestLock() {
        if (!this._lockAllowed || document.pointerLockElement || (this._canvas === null)) {
            return;
        }
        const p = this._canvas.requestPointerLock({ unadjustedMovement: true });
        if (p) {
            p.catch((e) => {
                if (e.name === 'NotSupportedError') {
                    this._canvas.requestPointerLock();
                }
            });
        }
    }

    // --- Internal ---

    _reset() {
        this._dx             = 0;
        this._dy             = 0;
        this._locked         = false;
        this._leftClick      = false;
        this._focusClick     = false;
        this._wheel          = 0;
        this._pauseRequested = false;
    }

}
