/**
 * Unified selection model of a menu list — one instance per owner (each
 * screen, and each modal carrying a list).
 *
 * Owns the highlighted entry and drives it from every input source at once:
 * mouse hover (armed by a real mouse move), keyboard (arrows move, Enter
 * validates, Backspace goes back) and gamepad (d-pad or left stick with
 * auto-repeat, button 0 validates, button 1 goes back). The selection clamps
 * at both ends (no wrap-around), and an optional side button above the list
 * joins the vertical flow (Up on the first entry / Down to come back). The
 * owner provides the back action and the blocked state (its own modality);
 * while blocked, the pad states keep tracking so lifting the block never
 * replays a stale edge.
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
        this._onBack       = onBack;
        this._isBlocked    = isBlocked;
        this._escapeAsBack = false;
        this._items        = [];
        this._index        = -1;
        this._sideButton   = null;
        this._onSide       = false;
        this._bottomButton = null;
        this._onBottom     = false;
        this._horizontal   = false;
        this._keyProxy     = this._onKeyDown.bind(this);
        this._mouseProxy   = this._onMouseMove.bind(this);
        this._mouseArmed   = false;
        this._pad          = new InputGamepad();
        this._padTimer     = null;
        this._padSeen      = false;
        this._padState     = {validate: false, back: false};
        this._padHeldY     = {dir: 0, ms: 0};
        this._padHeldX     = {dir: 0, ms: 0};
    }

    // Horizontal list (a confirm modal's buttons row): Left/Right move the
    // selection, Up/Down go quiet.
    setHorizontal(flag) {
        this._horizontal = (flag === true);

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
        document.addEventListener('keydown', this._keyProxy);
        document.addEventListener('mousemove', this._mouseProxy);
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
        document.removeEventListener('keydown', this._keyProxy);
        document.removeEventListener('mousemove', this._mouseProxy);
        if (this._padTimer !== null) {
            clearInterval(this._padTimer);
            this._padTimer = null;
        }

        return this;
    }

    clear() {
        this._focusSide(false);
        this._focusBottom(false);
        this._items = [];
        this._index = -1;

        return this;
    }

    // Optional target sitting above the list, reached by pressing Up on the
    // first entry (and Down to come back): the WAD screen's help button.
    // Highlighted through a dedicated class; Enter / validate clicks it, so
    // the press feedback plays like a mouse click.
    setSideButton(el) {
        this._sideButton = el;
        this._onSide     = false;

        return this;
    }

    // Bottom counterpart of the side button: Down past the last entry lands
    // on the screen's action button (back / quit), Up climbs back into the
    // list. It also becomes the target of every back input (see _goBack).
    setBottomButton(el) {
        this._bottomButton = el;
        this._onBottom     = false;

        return this;
    }

    // The returned item can carry extra children (an infos line, a delete
    // button...).
    addItemIn(listEl, labelText, onActivate, onAdjust = null) {
        const item = MenuDom.addListItem(listEl, labelText);
        this.addItem(item, onActivate, onAdjust);

        return item;
    }

    // Registers a list entry: a click presses it (feedback then action),
    // hovering selects it — but only after a real mouse move, so a list
    // scrolling under a resting pointer does not steal the selection from the
    // keyboard/gamepad. onAdjust (Left/Right, pad X) cycles the entry's value.
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

    selectFirst() {
        if (this._items.length > 0) {
            this.selectIndex(0);
        }

        return this;
    }

    getSelectedIndex() {
        return this._index;
    }

    selectIndex(index) {
        this._focusSide(false);
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

    // Scrolls the list itself (scrollTop) instead of scrollIntoView: the
    // latter may scroll any scrollable ancestor, page included — on iOS that
    // page nudge collapses the Safari toolbar, resizes the viewport and makes
    // the whole em-sized menu grow.
    _scrollListTo(el) {
        const list = el.parentElement;
        if (list === null) {
            return;
        }
        const listRect = list.getBoundingClientRect();
        const itemRect = el.getBoundingClientRect();
        if (itemRect.top < listRect.top) {
            list.scrollTop += (itemRect.top - listRect.top);
            return;
        }
        if (itemRect.bottom > listRect.bottom) {
            list.scrollTop += (itemRect.bottom - listRect.bottom);
        }
    }

    // Clamped at both ends — no wrap-around; up on the first entry reaches
    // the side button, down past the last one reaches the bottom button.
    moveSelection(delta) {
        if (this._onSide) {
            if (delta > 0) {
                this._focusSide(false);
            }
            return this;
        }
        if (this._onBottom) {
            if (delta < 0) {
                this._focusBottom(false);
            }
            return this;
        }
        const count = this._items.length;
        if (count === 0) {
            if (delta < 0) {
                this._focusSide(true);
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
            this._focusSide(true);
            return this;
        }
        if ((delta > 0) && (this._index === count - 1)) {
            this._focusBottom(true);
            return this;
        }

        return this.selectIndex(Math.max(0, Math.min(count - 1, this._index + delta)));
    }

    activateSelection() {
        if (this._onSide && (this._sideButton !== null)) {
            this._sideButton.click();
            return this;
        }
        if (this._onBottom && (this._bottomButton !== null)) {
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

    // Left/Right: the selection itself in a horizontal list, otherwise the
    // selected entry's value adjustment (a settings row cycling its value).
    _stepSideways(dir) {
        if (this._horizontal) {
            this.moveSelection(dir);
            return;
        }
        if (this._onSide || this._onBottom) {
            return;
        }
        const entry = this._items[this._index];
        if ((entry !== undefined) && ((entry.adjust ?? null) !== null)) {
            entry.adjust(dir);
        }
    }

    // Validate (Enter / gamepad button 0) on a page without any list entry
    // (the About popup): the back action is the only thing to validate.
    _validate() {
        if ((this._items.length === 0) && !this._onSide && !this._onBottom) {
            this._goBack();
            return;
        }
        this.activateSelection();
    }

    // Every back input (Backspace, Escape, gamepad back) plays the screen's
    // bottom button when it has one — same press feedback and same action as
    // a click on it.
    _goBack() {
        if (this._bottomButton !== null) {
            this._bottomButton.click();
            return;
        }
        this._onBack();
    }

    // --- Internal ---

    // Moves the highlight between the list and the side button: the list
    // keeps its index, only the visible highlight switches.
    _focusSide(on) {
        if ((this._sideButton === null) || (on === this._onSide)) {
            return;
        }
        this._onSide = on;
        this._sideButton.classList.toggle('doom-menu-button-focus', on);
        const entry = this._items[this._index];
        if (entry !== undefined) {
            entry.el.classList.toggle(MenuListNavigation._selectionClass(entry), !on);
        }
    }

    _focusBottom(on) {
        if ((this._bottomButton === null) || (on === this._onBottom)) {
            return;
        }
        this._onBottom = on;
        this._bottomButton.classList.toggle('doom-menu-button-focus', on);
        const entry = this._items[this._index];
        if (entry !== undefined) {
            entry.el.classList.toggle(MenuListNavigation._selectionClass(entry), !on);
        }
    }

    static _selectionClass(entry) {
        return ((entry.isButton === true) ? 'doom-menu-button-focus' : 'doom-menu-item-selected');
    }

    _selectElement(el) {
        const index = this._items.findIndex((entry) => (entry.el === el));
        if (index >= 0) {
            this.selectIndex(index);
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
            this._padSeen    = false;
            this._padHeldDir = 0;
            return;
        }
        // While blocked (a modal owns the inputs) the button states keep
        // tracking, so the press that closes the modal is not replayed here
        // as a fresh edge once the block lifts.
        if (this._isBlocked()) {
            this._padState.validate = this._pad.readButtonValidate();
            this._padState.back     = this._pad.readButtonBack();
            return;
        }

        const validate   = this._pad.readButtonValidate();
        const back       = this._pad.readButtonBack();
        const directionY = this._readPadDirectionY();
        const directionX = this._readPadDirectionX();

        // The browser only exposes a pad once a button has been pressed on it
        // (anti-fingerprinting): that very press must become the baseline of
        // the edge detection, never an edge to act on.
        if (!this._padSeen) {
            this._padSeen      = true;
            this._padState     = {validate: validate, back: back};
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

        this._padState.validate = validate;
        this._padState.back     = back;
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
