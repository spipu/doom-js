/**
 * Virtual on-screen gamepad input (touch-only devices).
 *
 * Read through the same API as InputGamepad (stick POSITIONS, not deltas), so
 * the game code never knows which device it talks to.
 *
 * The layout is built for a 4-finger claw grip: the thumbs hold the bottom
 * corners (move, aim/fire — the constant actions), the index fingers the top
 * ones (menu, weapon switch), which is what makes "move + jump" genuinely
 * simultaneous. Jump, crouch and use are stacked on the right edge: all three
 * are pressed while not firing, so the aim thumb is free to reach them.
 *
 * Aim and fire share one gesture: the right half is a floating stick whose
 * LOWER band aims silently and UPPER band aims and fires. The mode is decided
 * on touchstart and LOCKED for the whole gesture, whatever band the finger
 * slides into afterwards — without that lock, aiming down at a low target would
 * cut the shot exactly when it matters (there is no vertical auto-aim).
 *
 * Each finger is tracked by its touch identifier, so moving, aiming and
 * pressing buttons stay independent. Touches are hit-tested buttons FIRST, then
 * the two large zones: a press landing on a button never leaks to the zone
 * underneath it.
 *
 * Three gestures come out of those two sticks — move, aim, aim+fire — and each
 * carries its OWN dead zone (setDeadZone), the firing one also scaling its
 * analog output (setFireSensitivity) so the view turns slower while shooting.
 * The mode being locked at touchstart, the gesture keeps one dead zone from
 * start to release: no discontinuity mid-slide.
 */
class InputVirtualGamepad {
    constructor() {
        this._overlay    = null;
        this._moveStick  = null;   // {base, knob} of the dynamic move stick
        this._aimStick   = null;   // {base, knob} of the floating aim stick
        this._hintEls    = null;   // kind → outline showing where to grab that stick
        this._buttonEls  = null;
        this._visible    = false;

        // Single source for the red control palette (sticks, buttons, bands).
        this._color = {
            stickRing:  'rgba(220, 60, 50, 0.7)',   // stick base outline
            stickFill:  'rgba(220, 60, 50, 0.12)',  // stick base background
            stickKnob:  'rgba(220, 60, 50, 0.55)',  // stick thumb knob
            btnBorder:  'rgba(220, 60, 50, 0.8)',   // button outline, idle
            btnFill:    'rgba(220, 60, 50, 0.18)',  // button background, idle
            btnLabel:   'rgba(255, 220, 210, 0.9)', // button icon
            btnDownBorder: 'rgba(255, 130, 120, 1)', // button outline, pressed
            btnDownFill:   'rgba(220, 60, 50, 0.6)', // button background, pressed
            bandBorder:    'rgba(220, 60, 50, 0.45)', // fire/aim boundary
            hintRing:      'rgba(220, 60, 50, 0.35)'  // resting move-stick hint
        };

        this._joy1    = { x: 0, y: 0 };
        this._joy2    = { x: 0, y: 0 };
        this._buttons = {
            crouch:     false,
            jump:       false,
            action:     false,
            fire:       false,
            pause:      false,
            map:        false,
            weaponNext: false
        };

        // Dead zone per gesture (fraction of the stick travel) and output
        // sensitivity of the firing gesture.
        this._deadZone = {
            move: InputVirtualGamepad.DEAD_ZONE_DEFAULT,
            aim:  InputVirtualGamepad.DEAD_ZONE_DEFAULT,
            fire: InputVirtualGamepad.DEAD_ZONE_DEFAULT
        };
        this._fireSensitivity = 1;

        // The map target ships hidden: unlike jumping and crouching, no game
        // has a map until it asks for one.
        this._buttonAllowed = {jump: true, crouch: true, map: false};

        // touch identifier -> control owned by that finger
        this._touches = new Map();

        this._onTouchStart = this._handleTouchStart.bind(this);
        this._onTouchMove  = this._handleTouchMove.bind(this);
        this._onTouchEnd   = this._handleTouchEnd.bind(this);
    }

    /**
     * Rebuilds the touch overlay into the screen recreated for each level.
     * @param {ScreenManager} screen
     */
    bindScreen(screen) {
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
        return this;
    }

    /**
     * Dead zone of one gesture, as a fraction of the stick travel (0 = none).
     * An unknown kind is ignored, like Inputs.setLookInvertY.
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
     * Takes a button away when the game has nothing for it: a hidden target
     * stops answering touches too, and the state survives the overlay rebuilt
     * for the next level.
     *
     * @param {boolean} allowed
     */
    canJump(allowed) {
        return this._allowButton('jump', allowed);
    }

    canCrouch(allowed) {
        return this._allowButton('crouch', allowed);
    }

    canMap(allowed) {
        return this._allowButton('map', allowed);
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

    readButtonMap() {
        return this._buttons.map;
    }

    // The top-right zone cycles to the next weapon. There is no previous
    // binding on the virtual gamepad.
    readButtonWeaponNext() {
        return this._buttons.weaponNext;
    }

    readButtonWeaponPrev() {
        return false;
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

        this._buildAimBand(overlay);
        this._buildHints(overlay);

        // The sticks are dynamic: their base is placed under the finger on
        // touchstart and hidden again on release.
        this._moveStick = this._createStick(overlay);
        this._aimStick  = this._createStick(overlay);

        this._buttonEls = {};
        for (const name in InputVirtualGamepad.BUTTONS) {
            this._buttonEls[name] = this._createRect(overlay, InputVirtualGamepad.BUTTONS[name]);
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
        const aim   = InputVirtualGamepad.AIM_AREA;
        const split = InputVirtualGamepad.AIM_FIRE_SPLIT;

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
        mark.style.width         = (InputVirtualGamepad.AIM_SPLIT_MARK_WIDTH * 100) + '%';
        mark.style.borderBottom  = '0.4cqh dashed ' + this._color.bandBorder;
        mark.style.pointerEvents = 'none';

        const marker = this._createIconBox('aim', InputVirtualGamepad.AIM_MARK_ICON_SIZE);
        marker.style.position      = 'absolute';
        marker.style.left          = '50%';
        marker.style.bottom        = '0';
        marker.style.transform     = 'translateX(-50%)';
        marker.style.color         = this._color.btnLabel;
        marker.style.pointerEvents = 'none';
        mark.appendChild(marker);

        band.appendChild(mark);
        overlay.appendChild(band);
    }

    // A dynamic stick has no base of its own at rest, which leaves its whole
    // zone looking inert: these outlines say where to grab each one. They step
    // aside while the real base is placed under the finger.
    _buildHints(overlay) {
        this._hintEls = {};
        for (const kind in InputVirtualGamepad.STICK_HINTS) {
            const hint = this._createCircle();
            hint.style.height = (InputVirtualGamepad.STICK_RADIUS_RATIO * 2 * 100) + '%';
            hint.style.left   = (InputVirtualGamepad.STICK_HINTS[kind].x * 100) + '%';
            hint.style.top    = (InputVirtualGamepad.STICK_HINTS[kind].y * 100) + '%';
            hint.style.border = '0.4cqh dashed ' + this._color.hintRing;
            overlay.appendChild(hint);
            this._hintEls[kind] = hint;
        }
    }

    _setHintVisible(kind, visible) {
        if (this._hintEls !== null) {
            this._hintEls[kind].style.display = ((visible) ? 'block' : 'none');
        }
    }

    // Square box holding one icon, its side given in cqh.
    _createIconBox(name, sizeCqh) {
        const box = document.createElement('div');
        box.style.height      = sizeCqh + 'cqh';
        box.style.aspectRatio = '1 / 1';
        box.innerHTML         = InputVirtualGamepad.iconSvg(name);

        return box;
    }

    // Icons are drawn here, never taken from the system font: a font without a
    // text glyph for an emoji renders it in colour (iOS), and the metrics of a
    // glyph differ per platform. currentColor carries the label colour.
    static iconSvg(name) {
        const icon = InputVirtualGamepad.ICONS[name];

        return '<svg viewBox="' + (icon.viewBox ?? '0 0 24 24') + '" width="100%" height="100%"'
            + ' fill="currentColor" aria-hidden="true">' + icon.shapes + '</svg>';
    }

    // The `dashed` variant is the weapon zone: a transparent outline over the
    // HUD's ARMS panel, its icon tucked in a corner so it never sits on the
    // panel's slot numbers. The idle background is stored on the element, since
    // releasing a press has to restore that exact value.
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
        const scale = (layout.iconScale ?? InputVirtualGamepad.ICON_SCALE_DEFAULT);
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
        const diameterPct = (InputVirtualGamepad.STICK_RADIUS_RATIO * 2 * 100);

        const base = this._createCircle();
        base.style.height     = diameterPct + '%';
        base.style.border     = '0.5cqh solid ' + this._color.stickRing;
        base.style.background = this._color.stickFill;
        base.style.display    = 'none';

        const knob = this._createCircle();
        knob.style.height     = (InputVirtualGamepad.KNOB_RATIO * 100) + '%';
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
        const offset = (50 / InputVirtualGamepad.KNOB_RATIO);
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

    // Overlay geometry in the same coordinate space as touch clientX/clientY,
    // corrected for the iOS visual-viewport offset. After a rotation into
    // landscape the Safari toolbar collapses: the visual viewport shifts up by
    // its height (visualViewport.offsetTop becomes negative) but
    // getBoundingClientRect still reports the fixed overlay at its old top, so
    // raw "clientY - rect.top" lands too high. Folding offsetLeft/offsetTop into
    // the rect realigns both; it is a no-op when the offset is 0 (portrait,
    // landscape at launch, desktop).
    _overlayRect() {
        const r  = this._overlay.getBoundingClientRect();
        const vv = window.visualViewport;
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

    // Assigns a new finger to a control, hit-tested by priority: the small
    // targets (buttons, weapon zone) first, then the two large zones — a
    // press landing on a button never reaches the zone underneath.
    _assignTouch(touch, rect) {
        const px = touch.clientX - rect.left;
        const py = touch.clientY - rect.top;
        const nx = px / rect.width;
        const ny = py / rect.height;

        const button = this._hitButton(nx, ny);
        if (button !== null) {
            this._buttons[button] = true;
            this._setButtonPressed(button, true);
            this._touches.set(touch.identifier, { kind: 'button', button: button });
            return;
        }

        // One finger per zone: a second touch inside a zone already owned is
        // ignored rather than stealing the active stick.
        if (this._inArea(InputVirtualGamepad.AIM_AREA, nx, ny) && !this._hasKind('aim')) {
            // The band decides the mode ONCE, here: the gesture keeps it until
            // the finger is lifted, wherever it slides.
            const fire  = (ny < (InputVirtualGamepad.AIM_AREA.y + InputVirtualGamepad.AIM_AREA.h * InputVirtualGamepad.AIM_FIRE_SPLIT));
            const owned = { kind: 'aim', ox: px, oy: py, fire: fire };
            this._touches.set(touch.identifier, owned);
            this._placeStick(this._aimStick, px, py, rect);
            this._setHintVisible('aim', false);
            this._buttons.fire = fire;
            return;
        }

        if (this._inArea(InputVirtualGamepad.MOVE_AREA, nx, ny) && !this._hasKind('move')) {
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
        for (const name in InputVirtualGamepad.BUTTONS) {
            if (this._buttonAllowed[name] === false) {
                continue;
            }
            if (this._inArea(InputVirtualGamepad.BUTTONS[name], nx, ny)) {
                return name;
            }
        }
        return null;
    }

    _allowButton(name, allowed) {
        this._buttonAllowed[name] = (allowed === true);
        this._buttons[name]       = false;
        this._setButtonPressed(name, false);
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

    // Deflection from the finger's OWN origin (both sticks are relative), the
    // knob follows it, and the axes are stored with the engine sign convention
    // (joy1Y forward = up, joy2Y down = down). The firing gesture's OUTPUT is
    // scaled by its sensitivity — the knob keeps following the finger, only the
    // value the game reads is damped.
    _updateStick(owned, px, py, rect) {
        const radius = (rect.height * InputVirtualGamepad.STICK_RADIUS_RATIO);
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
        joy.y = ((isMove) ? -out.y : out.y) * scale;
    }

    // Dead zone of a gesture: the firing gesture is a MODE of the aim stick
    // (locked at touchstart), not a third stick.
    _zoneKey(owned) {
        if (owned.kind === 'move') {
            return 'move';
        }
        return ((owned.fire) ? 'fire' : 'aim');
    }

    // Radial dead zone with rescale, taken from the gesture: the value restarts
    // at 0 on the dead-zone edge and still reaches 1 at full deflection.
    _applyDeadZone(nx, ny, owned) {
        const mag    = Math.min(Math.sqrt((nx * nx) + (ny * ny)), 1);
        const scaled = Inputs.rescaleDeadZone(mag, this._deadZone[this._zoneKey(owned)]);
        if (scaled === 0) {
            return {x: 0, y: 0};
        }
        const factor = scaled / mag;
        return {x: nx * factor, y: ny * factor};
    }

    // Neutralizes every input (used on rebuild and when the overlay is hidden,
    // since hiding fires no touchend for fingers still down).
    _resetState() {
        this._touches.clear();
        this._joy1.x = 0;
        this._joy1.y = 0;
        this._joy2.x = 0;
        this._joy2.y = 0;
        for (const name in this._buttons) {
            this._buttons[name] = false;
        }
        if (this._buttonEls !== null) {
            for (const name in this._buttonEls) {
                this._setButtonPressed(name, false);
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

// --- On-screen layout, in fractions of the letterboxed display ---

// Zone of the dynamic move stick (bottom-left quadrant, left thumb).
InputVirtualGamepad.MOVE_AREA = {x: 0, y: 0.5, w: 0.5, h: 0.5};
// Centre of the outline hinting at each stick while no finger holds it — the
// thumbs' resting spots, symmetric on both edges.
InputVirtualGamepad.STICK_HINTS = {
    move: {x: 0.170, y: 0.698},
    aim:  {x: 0.830, y: 0.698}
};
// Aim zone (right half, right thumb) and the height fraction of it that also
// fires: above the split = aim + fire, below = aim only. 0.498 and not 0.5, so
// its marker keeps the button gap above the column below it.
InputVirtualGamepad.AIM_AREA       = {x: 0.5, y: 0, w: 0.5, h: 1};
InputVirtualGamepad.AIM_FIRE_SPLIT = 0.498;
// Stick radius (fraction of the display height) at which a stick saturates, and
// the knob size as a fraction of the base — _setKnob derives its deflection
// offset from that ratio.
InputVirtualGamepad.STICK_RADIUS_RATIO = 0.12;
InputVirtualGamepad.KNOB_RATIO         = 0.45;
// Default dead zone of every gesture, as a fraction of the stick travel — used
// until the game pushes its own values (setDeadZone).
InputVirtualGamepad.DEAD_ZONE_DEFAULT = 0.15;
// Icon drawings, each centred on its ink centroid inside its 24×24 box — the
// hand's box is offset to achieve it, the symmetrical ones need nothing.
InputVirtualGamepad.ICONS = {
    jump:   {shapes: '<path d="M12 3 L18.6 11.2 H14.7 V20.6 H9.3 V11.2 H5.4 Z"/>'},
    crouch: {shapes: '<path d="M12 21 L5.4 12.8 H9.3 V3.4 H14.7 V12.8 H18.6 Z"/>'},
    menu:   {shapes: '<rect x="4" y="6.2" width="16" height="2.6" rx="1.3"/>'
                   + '<rect x="4" y="10.7" width="16" height="2.6" rx="1.3"/>'
                   + '<rect x="4" y="15.2" width="16" height="2.6" rx="1.3"/>'},
    action: {viewBox: '-0.22 -0.58 24 24',
             shapes: '<rect x="7.0" y="2.0" width="2.9" height="9.6" rx="1.45" transform="rotate(-8 8.45 11.6)"/>'
                   + '<rect x="10.0" y="1.2" width="2.9" height="9.8" rx="1.45" transform="rotate(-1.5 11.45 11.6)"/>'
                   + '<rect x="13.05" y="2.0" width="2.9" height="9.0" rx="1.45" transform="rotate(4.5 14.5 11.6)"/>'
                   + '<rect x="16.2" y="4.0" width="2.7" height="7.6" rx="1.35" transform="rotate(10 17.55 11.6)"/>'
                   + '<rect x="4.2" y="9.6" width="2.9" height="7.4" rx="1.45" transform="rotate(-37 5.65 17)"/>'
                   + '<rect x="6.6" y="11.4" width="12.4" height="8.6" rx="3.6"/>'},
    weapon: {shapes: '<rect x="3.5" y="7.4" width="13" height="2.5" rx="1.25"/>'
                   + '<path d="M15.8 4.9 L21.2 8.65 L15.8 12.4 Z"/>'
                   + '<rect x="7.5" y="14.1" width="13" height="2.5" rx="1.25"/>'
                   + '<path d="M8.2 11.6 L2.8 15.35 L8.2 19.1 Z"/>'},
    aim:    {shapes: '<circle cx="12" cy="12" r="5.6" fill="none" stroke="currentColor" stroke-width="1.5"/>'
                   + '<path d="M12 1.5 V22.5 M1.5 12 H22.5" fill="none" stroke="currentColor" stroke-width="1.5"/>'},
    // Strokes and not a filled shape: the creases would vanish into the fill.
    map:    {shapes: '<path d="M3.2 6.2 L9 4.4 L15 6.6 L20.8 4.6 V17.8 L15 19.8 L9 17.6 L3.2 19.6 Z"'
                   + ' fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>'
                   + '<path d="M9 4.4 V17.6 M15 6.6 V19.8" fill="none" stroke="currentColor" stroke-width="1.4"/>'}
};

// Icon side as a fraction of its button's height, and the height of the
// aim/fire split marker's own icon in cqh (it has no button).
InputVirtualGamepad.ICON_SCALE_DEFAULT = 0.5;
InputVirtualGamepad.AIM_MARK_ICON_SIZE = 5.5;

// Rectangular targets, hit-tested in declaration order, all four buttons the
// same size. The right column (jump, crouch, use) sits as low as the HUD
// allows: below it the ammo block starts at y 0.86. Menu clears the counters
// block, which ends at y 0.18; the weapon zone is drawn dashed over the ARMS
// panel (one tap = next weapon).
InputVirtualGamepad.BUTTONS = {
    pause:      {x: 0.128, y: 0.020, w: 0.079, h: 0.112, icon: 'menu'},
    // Right of the menu: on its left it would sit on the HUD's keys / secrets /
    // kills block.
    map:        {x: 0.216, y: 0.020, w: 0.079, h: 0.112, icon: 'map'},
    jump:       {x: 0.902, y: 0.506, w: 0.079, h: 0.112, icon: 'jump'},
    crouch:     {x: 0.902, y: 0.626, w: 0.079, h: 0.112, icon: 'crouch'},
    action:     {x: 0.902, y: 0.746, w: 0.079, h: 0.112, icon: 'action'},
    weaponNext: {x: 0.700, y: 0.000, w: 0.300, h: 0.150, icon: 'weapon', dashed: true, iconScale: 0.28}
};

InputVirtualGamepad.COLUMN_EDGE_MARGIN = 1 - (InputVirtualGamepad.BUTTONS.action.x + InputVirtualGamepad.BUTTONS.action.w);
// Dash marking the aim/fire split, as a fraction of the aim zone width: from
// the screen edge to one column margin left of the buttons, so it frames them
// instead of reading as scenery — which a full-width rule does.
InputVirtualGamepad.AIM_SPLIT_MARK_WIDTH =
    (1 - (InputVirtualGamepad.BUTTONS.action.x - InputVirtualGamepad.COLUMN_EDGE_MARGIN)) / InputVirtualGamepad.AIM_AREA.w;
