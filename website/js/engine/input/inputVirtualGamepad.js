/**
 * The virtual on-screen gamepad as an FPS controller: the engine layout laid
 * over the page's AppInputVirtualGamepad, read through the same API as
 * InputGamepad (stick POSITIONS, not deltas), so the game code never knows
 * which device it talks to.
 *
 * The layout is built for a 4-finger claw grip: the thumbs hold the bottom
 * corners (move, aim/fire — the constant actions), the index fingers the top
 * ones (menu, map, run, weapon switch), which is what makes "move + jump"
 * genuinely simultaneous. Run is a toggle: with both thumbs on the sticks, no
 * finger is left to hold it. Jump, crouch and use are stacked on the right
 * edge: all three are pressed while not firing, so the aim thumb is free to
 * reach them. There is no vertical auto-aim, hence the fire band locked for
 * the whole gesture.
 */
class InputVirtualGamepad {
    constructor() {
        this._pad = new AppInputVirtualGamepad(InputVirtualGamepad.LAYOUT);
    }

    /**
     * Rebuilds the touch overlay into the screen recreated for each level.
     * @param {ScreenManager} screen
     */
    bindScreen(screen) {
        this._pad.bindDisplay(screen.getDisplay());
        return this;
    }

    // Driven by Inputs: only the active virtualGamepad mode shows the controls.
    setVisible(visible) {
        this._pad.setVisible(visible);
        return this;
    }

    /**
     * @param {string} kind     'move' | 'aim' | 'fire'
     * @param {number} fraction 0..1
     */
    setDeadZone(kind, fraction) {
        this._pad.setDeadZone(kind, fraction);
        return this;
    }

    setFireSensitivity(factor) {
        this._pad.setFireSensitivity(factor);
        return this;
    }

    /**
     * @param {string}  control 'jump' | 'crouch' | 'action' | 'pause' |
     *                          'weaponNext' | 'map' | 'run' | 'fire' | 'move' | 'aim'
     * @param {boolean} allowed
     */
    allowControl(control, allowed) {
        this._pad.allowControl(control, allowed);
        return this;
    }

    /**
     * Moves a button away from the engine layout (top left corner, fractions
     * of the screen).
     *
     * @param {string} control a name of InputVirtualGamepad.BUTTONS
     * @param {number} x
     * @param {number} y
     */
    placeButton(control, x, y) {
        this._pad.placeButton(control, x, y);
        return this;
    }

    readJoy1X() {
        return this._pad.readMoveX();
    }

    // Finger up is forward, +1 in the engine convention.
    readJoy1Y() {
        return -this._pad.readMoveY();
    }

    readJoy2X() {
        return this._pad.readAimX();
    }

    readJoy2Y() {
        return this._pad.readAimY();
    }

    readButtonJump() {
        return this._pad.readButton('jump');
    }

    readButtonAction() {
        return this._pad.readButton('action');
    }

    readButtonCrouch() {
        return this._pad.readButton('crouch');
    }

    readButtonFire() {
        return this._pad.readFire();
    }

    readButtonPause() {
        return this._pad.readButton('pause');
    }

    readButtonMap() {
        return this._pad.readButton('map');
    }

    readButtonRun() {
        return this._pad.readButton('run');
    }

    // The top-right zone cycles to the next weapon. There is no previous
    // binding on the virtual gamepad.
    readButtonWeaponNext() {
        return this._pad.readButton('weaponNext');
    }

    readButtonWeaponPrev() {
        return false;
    }
}

// --- On-screen layout, in fractions of the letterboxed display ---

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
                   + '<path d="M9 4.4 V17.6 M15 6.6 V19.8" fill="none" stroke="currentColor" stroke-width="1.4"/>'},
    run:    {shapes: '<path d="M4.2 5 L11.4 12 L4.2 19 H8.6 L15.8 12 L8.6 5 Z"/>'
                   + '<path d="M10.6 5 L17.8 12 L10.6 19 H15 L22.2 12 L15 5 Z"/>'}
};

// All the buttons the same size; run is a toggle. The right column (jump,
// crouch, use) sits as low as the HUD allows: below it the ammo block starts at
// y 0.86. Menu clears the counters block, which ends at y 0.18; the weapon zone
// is drawn dashed over the ARMS panel (one tap = next weapon), its icon tucked
// in a corner so it never sits on the panel's slot numbers. The map and run
// ship hidden: unlike the others, no game has them until it asks.
InputVirtualGamepad.BUTTONS = {
    pause:      {x: 0.128, y: 0.020, w: 0.079, h: 0.112, icon: 'menu'},
    // Right of the menu: on its left it would sit on the HUD's keys / secrets /
    // kills block.
    map:        {x: 0.216, y: 0.020, w: 0.079, h: 0.112, icon: 'map', allowed: false},
    run:        {x: 0.304, y: 0.020, w: 0.079, h: 0.112, icon: 'run', toggle: true, allowed: false},
    jump:       {x: 0.902, y: 0.506, w: 0.079, h: 0.112, icon: 'jump'},
    crouch:     {x: 0.902, y: 0.626, w: 0.079, h: 0.112, icon: 'crouch'},
    action:     {x: 0.902, y: 0.746, w: 0.079, h: 0.112, icon: 'action'},
    weaponNext: {x: 0.700, y: 0.000, w: 0.300, h: 0.150, icon: 'weapon', dashed: true, iconScale: 0.28}
};

// Aim zone (right half, right thumb) and the height fraction of it that also
// fires: above the split = aim + fire, below = aim only. 0.498 and not 0.5, so
// its marker keeps the button gap above the column below it.
InputVirtualGamepad.AIM_AREA = {x: 0.5, y: 0, w: 0.5, h: 1};

InputVirtualGamepad.COLUMN_EDGE_MARGIN = 1 - (InputVirtualGamepad.BUTTONS.action.x + InputVirtualGamepad.BUTTONS.action.w);

InputVirtualGamepad.LAYOUT = {
    // Bottom-left quadrant, left thumb.
    moveArea:          {x: 0, y: 0.5, w: 0.5, h: 0.5},
    aimArea:           InputVirtualGamepad.AIM_AREA,
    aimFireSplit:      0.498,
    // From the screen edge to one column margin left of the buttons, so the
    // dash frames them instead of reading as scenery — which a full-width rule does.
    aimSplitMarkWidth: (1 - (InputVirtualGamepad.BUTTONS.action.x - InputVirtualGamepad.COLUMN_EDGE_MARGIN)) / InputVirtualGamepad.AIM_AREA.w,
    aimMarkIcon:       'aim',
    // The thumbs' resting spots, symmetric on both edges.
    stickHints:        {move: {x: 0.170, y: 0.698}, aim: {x: 0.830, y: 0.698}},
    buttons:           InputVirtualGamepad.BUTTONS,
    icons:             InputVirtualGamepad.ICONS
};
