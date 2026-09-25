/**
 * Unified selection model of a menu list — one instance per owner (each
 * screen, and each modal carrying a list).
 *
 * Owns the highlighted entry and drives it from every input source at once:
 * mouse hover (armed by a real mouse move), keyboard (arrows move, Enter
 * validates, Backspace goes back) and gamepad (d-pad or left stick with
 * auto-repeat, button 0 validates, button 1 goes back). The selection clamps
 * at both ends (no wrap-around); an optional row of side buttons above the list
 * and a bottom button below it join the vertical flow. The owner provides the
 * back action and the blocked state (its own modality).
 */
class MenuListNavigation {
    static get PAD_POLL_MS() {
        return 50;
    }

    static get PAD_REPEAT_DELAY_MS() {
        return 400;
    }

    static get PAD_REPEAT_RATE_MS() {
        return 120;
    }

    // Stick thresholds with hysteresis: pressed beyond STICK_PRESS, held until
    // it falls back under STICK_RELEASE. A single threshold would turn the
    // noise of a stick resting near it into a new step on every crossing.
    static get STICK_PRESS() {
        return 0.5;
    }

    static get STICK_RELEASE() {
        return 0.35;
    }

    /**
     * @param {function} onBack    invoked on Backspace / gamepad button 1
     * @param {function} isBlocked returns true while the inputs must be ignored
     */
    constructor(onBack, isBlocked) {
        this._onBack            = onBack;
        this._isBlocked         = isBlocked;
        this._escapeAsBack      = false;
        this._items             = [];
        this._index             = -1;
        this._sideButtons       = [];
        this._sideIndex         = -1;
        this._bottomButton      = null;
        this._bottomFocused     = false;
        this._horizontal        = false;
        this._grid              = null;
        this._onStart           = null;
        this._keyDownListener   = this._onKeyDown.bind(this);
        this._mouseMoveListener = this._onMouseMove.bind(this);
        this._mouseArmed        = false;
        this._pad               = new InputGamepad();
        this._padTimer          = null;
        this._padSeen           = false;
        this._padState          = {validate: false, back: false, start: false};
        this._padHeldY          = {dir: 0, ms: 0};
        this._padHeldX          = {dir: 0, ms: 0};
    }

    // Horizontal list (a confirm modal's buttons row): Left/Right move the
    // selection, Up/Down go quiet.
    setHorizontal(flag) {
        this._horizontal = (flag === true);

        return this;
    }

    // 2D list (an on-screen keyboard): one {row, column, span} slot per entry,
    // in the order of the entries. Up/Down reach the nearest entry of the
    // neighbour row, Left/Right walk the row; both clamp at the edges.
    setGrid(slots) {
        this._grid = slots;

        return this;
    }

    // Gamepad Start (the pause button of the game), for a list whose
    // validation is not its highlighted entry (a text entry).
    setOnStart(callback) {
        this._onStart = callback;

        return this;
    }

    // Escape joins Backspace on the back action — only in the menu contexts:
    // over a running game the game loop owns the Escape key (pause toggle),
    // and a second handler would race it.
    setEscapeAsBack(flag) {
        this._escapeAsBack = (flag === true);

        return this;
    }

    attach() {
        document.addEventListener('keydown', this._keyDownListener);
        document.addEventListener('mousemove', this._mouseMoveListener);
        this._mouseArmed   = false;
        this._padSeen      = false;
        this._padHeldY.dir = 0;
        this._padHeldX.dir = 0;
        if (this._padTimer === null) {
            this._padTimer = setInterval(() => {
                this._readPad();
            }, MenuListNavigation.PAD_POLL_MS);
        }

        return this;
    }

    detach() {
        document.removeEventListener('keydown', this._keyDownListener);
        document.removeEventListener('mousemove', this._mouseMoveListener);
        if (this._padTimer !== null) {
            clearInterval(this._padTimer);
            this._padTimer = null;
        }

        return this;
    }

    // Only the list: this runs on every refresh, and dropping the side or
    // bottom highlight there would undo a focus deliberately placed by the screen.
    clear() {
        this._items = [];
        this._index = -1;

        return this;
    }

    // Row above the list, in left-to-right order, reached by Up on the first
    // entry and walked with Left / Right. Validate clicks the focused button,
    // so its press feedback plays.
    setSideButtons(elements) {
        this._sideButtons = elements;
        this._sideIndex   = -1;

        return this;
    }

    // Lets a screen that rebuilds itself hand the focus back to the button
    // just pressed; an element outside the row clears the highlight.
    focusSideButton(el) {
        this._focusSideAt(this._sideButtons.indexOf(el));

        return this;
    }

    // Down past the last entry lands on it, Up climbs back into the list. It
    // also becomes the target of every back input (see _goBack).
    setBottomButton(el) {
        this._bottomButton = el;
        this._bottomFocused = false;

        return this;
    }

    addItemIn(listEl, labelText, onActivate, onAdjust = null) {
        const item = MenuDom.addListItem(listEl, labelText);
        this.addItem(item, onActivate, onAdjust);

        return item;
    }

    // Hover selects only after a real mouse move, so a list scrolling under a
    // resting pointer does not steal the selection from the keyboard/gamepad.
    // onAdjust (Left/Right, pad X) cycles the entry's value.
    addItem(el, onActivate, onAdjust = null) {
        const entry = {el: el, action: onActivate, adjust: onAdjust};
        el.addEventListener('click', () => {
            this._pressItem(entry);
        });
        el.addEventListener('mouseenter', () => {
            if (this._mouseArmed) {
                this._selectElement(el);
            }
        });
        this._items.push(entry);

        return this;
    }

    // A button as list entry (a confirm modal's row): focus-styled, activated
    // through its own click so the press feedback plays.
    addButtonItem(el) {
        this._items.push({el: el, action: () => el.click(), isButton: true});
        el.addEventListener('mouseenter', () => {
            if (this._mouseArmed) {
                this._selectElement(el);
            }
        });

        return this;
    }

    // Initial selection only: a highlight deliberately put on a side or bottom
    // button wins over the convenience of landing on the first entry.
    selectFirst() {
        if ((this._items.length > 0) && (this._sideIndex === -1) && !this._bottomFocused) {
            this.selectIndex(0);
        }

        return this;
    }

    getSelectedIndex() {
        return this._index;
    }

    selectIndex(index) {
        this._focusSideAt(-1);
        this._focusBottom(false);
        if (this._index === index) {
            return this;
        }
        const previous = this._items[this._index];
        if (previous !== undefined) {
            previous.el.classList.remove(MenuListNavigation._selectionClass(previous));
        }

        this._index = index;
        const entry = this._items[index];
        if (entry !== undefined) {
            entry.el.classList.add(MenuListNavigation._selectionClass(entry));
            this._scrollListTo(entry.el);
            this._mouseArmed = false;
        }

        return this;
    }

    // Not scrollIntoView: it may scroll the page too, and on iOS that collapses
    // the Safari toolbar, resizes the viewport and makes the em-sized menu grow.
    _scrollListTo(el) {
        const list = el.parentElement;
        if (list === null) {
            return;
        }
        // Aligned on the list's vertical padding, not its clip edge: an entry
        // border flush with the edge gets eaten by fractional em positions.
        const inset    = parseFloat(getComputedStyle(list).paddingTop);
        const listRect = list.getBoundingClientRect();
        const itemRect = el.getBoundingClientRect();
        if (itemRect.top < (listRect.top + inset)) {
            list.scrollTop += (itemRect.top - listRect.top - inset);
            return;
        }
        if (itemRect.bottom > (listRect.bottom - inset)) {
            list.scrollTop += (itemRect.bottom - listRect.bottom + inset);
        }
    }

    moveSelection(delta) {
        return this._moveFocus(() => this._moveSelectionStep(delta));
    }

    // The cursor sound plays only when the highlight actually moved: a step
    // against a clamped end stays silent.
    _moveFocus(step) {
        const before = this._focusSignature();
        step();
        if (this._focusSignature() !== before) {
            doomSound.playUi('menu/cursor');
        }

        return this;
    }

    _focusSignature() {
        return (this._index + '|' + this._sideIndex + '|' + this._bottomFocused);
    }

    _moveSelectionStep(delta) {
        if (this._grid !== null) {
            this._gridStep(0, delta);
            return this;
        }
        if (this._sideIndex !== -1) {
            if (delta > 0) {
                this._focusSideAt(-1);
            }
            return this;
        }
        if (this._bottomFocused) {
            if (delta < 0) {
                this._focusBottom(false);
            }
            return this;
        }
        const count = this._items.length;
        if (count === 0) {
            if (delta < 0) {
                this._focusSideFromList();
            }
            if (delta > 0) {
                this._focusBottom(true);
            }
            return this;
        }
        if (this._index === -1) {
            return this.selectIndex(((delta > 0) ? 0 : count - 1));
        }
        if ((delta < 0) && (this._index === 0)) {
            this._focusSideFromList();
            return this;
        }
        if ((delta > 0) && (this._index === count - 1)) {
            this._focusBottom(true);
            return this;
        }

        return this.selectIndex(Math.max(0, Math.min(count - 1, this._index + delta)));
    }

    activateSelection() {
        if (this._sideButtons[this._sideIndex] !== undefined) {
            this._sideButtons[this._sideIndex].click();
            return this;
        }
        if (this._bottomFocused && (this._bottomButton !== null)) {
            this._bottomButton.click();
            return this;
        }
        const entry = this._items[this._index];
        if (entry !== undefined) {
            this._pressItem(entry);
        }

        return this;
    }

    // Selected first (a touch tap never hovered it) — unless a press is in
    // flight: the whole activation is dropped, selection included.
    _pressItem(entry) {
        if (MenuDom.isPressing()) {
            return;
        }
        this.selectIndex(this._items.indexOf(entry));
        if (entry.isButton === true) {
            entry.el.click();
            return;
        }
        MenuDom.press(entry.el, 'doom-menu-item-pressed', entry.action);
    }

    // Left/Right walks the side row, moves a horizontal list, or cycles the
    // selected entry's value.
    _stepSideways(dir) {
        if (this._sideIndex !== -1) {
            this._focusSideAt(Math.max(0, Math.min(this._sideButtons.length - 1, this._sideIndex + dir)));
            return;
        }
        if (this._horizontal) {
            this.moveSelection(dir);
            return;
        }
        if (this._grid !== null) {
            this._moveFocus(() => this._gridStep(dir, 0));
            return;
        }
        if (this._bottomFocused) {
            return;
        }
        const entry = this._items[this._index];
        if ((entry !== undefined) && ((entry.adjust ?? null) !== null)) {
            doomSound.playUi('menu/change');
            entry.adjust(dir);
        }
    }

    // Validate (Enter / gamepad button 0) on a page without any list entry
    // (the About popup): the back action is the only thing to validate.
    _validate() {
        if ((this._items.length === 0) && (this._sideIndex === -1) && !this._bottomFocused) {
            this._goBack();
            return;
        }
        this.activateSelection();
    }

    // Every back input plays the bottom button when there is one, so it gets
    // the same press feedback and action as a click.
    _goBack() {
        if (this._bottomButton !== null) {
            this._bottomButton.click();
            return;
        }
        doomSound.playUi('menu/backup');
        this._onBack();
    }

    // --- Internal ---

    // Nothing selected yet: the first entry is the landing spot whatever the direction.
    _gridStep(dx, dy) {
        if (this._items[this._index] === undefined) {
            this.selectIndex(0);
            return;
        }
        const target = ((dy !== 0) ? this._gridVerticalTarget(dy) : this._gridHorizontalTarget(dx));
        if (target !== -1) {
            this.selectIndex(target);
        }
    }

    _gridHorizontalTarget(dx) {
        const current = this._grid[this._index];
        const target  = this._index + dx;
        const slot    = this._grid[target];

        return (((slot !== undefined) && (slot.row === current.row)) ? target : -1);
    }

    // The entry of the neighbour row whose centre is the closest to the
    // current one's, the leftmost winning a tie: a wide key is reached from
    // any key above or below it, and leads back under its own middle.
    _gridVerticalTarget(dy) {
        const current = this._grid[this._index];
        const centre  = MenuListNavigation._slotCentre(current);
        let best      = -1;
        let bestGap   = Infinity;
        this._grid.forEach((slot, index) => {
            const gap = Math.abs(MenuListNavigation._slotCentre(slot) - centre);
            if ((slot.row === (current.row + dy)) && (gap < bestGap)) {
                best    = index;
                bestGap = gap;
            }
        });

        return best;
    }

    static _slotCentre(slot) {
        return slot.column + slot.span / 2;
    }

    // Entering the row from the list lands on its rightmost button.
    _focusSideFromList() {
        this._focusSideAt(this._sideButtons.length - 1);
    }

    // -1 leaves the row. The list keeps its index, only the visible highlight
    // switches.
    _focusSideAt(index) {
        if (index === this._sideIndex) {
            return;
        }
        const previous = this._sideButtons[this._sideIndex];
        if (previous !== undefined) {
            previous.classList.remove('doom-menu-button-focus');
        }
        this._sideIndex = index;
        const current = this._sideButtons[index];
        if (current !== undefined) {
            current.classList.add('doom-menu-button-focus');
        }
        const entry = this._items[this._index];
        if (entry !== undefined) {
            entry.el.classList.toggle(MenuListNavigation._selectionClass(entry), (this._sideIndex === -1));
        }
    }

    _focusBottom(focused) {
        if ((this._bottomButton === null) || (focused === this._bottomFocused)) {
            return;
        }
        this._bottomFocused = focused;
        this._bottomButton.classList.toggle('doom-menu-button-focus', focused);
        const entry = this._items[this._index];
        if (entry !== undefined) {
            entry.el.classList.toggle(MenuListNavigation._selectionClass(entry), !focused);
        }
    }

    static _selectionClass(entry) {
        return ((entry.isButton === true) ? 'doom-menu-button-focus' : 'doom-menu-item-selected');
    }

    _selectElement(el) {
        const index = this._items.findIndex((entry) => (entry.el === el));
        if (index < 0) {
            return;
        }
        const before = this._focusSignature();
        this.selectIndex(index);
        if (this._focusSignature() !== before) {
            doomSound.playUi('menu/cursor');
        }
    }

    _onMouseMove() {
        this._mouseArmed = true;
    }

    // --- Keyboard ---

    // Inputs and buttons keep their native keyboard behaviour (typing in the
    // URL field, Enter as a click on a focused button).
    _onKeyDown(event) {
        if (this._isBlocked()) {
            return;
        }
        const target = event.target;
        if ((target instanceof HTMLInputElement)
            || (target instanceof HTMLTextAreaElement)
            || (target instanceof HTMLButtonElement)) {
            return;
        }

        switch (event.code) {
            case 'ArrowUp':
                event.preventDefault();
                if (!this._horizontal) {
                    this.moveSelection(-1);
                }
                break;
            case 'ArrowDown':
                event.preventDefault();
                if (!this._horizontal) {
                    this.moveSelection(1);
                }
                break;
            case 'ArrowLeft':
                event.preventDefault();
                this._stepSideways(-1);
                break;
            case 'ArrowRight':
                event.preventDefault();
                this._stepSideways(1);
                break;
            case 'Enter':
            case 'NumpadEnter':
                event.preventDefault();
                if (!event.repeat) {
                    this._validate();
                }
                break;
            case 'Escape':
                if (!this._escapeAsBack) {
                    break;
                }
                // falls through: an enabled Escape is a back key
            case 'Backspace':
                event.preventDefault();
                if (!event.repeat) {
                    this._goBack();
                }
                break;
        }
    }

    // --- Gamepad ---

    _readPad() {
        if (!this._pad.isAvailable()) {
            this._padSeen      = false;
            this._padHeldY.dir = 0;
            this._padHeldX.dir = 0;
            return;
        }
        // Button states keep tracking while blocked, so the press that closes
        // a modal is not replayed as a fresh edge once the block lifts.
        if (this._isBlocked()) {
            this._padState.validate = this._pad.readButtonValidate();
            this._padState.back     = this._pad.readButtonBack();
            this._padState.start    = this._pad.readButtonPause();
            return;
        }

        const validate   = this._pad.readButtonValidate();
        const back       = this._pad.readButtonBack();
        const start      = this._pad.readButtonPause();
        const directionY = this._readPadDirectionY();
        const directionX = this._readPadDirectionX();

        // The browser only exposes a pad once a button has been pressed on it
        // (anti-fingerprinting): that very press must become the baseline of
        // the edge detection, never an edge to act on.
        if (!this._padSeen) {
            this._padSeen      = true;
            this._padState     = {validate: validate, back: back, start: start};
            this._padHeldY     = {dir: directionY, ms: 0};
            this._padHeldX     = {dir: directionX, ms: 0};
            return;
        }

        this._stepPad(this._padHeldY, directionY, (dir) => {
            if (!this._horizontal) {
                this.moveSelection(dir);
            }
        });
        this._stepPad(this._padHeldX, directionX, (dir) => {
            this._stepSideways(dir);
        });

        if (validate && !this._padState.validate) {
            this._validate();
        }
        if (back && !this._padState.back) {
            this._goBack();
        }
        if (start && !this._padState.start && (this._onStart !== null)) {
            this._onStart();
        }

        this._padState.validate = validate;
        this._padState.back     = back;
        this._padState.start    = start;
    }

    _readPadDirectionY() {
        const stickY    = this._pad.readJoy1Y();
        const upLimit   = ((this._padHeldY.dir === -1) ? MenuListNavigation.STICK_RELEASE : MenuListNavigation.STICK_PRESS);
        const downLimit = ((this._padHeldY.dir === 1) ? MenuListNavigation.STICK_RELEASE : MenuListNavigation.STICK_PRESS);

        if (this._pad.readDpadUp() || (stickY > upLimit)) {
            return -1;
        }
        if (this._pad.readDpadDown() || (stickY < -downLimit)) {
            return 1;
        }

        return 0;
    }

    _readPadDirectionX() {
        const stickX     = this._pad.readJoy1X();
        const leftLimit  = ((this._padHeldX.dir === -1) ? MenuListNavigation.STICK_RELEASE : MenuListNavigation.STICK_PRESS);
        const rightLimit = ((this._padHeldX.dir === 1) ? MenuListNavigation.STICK_RELEASE : MenuListNavigation.STICK_PRESS);

        if (this._pad.readDpadLeft() || (stickX < -leftLimit)) {
            return -1;
        }
        if (this._pad.readDpadRight() || (stickX > rightLimit)) {
            return 1;
        }

        return 0;
    }

    // One step on press, then auto-repeat while the direction is held.
    _stepPad(held, direction, act) {
        if (direction === 0) {
            held.dir = 0;
            return;
        }
        if (direction !== held.dir) {
            held.dir = direction;
            held.ms  = 0;
            act(direction);
            return;
        }
        held.ms += MenuListNavigation.PAD_POLL_MS;
        if (held.ms >= MenuListNavigation.PAD_REPEAT_DELAY_MS) {
            held.ms -= MenuListNavigation.PAD_REPEAT_RATE_MS;
            act(direction);
        }
    }
}
