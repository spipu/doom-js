/**
 * Virtual on-screen gamepad (touch devices): a dynamic move stick, a floating
 * aim stick whose upper band can also fire, and rectangular buttons, all laid
 * out by the page in fractions of the display it is bound to.
 *
 * Aim and fire share one gesture: the aim zone is a floating stick whose
 * LOWER band aims silently and UPPER band aims and fires. The mode is decided
 * on touchstart and LOCKED for the whole gesture, whatever band the finger
 * slides into afterwards — without that lock, aiming down at a low target would
 * cut the shot exactly when it matters.
 *
 * Each finger is tracked by its touch identifier, so moving, aiming and
 * pressing buttons stay independent. Touches are hit-tested buttons FIRST, then
 * the two large zones: a press landing on a button never leaks to the zone
 * underneath it.
 *
 * Three gestures come out of those two sticks — move, aim, aim+fire — and each
 * carries its OWN dead zone (setDeadZone), the firing one also scaling its
 * analog output (setFireSensitivity). The mode being locked at touchstart, the
 * gesture keeps one dead zone from start to release: no discontinuity mid-slide.
 *
 * Layout ({...} of the constructor), every position and size in fractions of
 * the display:
 *   moveArea, aimArea   {x, y, w, h}, null or left out for no such stick
 *   aimFireSplit        height fraction of aimArea that also fires, null or left out for no fire band
 *   aimSplitMarkWidth   width of the split marker, fraction of aimArea
 *   aimMarkIcon         icon name drawn on the split marker
 *   stickHints          {move: {x, y}, aim: {x, y}}, resting outline of each stick
 *   stickRadius         finger travel to a full deflection, fraction of the display height (both sticks); a
 *                       larger stick gives a finer control
 *   buttons             {name: {x, y, w, h, icon, toggle?, dashed?, iconScale?, allowed?}},
 *                       hit-tested in declaration order; `allowed: false` ships hidden
 *   icons               {name: {viewBox?, shapes}}, SVG drawings in a 24×24 box
 *   colors              optional overrides of AppInputVirtualGamepad.COLORS
 * Every key but the ones a page uses may be left out.
 */
class AppInputVirtualGamepad {
    /**
     * @param {object} layout - see the class comment
     */
    constructor(layout) {
        this._layout     = Object.assign({}, AppInputVirtualGamepad.EMPTY_LAYOUT, layout);
        this._overlay    = null;
        this._moveStick  = null;   // {base, knob} of the dynamic move stick
        this._aimStick   = null;   // {base, knob} of the floating aim stick
        this._hintEls    = null;   // kind → outline showing where to grab that stick
        this._buttonEls  = null;
        this._visible    = false;

        // Its own copy of the buttons: placeButton never writes the table the page handed over.
        this._layout.buttons = Object.fromEntries(Object.entries(this._layout.buttons).map(([name, button]) => [name, Object.assign({}, button)]));

        this._color      = Object.assign({}, AppInputVirtualGamepad.COLORS, this._layout.colors);

        this._joy1    = { x: 0, y: 0 };
        this._joy2    = { x: 0, y: 0 };
        this._buttons = {fire: false};
        for (const name in this._layout.buttons) {
            this._buttons[name] = false;
        }

        // Dead zone per gesture (fraction of the stick travel) and output
        // sensitivity of the firing gesture.
        this._deadZone = {
            move: AppInputVirtualGamepad.DEAD_ZONE_DEFAULT,
            aim:  AppInputVirtualGamepad.DEAD_ZONE_DEFAULT,
            fire: AppInputVirtualGamepad.DEAD_ZONE_DEFAULT
        };
        this._fireSensitivity = 1;

        this._buttonAllowed = {};
        for (const name in this._layout.buttons) {
            this._buttonAllowed[name] = (this._layout.buttons[name].allowed !== false);
        }
        // Fire is the aim stick's upper band, not a button: withdrawn on its own.
        this._fireAllowed  = ((this._layout.aimArea !== null) && (this._layout.aimFireSplit !== null));
        this._stickAllowed = {move: (this._layout.moveArea !== null), aim: (this._layout.aimArea !== null)};
        this._aimBandEl   = null;

        // touch identifier -> control owned by that finger
        this._touches = new Map();

        this._onTouchStart = this._handleTouchStart.bind(this);
        this._onTouchMove  = this._handleTouchMove.bind(this);
        this._onTouchEnd   = this._handleTouchEnd.bind(this);
    }

    /**
     * Rebuilds the touch overlay into the display (a page that replaces its
     * display binds the new one).
     * @param {HTMLElement} display
     */
    bindDisplay(display) {
        this._buildOverlay(display);
        this.setVisible(this._visible);
        return this;
    }

    /**
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
        return this;
    }

    /**
     * Dead zone of one gesture, as a fraction of the stick travel (0 = none).
     * An unknown kind is ignored.
     *
     * @param {string} kind     'move' | 'aim' | 'fire'
     * @param {number} fraction 0..1
     */
    setDeadZone(kind, fraction) {
        if (this._deadZone[kind] !== undefined) {
            this._deadZone[kind] = fraction;
        }
        return this;
    }

    /**
     * Output sensitivity of the FIRING gesture: its analog value is scaled by
     * this factor, so the view turns slower while shooting and the aim stays
     * fine (1 = same speed as the silent aim gesture). Nothing else is
     * affected — the knob still follows the finger, and the aim and move
     * gestures keep their full output.
     *
     * @param {number} factor 0..1
     */
    setFireSensitivity(factor) {
        this._fireSensitivity = factor;
        return this;
    }

    /**
     * Takes a control away when the page has nothing for it: it stops
     * answering touches and stops being drawn. Survives the overlay rebuild.
     * A withdrawn stick or fire band cannot come back without its zone.
     *
     * @param {string}  control a button name, 'fire', 'move' or 'aim'
     * @param {boolean} allowed
     */
    allowControl(control, allowed) {
        if (control === 'fire') {
            return this._allowFire(allowed);
        }
        if (this._stickAllowed[control] !== undefined) {
            return this._allowStick(control, allowed);
        }
        if (this._buttonAllowed[control] === undefined) {
            return this;
        }

        return this._allowButton(control, allowed);
    }

    /**
     * Moves a button of the layout (its top left corner, in fractions of the
     * display), so that a page lays it out its own way. Survives the overlay
     * rebuild; an unknown button is ignored.
     *
     * @param {string} name
     * @param {number} x
     * @param {number} y
     */
    placeButton(name, x, y) {
        const button = this._layout.buttons[name];
        if (button === undefined) {
            return this;
        }
        button.x = x;
        button.y = y;
        if (this._buttonEls !== null) {
            this._buttonEls[name].style.left = (x * 100) + '%';
            this._buttonEls[name].style.top  = (y * 100) + '%';
        }

        return this;
    }

    // Stick deflections, -1..+1, screen convention (right and down positive).
    readMoveX() {
        return this._joy1.x;
    }

    readMoveY() {
        return this._joy1.y;
    }

    readAimX() {
        return this._joy2.x;
    }

    readAimY() {
        return this._joy2.y;
    }

    // True while held, or while switched on for a toggle.
    readButton(name) {
        return (this._buttons[name] === true);
    }

    // True while the aim stick is held in its fire band.
    readFire() {
        return this._buttons.fire;
    }

    // --- DOM ---

    _buildOverlay(display) {
        this._resetState();

        const overlay = document.createElement('div');
        overlay.style.position      = 'absolute';
        overlay.style.top           = '0';
        overlay.style.left          = '0';
        overlay.style.width         = '100%';
        overlay.style.height        = '100%';
        overlay.style.zIndex        = '10';
        overlay.style.touchAction   = 'none';
        overlay.style.userSelect    = 'none';
        // Container reference so every target and icon sizes against the
        // display height (cqh), staying coherent in letterbox.
        overlay.style.containerType = 'size';

        if ((this._layout.aimArea !== null) && (this._layout.aimFireSplit !== null)) {
            this._buildAimBand(overlay);
        }
        this._buildHints(overlay);

        // The sticks are dynamic: their base is placed under the finger on
        // touchstart and hidden again on release.
        this._moveStick = this._createStick(overlay);
        this._aimStick  = this._createStick(overlay);

        this._buttonEls = {};
        for (const name in this._layout.buttons) {
            this._buttonEls[name] = this._createRect(overlay, this._layout.buttons[name]);
            this._setButtonPressed(name, this._buttons[name]);
        }
        for (const name in this._buttonAllowed) {
            this._applyButtonAllowed(name);
        }

        overlay.addEventListener('touchstart',  this._onTouchStart, { passive: false });
        overlay.addEventListener('touchmove',   this._onTouchMove,  { passive: false });
        overlay.addEventListener('touchend',    this._onTouchEnd,   { passive: false });
        overlay.addEventListener('touchcancel', this._onTouchEnd,   { passive: false });

        display.appendChild(overlay);
        this._overlay = overlay;
    }

    // The fire band marker: the boundary between "aim" and "aim + fire" is
    // invisible by nature, so it gets an icon and a short dash at its right end
    // — without them a player cannot tell why a shot goes off sometimes only.
    // No fill and no full-width rule: over half the screen, either veils the
    // scene.
    _buildAimBand(overlay) {
        const aim   = this._layout.aimArea;
        const split = this._layout.aimFireSplit;

        const band = document.createElement('div');
        band.style.position      = 'absolute';
        band.style.left          = (aim.x * 100) + '%';
        band.style.top           = (aim.y * 100) + '%';
        band.style.width         = (aim.w * 100) + '%';
        band.style.height        = (aim.h * split * 100) + '%';
        band.style.boxSizing     = 'border-box';
        band.style.pointerEvents = 'none';

        const mark = document.createElement('div');
        mark.style.position      = 'absolute';
        mark.style.right         = '0';
        mark.style.bottom        = '0';
        mark.style.width         = (this._layout.aimSplitMarkWidth * 100) + '%';
        mark.style.borderBottom  = '0.4cqh dashed ' + this._color.bandBorder;
        mark.style.pointerEvents = 'none';

        const marker = this._createIconBox(this._layout.aimMarkIcon, AppInputVirtualGamepad.AIM_MARK_ICON_SIZE);
        marker.style.position      = 'absolute';
        marker.style.left          = '50%';
        marker.style.bottom        = '0';
        marker.style.transform     = 'translateX(-50%)';
        marker.style.color         = this._color.btnLabel;
        marker.style.pointerEvents = 'none';
        mark.appendChild(marker);

        band.appendChild(mark);
        overlay.appendChild(band);
        this._aimBandEl = band;
        this._applyFireAllowed();
    }

    // A dynamic stick has no base of its own at rest, which leaves its whole
    // zone looking inert: these outlines say where to grab each one. They step
    // aside while the real base is placed under the finger.
    _buildHints(overlay) {
        this._hintEls = {};
        for (const kind in this._layout.stickHints) {
            const hint = this._createCircle();
            hint.style.height = (this._layout.stickRadius * 2 * 100) + '%';
            hint.style.left   = (this._layout.stickHints[kind].x * 100) + '%';
            hint.style.top    = (this._layout.stickHints[kind].y * 100) + '%';
            hint.style.border = '0.4cqh dashed ' + this._color.hintRing;
            overlay.appendChild(hint);
            this._hintEls[kind] = hint;
            this._setHintVisible(kind, true);
        }
    }

    // A withdrawn stick shows no outline either.
    _setHintVisible(kind, visible) {
        if ((this._hintEls !== null) && (this._hintEls[kind] !== undefined)) {
            this._hintEls[kind].style.display = ((visible && this._stickAllowed[kind]) ? 'block' : 'none');
        }
    }

    // Square box holding one icon, its side given in cqh.
    _createIconBox(name, sizeCqh) {
        const box = document.createElement('div');
        box.style.height      = sizeCqh + 'cqh';
        box.style.aspectRatio = '1 / 1';
        box.innerHTML         = this._iconSvg(name);

        return box;
    }

    // Icons are drawn here, never taken from the system font: a font without a
    // text glyph for an emoji renders it in colour (iOS), and the metrics of a
    // glyph differ per platform. currentColor carries the label colour.
    _iconSvg(name) {
        const icon = this._layout.icons[name];

        return '<svg viewBox="' + (icon.viewBox ?? '0 0 24 24') + '" width="100%" height="100%"'
            + ' fill="currentColor" aria-hidden="true">' + icon.shapes + '</svg>';
    }

    // The `dashed` variant is a zone laid over something the page draws (a HUD
    // panel): a transparent outline, its icon tucked in a corner. The idle
    // background is stored on the element, since releasing a press has to
    // restore that exact value.
    _createRect(overlay, layout) {
        const dashed = (layout.dashed === true);
        const el = document.createElement('div');
        el.style.position       = 'absolute';
        el.style.left           = (layout.x * 100) + '%';
        el.style.top            = (layout.y * 100) + '%';
        el.style.width          = (layout.w * 100) + '%';
        el.style.height         = (layout.h * 100) + '%';
        el.style.boxSizing      = 'border-box';
        el.style.border         = '0.5cqh ' + ((dashed) ? 'dashed' : 'solid') + ' ' + this._color.btnBorder;
        el.style.borderRadius   = ((dashed) ? '3cqh' : '2.5cqh');
        el.style.background     = ((dashed) ? 'transparent' : this._color.btnFill);
        el.style.color          = this._color.btnLabel;
        el.style.display        = 'flex';
        el.style.alignItems     = ((dashed) ? 'flex-end' : 'center');
        el.style.justifyContent = ((dashed) ? 'flex-start' : 'center');
        el.style.padding        = ((dashed) ? '1.5cqh' : '0');
        el.style.pointerEvents  = 'none';
        const scale = (layout.iconScale ?? AppInputVirtualGamepad.ICON_SCALE_DEFAULT);
        el.appendChild(this._createIconBox(layout.icon, scale * layout.h * 100));
        el.dataset.idleBackground = el.style.background;
        overlay.appendChild(el);
        return el;
    }

    _createCircle() {
        const el = document.createElement('div');
        el.style.position      = 'absolute';
        el.style.aspectRatio   = '1 / 1';
        el.style.transform     = 'translate(-50%, -50%)';
        el.style.borderRadius  = '50%';
        el.style.boxSizing     = 'border-box';
        el.style.pointerEvents = 'none';
        return el;
    }

    // The knob is a CHILD of the base, so its deflection is expressed in % of
    // the base — no pixel math to render. Hidden until a finger places it.
    _createStick(overlay) {
        const diameterPct = (this._layout.stickRadius * 2 * 100);

        const base = this._createCircle();
        base.style.height     = diameterPct + '%';
        base.style.border     = '0.5cqh solid ' + this._color.stickRing;
        base.style.background = this._color.stickFill;
        base.style.display    = 'none';

        const knob = this._createCircle();
        knob.style.height     = (AppInputVirtualGamepad.KNOB_RATIO * 100) + '%';
        knob.style.left       = '50%';
        knob.style.top        = '50%';
        knob.style.background = this._color.stickKnob;

        base.appendChild(knob);
        overlay.appendChild(base);
        return { base: base, knob: knob };
    }

    // Pixel coordinates go back to % so the letterbox scaling applies.
    _placeStick(stick, px, py, rect) {
        stick.base.style.left    = ((px / rect.width) * 100) + '%';
        stick.base.style.top     = ((py / rect.height) * 100) + '%';
        stick.base.style.display = 'block';
        this._setKnob(stick, 0, 0);
    }

    _hideStick(stick) {
        stick.base.style.display = 'none';
        this._setKnob(stick, 0, 0);
    }

    // dx/dy are normalized (-1..+1). A full deflection is one base RADIUS, i.e.
    // half the base diameter, which the knob expresses in % of its own size.
    _setKnob(stick, dx, dy) {
        const offset = (50 / AppInputVirtualGamepad.KNOB_RATIO);
        const tx = (-50 + (dx * offset));
        const ty = (-50 + (dy * offset));
        stick.knob.style.transform = ('translate(' + tx + '%, ' + ty + '%)');
    }

    // No-op before the overlay is built.
    _setButtonPressed(name, pressed) {
        if (this._buttonEls === null) {
            return;
        }
        const el = this._buttonEls[name];
        el.style.background  = ((pressed) ? this._color.btnDownFill : el.dataset.idleBackground);
        el.style.borderColor = ((pressed) ? this._color.btnDownBorder : this._color.btnBorder);
    }

    // --- Touch handling ---

    // Touch coordinates drift from getBoundingClientRect once iOS Safari's
    // toolbar collapses after a rotation: the visual-viewport offset realigns them.
    _overlayRect() {
        const r    = this._overlay.getBoundingClientRect();
        const vv   = window.visualViewport;
        const offX = ((vv) ? vv.offsetLeft : 0);
        const offY = ((vv) ? vv.offsetTop  : 0);
        return { left: (r.left + offX), top: (r.top + offY), width: r.width, height: r.height };
    }

    _handleTouchStart(event) {
        event.preventDefault();
        const rect = this._overlayRect();
        for (const touch of event.changedTouches) {
            this._assignTouch(touch, rect);
        }
    }

    _handleTouchMove(event) {
        event.preventDefault();
        const rect = this._overlayRect();
        for (const touch of event.changedTouches) {
            const owned = this._touches.get(touch.identifier);
            if ((owned === undefined) || ((owned.kind !== 'move') && (owned.kind !== 'aim'))) {
                continue;
            }
            this._updateStick(owned, (touch.clientX - rect.left), (touch.clientY - rect.top), rect);
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
            this._releaseControl(owned);
        }
    }

    _releaseControl(owned) {
        if (owned.kind === 'toggle') {
            return;
        }
        if (owned.kind === 'button') {
            this._buttons[owned.button] = false;
            this._setButtonPressed(owned.button, false);
            return;
        }
        if (owned.kind === 'move') {
            this._joy1.x = 0;
            this._joy1.y = 0;
            this._hideStick(this._moveStick);
            this._setHintVisible('move', true);
            return;
        }
        this._joy2.x = 0;
        this._joy2.y = 0;
        this._hideStick(this._aimStick);
        this._setHintVisible('aim', true);
        if (owned.fire) {
            this._buttons.fire = false;
        }
    }

    // Assigns a new finger to a control, hit-tested by priority: the buttons
    // first, then the two large zones — a press landing on a button never
    // reaches the zone underneath.
    _assignTouch(touch, rect) {
        const px = touch.clientX - rect.left;
        const py = touch.clientY - rect.top;
        const nx = px / rect.width;
        const ny = py / rect.height;

        const button = this._hitButton(nx, ny);
        if ((button !== null) && (this._layout.buttons[button].toggle === true)) {
            this._buttons[button] = !this._buttons[button];
            this._setButtonPressed(button, this._buttons[button]);
            this._touches.set(touch.identifier, { kind: 'toggle', button: button });
            return;
        }
        if (button !== null) {
            this._buttons[button] = true;
            this._setButtonPressed(button, true);
            this._touches.set(touch.identifier, { kind: 'button', button: button });
            return;
        }

        // One finger per zone: a second touch inside a zone already owned is
        // ignored rather than stealing the active stick.
        const aim = this._layout.aimArea;
        if (this._stickAllowed.aim && this._inArea(aim, nx, ny) && !this._hasKind('aim')) {
            // The band decides the mode ONCE, here: the gesture keeps it until
            // the finger is lifted, wherever it slides.
            const fire  = (this._fireAllowed
                && (ny < (aim.y + aim.h * this._layout.aimFireSplit)));
            const owned = { kind: 'aim', ox: px, oy: py, fire: fire };
            this._touches.set(touch.identifier, owned);
            this._placeStick(this._aimStick, px, py, rect);
            this._setHintVisible('aim', false);
            this._buttons.fire = fire;
            return;
        }

        if (this._stickAllowed.move && this._inArea(this._layout.moveArea, nx, ny) && !this._hasKind('move')) {
            const owned = { kind: 'move', ox: px, oy: py, fire: false };
            this._touches.set(touch.identifier, owned);
            this._placeStick(this._moveStick, px, py, rect);
            this._setHintVisible('move', false);
        }
    }

    _hasKind(kind) {
        for (const owned of this._touches.values()) {
            if (owned.kind === kind) {
                return true;
            }
        }
        return false;
    }

    _inArea(area, nx, ny) {
        return ((nx >= area.x) && (nx <= (area.x + area.w))
            && (ny >= area.y) && (ny <= (area.y + area.h)));
    }

    _hitButton(nx, ny) {
        for (const name in this._layout.buttons) {
            if (this._buttonAllowed[name] === false) {
                continue;
            }
            if (this._inArea(this._layout.buttons[name], nx, ny)) {
                return name;
            }
        }
        return null;
    }

    // Granting again leaves the button as it is: only a withdrawal lets go of
    // it, so a toggle keeps its state when the page grants it anew.
    _allowButton(name, allowed) {
        this._buttonAllowed[name] = (allowed === true);
        if (!this._buttonAllowed[name]) {
            this._buttons[name] = false;
            this._setButtonPressed(name, false);
        }
        this._applyButtonAllowed(name);

        return this;
    }

    // Visibility rather than display: the target keeps the geometry the
    // (DOM-independent) hit test reads, so the two never disagree.
    _applyButtonAllowed(name) {
        if (this._buttonEls === null) {
            return;
        }
        this._buttonEls[name].style.visibility = ((this._buttonAllowed[name]) ? 'visible' : 'hidden');
    }

    _allowFire(allowed) {
        this._fireAllowed  = ((allowed === true) && (this._layout.aimFireSplit !== null));
        this._buttons.fire = false;
        // The mode is locked at touchstart, so a gesture in flight would keep
        // the fire dead zone and its damped output until the finger lifts.
        for (const owned of this._touches.values()) {
            if (owned.kind === 'aim') {
                owned.fire = false;
            }
        }
        this._applyFireAllowed();

        return this;
    }

    // The band marks a mode of the aim stick: it goes with the stick too.
    _applyFireAllowed() {
        if (this._aimBandEl !== null) {
            this._aimBandEl.style.visibility = ((this._fireAllowed && this._stickAllowed.aim) ? 'visible' : 'hidden');
        }
    }

    // A finger holding a withdrawn stick lets go of it at once.
    _allowStick(kind, allowed) {
        this._stickAllowed[kind] = ((allowed === true) && (this._layout[kind + 'Area'] !== null));
        if (!this._stickAllowed[kind]) {
            for (const [identifier, owned] of this._touches) {
                if (owned.kind === kind) {
                    this._touches.delete(identifier);
                    this._releaseControl(owned);
                }
            }
        }
        this._setHintVisible(kind, !this._hasKind(kind));
        this._applyFireAllowed();

        return this;
    }

    // Deflection from the finger's OWN origin (both sticks are relative), the
    // knob follows it. The firing gesture's OUTPUT is scaled by its
    // sensitivity — the knob keeps following the finger, only the value the
    // page reads is damped.
    _updateStick(owned, px, py, rect) {
        const radius = (rect.height * this._layout.stickRadius);
        let nx = ((px - owned.ox) / radius);
        let ny = ((py - owned.oy) / radius);
        const mag = Math.sqrt((nx * nx) + (ny * ny));
        if (mag > 1) {
            nx = nx / mag;
            ny = ny / mag;
        }

        const isMove = (owned.kind === 'move');
        this._setKnob(((isMove) ? this._moveStick : this._aimStick), nx, ny);

        const out   = this._applyDeadZone(nx, ny, owned);
        const scale = ((owned.fire) ? this._fireSensitivity : 1);
        const joy   = ((isMove) ? this._joy1 : this._joy2);
        joy.x = out.x * scale;
        joy.y = out.y * scale;
    }

    // The firing gesture is a mode of the aim stick, not a third stick.
    _deadZoneKey(owned) {
        if (owned.kind === 'move') {
            return 'move';
        }
        return ((owned.fire) ? 'fire' : 'aim');
    }

    _applyDeadZone(nx, ny, owned) {
        const mag    = Math.min(Math.sqrt((nx * nx) + (ny * ny)), 1);
        const scaled = AppInputGamepad.rescaleDeadZone(mag, this._deadZone[this._deadZoneKey(owned)]);
        if (scaled === 0) {
            return {x: 0, y: 0};
        }
        const factor = scaled / mag;
        return {x: nx * factor, y: ny * factor};
    }

    // Neutralizes every input but the toggles (used on rebuild and when the
    // overlay is hidden, since hiding fires no touchend for fingers still down).
    _resetState() {
        this._touches.clear();
        this._joy1.x = 0;
        this._joy1.y = 0;
        this._joy2.x = 0;
        this._joy2.y = 0;
        for (const name in this._buttons) {
            if (this._layout.buttons[name]?.toggle !== true) {
                this._buttons[name] = false;
            }
        }
        if (this._buttonEls !== null) {
            for (const name in this._buttonEls) {
                this._setButtonPressed(name, this._buttons[name]);
            }
        }
        if (this._moveStick !== null) {
            this._hideStick(this._moveStick);
        }
        if (this._aimStick !== null) {
            this._hideStick(this._aimStick);
        }
        if (this._hintEls !== null) {
            for (const kind in this._hintEls) {
                this._setHintVisible(kind, true);
            }
        }
    }
}

// Default stick radius (fraction of the display height) at which a stick saturates, and
// the knob size as a fraction of the base — _setKnob derives its deflection
// offset from that ratio.
AppInputVirtualGamepad.STICK_RADIUS_RATIO = 0.12;
AppInputVirtualGamepad.KNOB_RATIO         = 0.45;
// Default dead zone of every gesture, as a fraction of the stick travel — used
// until the page pushes its own values (setDeadZone).
AppInputVirtualGamepad.DEAD_ZONE_DEFAULT = 0.15;
// Icon side as a fraction of its button's height, and the height of the
// aim/fire split marker's own icon in cqh (it has no button).
AppInputVirtualGamepad.ICON_SCALE_DEFAULT = 0.5;
AppInputVirtualGamepad.AIM_MARK_ICON_SIZE = 5.5;
AppInputVirtualGamepad.EMPTY_LAYOUT = {
    moveArea:          null,
    aimArea:           null,
    aimFireSplit:      null,
    aimSplitMarkWidth: 0,
    aimMarkIcon:       null,
    stickHints:        {},
    stickRadius:       AppInputVirtualGamepad.STICK_RADIUS_RATIO,
    buttons:           {},
    icons:             {},
    colors:            {}
};
AppInputVirtualGamepad.COLORS = {
    stickRing:     'rgba(220, 60, 50, 0.7)',   // stick base outline
    stickFill:     'rgba(220, 60, 50, 0.12)',  // stick base background
    stickKnob:     'rgba(220, 60, 50, 0.55)',  // stick thumb knob
    btnBorder:     'rgba(220, 60, 50, 0.8)',   // button outline, idle
    btnFill:       'rgba(220, 60, 50, 0.18)',  // button background, idle
    btnLabel:      'rgba(255, 220, 210, 0.9)', // button icon
    btnDownBorder: 'rgba(255, 130, 120, 1)',   // button outline, pressed
    btnDownFill:   'rgba(220, 60, 50, 0.6)',   // button background, pressed
    bandBorder:    'rgba(220, 60, 50, 0.45)',  // fire/aim boundary
    hintRing:      'rgba(220, 60, 50, 0.35)'   // resting stick hint
};
