class InputMouse {
    constructor(canvas) {
        this._canvas     = canvas;
        this._dx         = 0;
        this._dy         = 0;
        this._lastDx     = 0;
        this._lastDy     = 0;
        this._locked     = false;
        this._leftClick  = false;
        this._rightClick = false;

        canvas.addEventListener('click', () => this._requestLock());

        document.addEventListener('pointerlockchange', () => {
            this._locked = (document.pointerLockElement === this._canvas);
            if (!this._locked) { this._dx = 0; this._dy = 0; }
        });

        document.addEventListener('pointerlockerror', () => {
            console.warn('InputMouse: pointer lock failed');
        });

        document.addEventListener('mousemove', (e) => {
            if (!this._locked) return;
            this._dx += e.movementX;
            this._dy += e.movementY;
        });

        canvas.addEventListener('mousedown', (e) => {
            if (e.button === 0) this._leftClick  = true;
            if (e.button === 2) this._rightClick = true;
        });
        canvas.addEventListener('mouseup', (e) => {
            if (e.button === 0) this._leftClick  = false;
            if (e.button === 2) this._rightClick = false;
        });
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    _requestLock() {
        if (document.pointerLockElement) return;
        const p = this._canvas.requestPointerLock({ unadjustedMovement: true });
        if (p) {
            p.catch((e) => {
                if (e.name === 'NotSupportedError') {
                    this._canvas.requestPointerLock();
                }
            });
        }
    }

    // Returns accumulated delta since last call and resets to 0 — call once per frame.
    readDeltaX() { this._lastDx = this._dx; this._dx = 0; return this._lastDx; }
    readDeltaY() { this._lastDy = this._dy; this._dy = 0; return this._lastDy; }

    isLocked()       { return this._locked; }
    isLeftClickDown()  { return this._leftClick; }
    isRightClickDown() { return this._rightClick; }
    getLastDx()      { return this._lastDx; }
    getLastDy()      { return this._lastDy; }
}
