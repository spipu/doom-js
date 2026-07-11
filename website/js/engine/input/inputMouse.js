class InputMouse {
    constructor() {
        this._canvas = null;
        this._reset();

        document.addEventListener('pointerlockchange', () => {
            this._locked = ((this._canvas !== null) && (document.pointerLockElement === this._canvas));
            if (!this._locked) {
                this._dx = 0;
                this._dy = 0;
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
                this._leftClick = false;
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

        canvas.addEventListener('click', () => this._requestLock());

        canvas.addEventListener('mousedown', (e) => {
            if (e.button === 0) {
                this._leftClick = true;
            }
        });
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());
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
        return this._leftClick;
    }

    // --- Internal ---

    _reset() {
        this._dx        = 0;
        this._dy        = 0;
        this._locked    = false;
        this._leftClick = false;
    }

    _requestLock() {
        if (document.pointerLockElement) {
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
}
