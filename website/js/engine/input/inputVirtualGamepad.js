/**
 * Virtual on-screen gamepad input (touch-only devices).
 *
 * Two analog sticks and five buttons are drawn over the screen and read
 * through the same API as InputGamepad, so the game code never knows which
 * device it talks to.
 *
 *   - both sticks behave identically: a static, always-visible base at a fixed
 *     position. The knob deflects from that fixed center while the finger
 *     drags and snaps back to the center on release - the base never moves and
 *     never re-centers on the touch point.
 *   - move stick (joy1, left) : strafe / forward, signed -1..+1.
 *   - look stick (joy2, right): a rate stick - Inputs turns the held position
 *     into a per-frame delta.
 *   - buttons : fire / jump / action / crouch (right cluster) and pause
 *     (top-right corner).
 *
 * Each finger is tracked by its touch identifier, so moving, looking and
 * pressing buttons at the same time stay independent. Touches are captured on
 * the overlay and hit-tested by coordinates (priority: buttons, then each
 * stick's fixed base zone).
 */
class InputVirtualGamepad {
    constructor() {
        this._screen      = null;
        this._overlay     = null;
        this._stickEls    = null;
        this._buttonEls   = null;
        this._visible     = false;
        this._deadZone    = 0.15;
        this._radiusRatio = 0.12;   // stick radius as a fraction of the display height

        // --- On-screen layout (fractions of the 16:9 letterboxed display) ---
        // Action-button radius and the ring the four buttons sit on around the
        // look stick. ringX uses the 16:9 ratio so the ring is round in pixels.
        const btnR  = 0.060;
        const ringY = 0.20;
        const ringX = ((ringY * 9) / 16);

        // Sticks are symmetric (mirrored, same height). The look stick is placed
        // so its cluster keeps an EQUAL pixel margin to the right and bottom
        // edges: the USE button (right of the stick) and the crouch button
        // (below it) end the same distance from their screen edge.
        const lookX    = 0.83;
        const gapRight = (((1 - lookX - ringX - ((btnR * 9) / 16)) * 16) / 9);
        const lookY    = (1 - btnR - ringY - gapRight);

        // Fixed, always-visible stick centers. Both sticks share the same
        // behaviour: static base, knob deflects from the fixed center, snaps
        // back on release.
        this._stickLayout = {
            move: { x: (1 - lookX), y: lookY },
            look: { x: lookX,       y: lookY }
        };

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
        // The four action buttons ring the look stick in a cross, built from
        // its center so moving the stick moves its buttons with it. Positions
        // match the DualSense face buttons (standard mapping): action b3=△ top,
        // jump b1=○ right, fire b2=□ left, crouch b0=✕ bottom. Pause keeps the
        // top-right corner.
        const look = this._stickLayout.look;
        this._buttonLayout = {
            pause:  { x: (look.x + ringX), y: (gapRight + btnR), r: btnR, label: '≡' },
            action: { x: look.x, y: (look.y - ringY), r: btnR, label: '☝︎' }, // ☝ up hand; FE0E forces monochrome (no emoji)
            jump:   { x: (look.x + ringX), y: look.y, r: btnR, label: '↑' },
            fire:   { x: (look.x - ringX), y: look.y, r: btnR, label: '⊕' },
            crouch: { x: look.x, y: (look.y + ringY), r: btnR, label: '↓' }
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
        overlay.style.touchAction   = 'none';
        overlay.style.userSelect    = 'none';
        // Container reference so the buttons can size their font against the
        // display height (cqh), keeping size and font coherent in letterbox.
        overlay.style.containerType  = 'size';

        this._stickEls = {
            move: this._createStick(overlay, this._stickLayout.move),
            look: this._createStick(overlay, this._stickLayout.look)
        };

        this._buttonEls = {};
        for (const name in this._buttonLayout) {
            this._buttonEls[name] = this._createButton(overlay, this._buttonLayout[name]);
        }

        overlay.addEventListener('touchstart',  this._onTouchStart, { passive: false });
        overlay.addEventListener('touchmove',   this._onTouchMove,  { passive: false });
        overlay.addEventListener('touchend',    this._onTouchEnd,   { passive: false });
        overlay.addEventListener('touchcancel', this._onTouchEnd,   { passive: false });

        display.appendChild(overlay);
        this._overlay = overlay;
    }

    // Static stick: a base ring at a fixed position with a thumb knob centered
    // inside it. Both are sized in % of the overlay (responsive) and always
    // visible; the knob is a child of the base so its deflection is expressed
    // in % of the base - no pixel math to render (pointer-events none, the
    // overlay owns the touch handling).
    _createStick(overlay, layout) {
        const diameterPct = (this._radiusRatio * 2 * 100);

        const base = document.createElement('div');
        base.style.position      = 'absolute';
        base.style.height        = diameterPct + '%';
        base.style.aspectRatio   = '1 / 1';
        base.style.left          = (layout.x * 100) + '%';
        base.style.top           = (layout.y * 100) + '%';
        base.style.transform     = 'translate(-50%, -50%)';
        base.style.borderRadius  = '50%';
        base.style.border        = '2px solid rgba(220, 60, 50, 0.7)';
        base.style.background    = 'rgba(220, 60, 50, 0.12)';
        base.style.boxSizing     = 'border-box';
        base.style.pointerEvents = 'none';

        const knob = document.createElement('div');
        knob.style.position      = 'absolute';
        knob.style.height        = '45%';
        knob.style.aspectRatio   = '1 / 1';
        knob.style.left          = '50%';
        knob.style.top           = '50%';
        knob.style.transform     = 'translate(-50%, -50%)';
        knob.style.borderRadius  = '50%';
        knob.style.background    = 'rgba(220, 60, 50, 0.55)';
        knob.style.boxSizing     = 'border-box';
        knob.style.pointerEvents = 'none';

        base.appendChild(knob);
        overlay.appendChild(base);
        return { base: base, knob: knob };
    }

    _createButton(overlay, layout) {
        // Diameter as a fraction of the display height; the font is derived
        // from the same value so a button and its label always scale together.
        const diameterPct = (layout.r * 2 * 100);

        const el = document.createElement('div');
        el.style.position       = 'absolute';
        el.style.height         = diameterPct + '%';
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
        el.style.fontSize       = (diameterPct * 0.63) + 'cqh';
        el.style.boxSizing      = 'border-box';
        el.style.pointerEvents  = 'none';
        el.textContent          = layout.label;
        overlay.appendChild(el);
        return el;
    }

    // Lights the button up while it is held so the press is visible, and
    // restores the idle look on release. No-op before the overlay is built.
    _setButtonPressed(name, pressed) {
        if (this._buttonEls === null) {
            return;
        }
        const el = this._buttonEls[name];
        el.style.background  = ((pressed) ? 'rgba(220, 60, 50, 0.6)'  : 'rgba(220, 60, 50, 0.18)');
        el.style.borderColor = ((pressed) ? 'rgba(255, 130, 120, 1)' : 'rgba(220, 60, 50, 0.8)');
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
            this._updateStick(owned, px, py, rect);
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
                this._setButtonPressed(owned.button, false);
                continue;
            }
            this._releaseStick(owned.kind);
        }
    }

    // Assigns a new finger to a control, hit-tested by priority: buttons
    // first, then each stick's fixed base zone. Touches that fall outside
    // everything are ignored (the sticks no longer float to the finger).
    _assignTouch(touch, rect) {
        const w  = rect.width;
        const h  = rect.height;
        const px = touch.clientX - rect.left;
        const py = touch.clientY - rect.top;

        const button = this._hitButton(px, py, w, h);
        if (button !== null) {
            this._buttons[button] = true;
            this._setButtonPressed(button, true);
            this._touches.set(touch.identifier, { kind: 'button', button: button });
            return;
        }

        const stick = this._hitStick(px, py, w, h);
        if (stick !== null) {
            const owned = { kind: stick };
            this._touches.set(touch.identifier, owned);
            this._updateStick(owned, px, py, rect);
        }
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

    // Returns the stick whose fixed base the point falls in (with a forgiving
    // grab margin), or null. The two bases are far apart, so no ambiguity.
    _hitStick(px, py, w, h) {
        const grab = ((h * this._radiusRatio) * 1.4);
        for (const kind in this._stickLayout) {
            const c  = this._stickLayout[kind];
            const dx = px - (c.x * w);
            const dy = py - (c.y * h);
            if (((dx * dx) + (dy * dy)) <= (grab * grab)) {
                return kind;
            }
        }
        return null;
    }

    // Computes the deflection from the fixed center, moves the knob and stores
    // the axes with the engine sign convention (joy1Y forward = up, joy2Y
    // down = down).
    _updateStick(owned, px, py, rect) {
        const c      = this._stickLayout[owned.kind];
        const radius = (rect.height * this._radiusRatio);
        let nx = ((px - (c.x * rect.width)) / radius);
        let ny = ((py - (c.y * rect.height)) / radius);
        const mag = Math.sqrt((nx * nx) + (ny * ny));
        if (mag > 1) {
            nx = nx / mag;
            ny = ny / mag;
        }

        this._setKnob(owned.kind, nx, ny);

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

    // Moves the knob to a normalized deflection (-1..+1 on each axis). The knob
    // is a child of the base, so the offset is expressed in % of the knob size:
    // one base radius equals 1 / 0.45 = 111.11 % of the knob.
    _setKnob(kind, dx, dy) {
        const offset = 111.11;
        const tx = (-50 + (dx * offset));
        const ty = (-50 + (dy * offset));
        this._stickEls[kind].knob.style.transform = ('translate(' + tx + '%, ' + ty + '%)');
    }

    // Releases a stick: axes back to neutral, knob snapped back to the center.
    // The base stays visible (the sticks are permanent).
    _releaseStick(kind) {
        const joy = ((kind === 'move') ? this._joy1 : this._joy2);
        joy.x = 0;
        joy.y = 0;
        this._setKnob(kind, 0, 0);
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
        if (this._buttonEls !== null) {
            for (const name in this._buttonEls) {
                this._setButtonPressed(name, false);
            }
        }
        if (this._stickEls !== null) {
            this._setKnob('move', 0, 0);
            this._setKnob('look', 0, 0);
        }
    }
}
