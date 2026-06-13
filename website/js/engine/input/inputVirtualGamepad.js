/**
 * Virtual on-screen gamepad input (touch-only devices).
 *
 * Two floating analog sticks and five buttons are drawn over the screen and
 * read through the same API as InputGamepad, so the game code never knows
 * which device it talks to.
 *
 *   - left half  : movement stick (joy1) - trailing origin: the base follows
 *                  the thumb past the max radius, so a long move keeps full
 *                  deflection and direction control.
 *   - right half : look stick     (joy2) - floating origin, re-centered on
 *                  each touch (a rate stick: Inputs turns the held position
 *                  into a per-frame delta).
 *   - buttons    : crouch / jump / action / fire (bottom-right cluster) and
 *                  pause (top-right corner).
 *
 * Each finger is tracked by its touch identifier, so moving, looking and
 * pressing buttons at the same time stay independent. Touches are captured on
 * the overlay itself and hit-tested by coordinates (priority: pause, buttons,
 * then the left/right stick zones) - the sticks are floating, so there is no
 * element to land on before the finger touches down.
 */
class InputVirtualGamepad {
    constructor() {
        this._screen      = null;
        this._overlay     = null;
        this._stickEls    = null;
        this._visible     = false;
        this._deadZone    = 0.15;
        this._radiusRatio = 0.12;   // stick radius as a fraction of the display height

        this._joy1    = { x: 0, y: 0 };
        this._joy2    = { x: 0, y: 0 };
        this._buttons = {
            crouch: false,
            jump:   false,
            action: false,
            fire:   false,
            pause:  false
        };

        // touch identifier -> control owned by that finger
        this._touches = new Map();

        // Button layout in fractions of the display (center x, center y, radius).
        // Radius is a fraction of the height so every button stays a circle.
        this._buttonLayout = {
            pause:  { x: 0.94, y: 0.09, r: 0.045, label: '||' },
            action: { x: 0.85, y: 0.58, r: 0.060, label: 'E' },
            crouch: { x: 0.76, y: 0.74, r: 0.060, label: 'C' },
            jump:   { x: 0.94, y: 0.74, r: 0.060, label: '▲' },
            fire:   { x: 0.85, y: 0.90, r: 0.060, label: '●' }
        };

        this._onTouchStart = this._handleTouchStart.bind(this);
        this._onTouchMove  = this._handleTouchMove.bind(this);
        this._onTouchEnd   = this._handleTouchEnd.bind(this);
    }

    /**
     * Rebuilds the touch overlay into the screen recreated for each level.
     * @param {ScreenManager} screen
     */
    bindScreen(screen) {
        this._screen = screen;
        this._buildOverlay(screen.getDisplay());
        this.setVisible(this._visible);
        return this;
    }

    /**
     * Shows or hides the overlay. Driven by Inputs: only the active
     * virtualGamepad mode shows the controls.
     * @param {boolean} visible
     */
    setVisible(visible) {
        this._visible = (visible === true);
        if (this._overlay !== null) {
            this._overlay.style.display = ((this._visible) ? 'block' : 'none');
        }
        if (!this._visible) {
            this._resetState();
        }
    }

    readJoy1X() {
        return this._joy1.x;
    }

    readJoy1Y() {
        return this._joy1.y;
    }

    readJoy2X() {
        return this._joy2.x;
    }

    readJoy2Y() {
        return this._joy2.y;
    }

    readButtonJump() {
        return this._buttons.jump;
    }

    readButtonAction() {
        return this._buttons.action;
    }

    readButtonCrouch() {
        return this._buttons.crouch;
    }

    readButtonFire() {
        return this._buttons.fire;
    }

    readButtonPause() {
        return this._buttons.pause;
    }

    // --- DOM ---

    _buildOverlay(display) {
        this._resetState();

        const overlay = document.createElement('div');
        overlay.style.position    = 'absolute';
        overlay.style.top         = '0';
        overlay.style.left        = '0';
        overlay.style.width       = '100%';
        overlay.style.height      = '100%';
        overlay.style.zIndex      = '10';
        overlay.style.touchAction = 'none';
        overlay.style.userSelect  = 'none';

        this._stickEls = {
            move: this._createStick(overlay),
            look: this._createStick(overlay)
        };

        for (const name in this._buttonLayout) {
            this._createButton(overlay, this._buttonLayout[name]);
        }

        overlay.addEventListener('touchstart',  this._onTouchStart, { passive: false });
        overlay.addEventListener('touchmove',   this._onTouchMove,  { passive: false });
        overlay.addEventListener('touchend',    this._onTouchEnd,   { passive: false });
        overlay.addEventListener('touchcancel', this._onTouchEnd,   { passive: false });

        display.appendChild(overlay);
        this._overlay = overlay;
    }

    // Floating stick: base ring + thumb knob, both hidden until touched and
    // positioned in pixels on each move (pointer-events none - the overlay
    // owns the touch handling).
    _createStick(overlay) {
        const base = document.createElement('div');
        base.style.position      = 'absolute';
        base.style.borderRadius  = '50%';
        base.style.border        = '2px solid rgba(220, 60, 50, 0.7)';
        base.style.background    = 'rgba(220, 60, 50, 0.12)';
        base.style.boxSizing     = 'border-box';
        base.style.pointerEvents = 'none';
        base.style.display       = 'none';

        const knob = document.createElement('div');
        knob.style.position      = 'absolute';
        knob.style.borderRadius  = '50%';
        knob.style.background    = 'rgba(220, 60, 50, 0.55)';
        knob.style.boxSizing     = 'border-box';
        knob.style.pointerEvents = 'none';
        knob.style.display       = 'none';

        overlay.appendChild(base);
        overlay.appendChild(knob);
        return { base: base, knob: knob };
    }

    _createButton(overlay, layout) {
        const el = document.createElement('div');
        el.style.position       = 'absolute';
        el.style.height         = (layout.r * 2 * 100) + '%';
        el.style.aspectRatio    = '1 / 1';
        el.style.left           = (layout.x * 100) + '%';
        el.style.top            = (layout.y * 100) + '%';
        el.style.transform      = 'translate(-50%, -50%)';
        el.style.borderRadius   = '50%';
        el.style.border         = '2px solid rgba(220, 60, 50, 0.8)';
        el.style.background      = 'rgba(220, 60, 50, 0.18)';
        el.style.color          = 'rgba(255, 220, 210, 0.9)';
        el.style.display        = 'flex';
        el.style.alignItems     = 'center';
        el.style.justifyContent = 'center';
        el.style.fontFamily     = 'monospace';
        el.style.fontSize       = '3.5vh';
        el.style.boxSizing      = 'border-box';
        el.style.pointerEvents  = 'none';
        el.textContent          = layout.label;
        overlay.appendChild(el);
        return el;
    }

    // --- Touch handling ---

    _handleTouchStart(event) {
        event.preventDefault();
        const rect = this._overlay.getBoundingClientRect();
        for (const touch of event.changedTouches) {
            this._assignTouch(touch, rect);
        }
    }

    _handleTouchMove(event) {
        event.preventDefault();
        const rect = this._overlay.getBoundingClientRect();
        for (const touch of event.changedTouches) {
            const owned = this._touches.get(touch.identifier);
            if ((owned === undefined) || (owned.kind === 'button')) {
                continue;
            }
            const px = touch.clientX - rect.left;
            const py = touch.clientY - rect.top;
            if (owned.kind === 'move') {
                this._trailOrigin(owned, px, py, rect.width, rect.height);
            }
            this._updateStick(owned, px, py);
        }
    }

    _handleTouchEnd(event) {
        event.preventDefault();
        for (const touch of event.changedTouches) {
            const owned = this._touches.get(touch.identifier);
            if (owned === undefined) {
                continue;
            }
            this._touches.delete(touch.identifier);
            if (owned.kind === 'button') {
                this._buttons[owned.button] = false;
                continue;
            }
            this._releaseStick(owned);
        }
    }

    // Assigns a new finger to a control, hit-tested by priority.
    _assignTouch(touch, rect) {
        const w  = rect.width;
        const h  = rect.height;
        const px = touch.clientX - rect.left;
        const py = touch.clientY - rect.top;

        const button = this._hitButton(px, py, w, h);
        if (button !== null) {
            this._buttons[button] = true;
            this._touches.set(touch.identifier, { kind: 'button', button: button });
            return;
        }

        const radius = h * this._radiusRatio;
        const origin = this._clampOrigin(px, py, w, h, radius);
        const kind   = ((px < (w * 0.5)) ? 'move' : 'look');
        const owned  = { kind: kind, origin: origin, radius: radius };
        this._touches.set(touch.identifier, owned);
        this._showStick(kind);
        this._updateStick(owned, px, py);
    }

    // Returns the button name under the point, or null.
    _hitButton(px, py, w, h) {
        for (const name in this._buttonLayout) {
            const b  = this._buttonLayout[name];
            const dx = px - (b.x * w);
            const dy = py - (b.y * h);
            const r  = b.r * h;
            if (((dx * dx) + (dy * dy)) <= (r * r)) {
                return name;
            }
        }
        return null;
    }

    // Keeps a floating stick base fully on screen.
    _clampOrigin(px, py, w, h, radius) {
        const x = Math.min(Math.max(px, radius), w - radius);
        const y = Math.min(Math.max(py, radius), h - radius);
        return { x: x, y: y };
    }

    // Trailing origin (move stick): once the finger goes past the max radius,
    // the base follows it so the deflection stays saturated and steerable.
    _trailOrigin(owned, px, py, w, h) {
        const dx   = px - owned.origin.x;
        const dy   = py - owned.origin.y;
        const dist = Math.sqrt((dx * dx) + (dy * dy));
        if (dist <= owned.radius) {
            return;
        }
        const excess = dist - owned.radius;
        const nx = owned.origin.x + ((dx / dist) * excess);
        const ny = owned.origin.y + ((dy / dist) * excess);
        owned.origin = this._clampOrigin(nx, ny, w, h, owned.radius);
    }

    // Computes the deflection, moves the visual elements, stores the axes
    // with the engine sign convention (joy1Y forward = up, joy2Y down = down).
    _updateStick(owned, px, py) {
        const radius = owned.radius;
        let nx = (px - owned.origin.x) / radius;
        let ny = (py - owned.origin.y) / radius;
        const mag = Math.sqrt((nx * nx) + (ny * ny));
        if (mag > 1) {
            nx = nx / mag;
            ny = ny / mag;
        }

        const knobX = owned.origin.x + (nx * radius);
        const knobY = owned.origin.y + (ny * radius);
        this._positionStick(owned.kind, owned.origin, radius, knobX, knobY);

        const out = this._applyDeadZone(nx, ny);
        const joy = ((owned.kind === 'move') ? this._joy1 : this._joy2);
        joy.x = out.x;
        joy.y = ((owned.kind === 'move') ? -out.y : out.y);
    }

    // Radial dead zone with rescale (same 0.15 as the physical gamepad): the
    // value restarts at 0 on the dead-zone edge and still reaches 1 at full
    // deflection.
    _applyDeadZone(nx, ny) {
        const mag = Math.min(Math.sqrt((nx * nx) + (ny * ny)), 1);
        if (mag < this._deadZone) {
            return { x: 0, y: 0 };
        }
        const scaled = (mag - this._deadZone) / (1 - this._deadZone);
        const factor = scaled / mag;
        return { x: nx * factor, y: ny * factor };
    }

    _positionStick(kind, origin, radius, knobX, knobY) {
        const els      = this._stickEls[kind];
        const diameter = radius * 2;
        els.base.style.width  = diameter + 'px';
        els.base.style.height = diameter + 'px';
        els.base.style.left   = (origin.x - radius) + 'px';
        els.base.style.top    = (origin.y - radius) + 'px';

        const knobR = radius * 0.45;
        els.knob.style.width  = (knobR * 2) + 'px';
        els.knob.style.height = (knobR * 2) + 'px';
        els.knob.style.left   = (knobX - knobR) + 'px';
        els.knob.style.top    = (knobY - knobR) + 'px';
    }

    _showStick(kind) {
        this._stickEls[kind].base.style.display = 'block';
        this._stickEls[kind].knob.style.display = 'block';
    }

    _hideStick(kind) {
        this._stickEls[kind].base.style.display = 'none';
        this._stickEls[kind].knob.style.display = 'none';
    }

    _releaseStick(owned) {
        const joy = ((owned.kind === 'move') ? this._joy1 : this._joy2);
        joy.x = 0;
        joy.y = 0;
        this._hideStick(owned.kind);
    }

    // Neutralizes every input (used on rebuild and when the overlay is hidden,
    // since hiding fires no touchend for fingers still down).
    _resetState() {
        this._touches.clear();
        this._joy1.x = 0;
        this._joy1.y = 0;
        this._joy2.x = 0;
        this._joy2.y = 0;
        this._buttons.crouch = false;
        this._buttons.jump   = false;
        this._buttons.action = false;
        this._buttons.fire   = false;
        this._buttons.pause  = false;
    }
}
