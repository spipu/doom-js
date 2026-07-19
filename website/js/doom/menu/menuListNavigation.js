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
        this._onBack      = onBack;
        this._isBlocked   = isBlocked;
        this._items       = [];
        this._index       = -1;
        this._sideButton  = null;
        this._onSide      = false;
        this._keyProxy    = this._onKeyDown.bind(this);
        this._mouseProxy  = this._onMouseMove.bind(this);
        this._mouseArmed  = false;
        this._pad         = new InputGamepad();
        this._padTimer    = null;
        this._padSeen     = false;
        this._padState    = {validate: false, back: false};
        this._padHeldDir  = 0;
        this._padHeldMs   = 0;
    }

    attach() {
        document.addEventListener('keydown', this._keyProxy);
        document.addEventListener('mousemove', this._mouseProxy);
        this._mouseArmed = false;
        this._padSeen    = false;
        this._padHeldDir = 0;
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
        this._items = [];
        this._index = -1;

        return this;
    }

    // Optional target sitting above the list, reached by pressing Up on the
    // first entry (and Down to come back): the WAD screen's help button.
    // Highlighted through a dedicated class; Enter / validate activates it.
    setSideButton(el, onActivate) {
        this._sideButton = {el: el, action: onActivate};
        this._onSide     = false;

        return this;
    }

    // Standard navigable entry: builds the item + label in the list and
    // registers it — the one-stop helper shared by the screens and the
    // modal pages. The returned item can carry extra children.
    addItemIn(listEl, labelText, onActivate) {
        const item = MenuDom.addListItem(listEl, labelText);
        this.addItem(item, onActivate);

        return item;
    }

    // Registers a list entry: a click activates it, hovering selects it — but
    // only after a real mouse move, so a list scrolling under a resting
    // pointer does not steal the selection from the keyboard/gamepad.
    addItem(el, onActivate) {
        el.addEventListener('click', onActivate);
        el.addEventListener('mouseenter', () => {
            if (this._mouseArmed) {
                this._selectElement(el);
            }
        });
        this._items.push({el: el, action: onActivate});

        return this;
    }

    selectFirst() {
        if (this._items.length > 0) {
            this.selectIndex(0);
        }

        return this;
    }

    selectIndex(index) {
        this._focusSide(false);
        if (this._index === index) {
            return this;
        }
        const previous = this._items[this._index];
        if (previous !== undefined) {
            previous.el.classList.remove('doom-menu-item-selected');
        }

        this._index = index;
        const entry = this._items[index];
        if (entry !== undefined) {
            entry.el.classList.add('doom-menu-item-selected');
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

    // Clamped at both ends — no wrap-around: pressing down on the last entry
    // keeps the selection there. Up on the FIRST entry moves the highlight to
    // the side button (when the screen has one), down from the button comes
    // back to the list.
    moveSelection(delta) {
        if (this._onSide) {
            if (delta > 0) {
                this._focusSide(false);
            }
            return this;
        }
        const count = this._items.length;
        if (count === 0) {
            if (delta < 0) {
                this._focusSide(true);
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

        return this.selectIndex(Math.max(0, Math.min(count - 1, this._index + delta)));
    }

    activateSelection() {
        if (this._onSide && (this._sideButton !== null)) {
            this._sideButton.action();
            return this;
        }
        const entry = this._items[this._index];
        if (entry !== undefined) {
            entry.action();
        }

        return this;
    }

    // --- Internal ---

    // Moves the highlight between the list and the side button: the list
    // keeps its index, only the visible highlight switches.
    _focusSide(on) {
        if ((this._sideButton === null) || (on === this._onSide)) {
            return;
        }
        this._onSide = on;
        this._sideButton.el.classList.toggle('doom-menu-button-focus', on);
        const entry = this._items[this._index];
        if (entry !== undefined) {
            entry.el.classList.toggle('doom-menu-item-selected', !on);
        }
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
                this.moveSelection(-1);
                break;
            case 'ArrowDown':
                event.preventDefault();
                this.moveSelection(1);
                break;
            case 'Enter':
            case 'NumpadEnter':
                event.preventDefault();
                if (!event.repeat) {
                    this.activateSelection();
                }
                break;
            case 'Backspace':
                event.preventDefault();
                if (!event.repeat) {
                    this._onBack();
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

        const validate  = this._pad.readButtonValidate();
        const back      = this._pad.readButtonBack();
        const direction = this._readPadDirection();

        // The browser only exposes a pad once a button has been pressed on it
        // (anti-fingerprinting): that very press must become the baseline of
        // the edge detection, never an edge to act on.
        if (!this._padSeen) {
            this._padSeen    = true;
            this._padState   = {validate: validate, back: back};
            this._padHeldDir = direction;
            this._padHeldMs  = 0;
            return;
        }

        this._stepPad(direction);

        if (validate && !this._padState.validate) {
            this.activateSelection();
        }
        if (back && !this._padState.back) {
            this._onBack();
        }

        this._padState.validate = validate;
        this._padState.back     = back;
    }

    _readPadDirection() {
        const stickY    = this._pad.readJoy1Y();
        const upLimit   = ((this._padHeldDir === -1) ? MenuListNavigation.STICK_RELEASE : MenuListNavigation.STICK_PRESS);
        const downLimit = ((this._padHeldDir === 1) ? MenuListNavigation.STICK_RELEASE : MenuListNavigation.STICK_PRESS);

        if (this._pad.readDpadUp() || (stickY > upLimit)) {
            return -1;
        }
        if (this._pad.readDpadDown() || (stickY < -downLimit)) {
            return 1;
        }

        return 0;
    }

    // One step on press, then auto-repeat while the direction is held.
    _stepPad(direction) {
        if (direction === 0) {
            this._padHeldDir = 0;
            return;
        }
        if (direction !== this._padHeldDir) {
            this._padHeldDir = direction;
            this._padHeldMs  = 0;
            this.moveSelection(direction);
            return;
        }
        this._padHeldMs += MenuListNavigation.PAD_POLL_MS;
        if (this._padHeldMs >= MenuListNavigation.PAD_REPEAT_DELAY_MS) {
            this._padHeldMs -= MenuListNavigation.PAD_REPEAT_RATE_MS;
            this.moveSelection(direction);
        }
    }
}
