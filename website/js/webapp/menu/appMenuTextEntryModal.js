/**
 * Text entry modal of a 'text' setting (AppSettings): the typed value with its blinking
 * caret, the on-screen keyboard, and the physical keyboard read through
 * `event.key` (the printed character, whatever the layout). The arrows and
 * the gamepad walk the on-screen keys, Enter and the gamepad validate button
 * press the highlighted one, Start validates the field. The highlight starts on
 * the validate key and physical typing never moves it, so typing then pressing
 * Enter validates. Validation stays disabled while the sanitized value is
 * empty; cancelling is always possible. The caret stays at the end: erasing
 * removes the last character. A definition with `masked: true` (a PIN…) shows
 * one star per typed character instead of the characters themselves.
 */
class AppMenuTextEntryModal extends AppMenuModal {
    static get MASK_CHAR() {
        return '*';
    }

    /**
     * @param {AppMenuDisplay} display
     */
    constructor(display) {
        super(display);

        this._definition  = null;
        this._text        = '';
        this._valueEl     = null;
        this._keyboard    = null;
        this._onValidate  = null;
        this._onCancel    = null;
        this._keyListener = this._onKeyDown.bind(this);
    }

    /**
     * @param {string}           title
     * @param {object}           definition - a 'text' AppSettings definition
     * @param {string}           value      - initial value
     * @param {function(string)} onValidate - receives the sanitized value
     * @param {function|null}    onCancel
     */
    open(title, definition, value, onValidate, onCancel = null) {
        this._definition = definition;
        this._text       = value;
        this._onValidate = onValidate;
        this._onCancel   = onCancel;

        const phone   = (definition.layout === AppMenuVirtualKeyboard.LAYOUT_PHONE);
        const {modal} = this._createShell(title, 'app-menu-modal app-menu-modal-text-entry' + (phone ? ' app-menu-modal-text-entry-phone' : ''), 'app-menu-modal-message');
        const field   = AppMenuDom.addElement(modal, 'div', 'app-menu-text-field');
        this._valueEl = AppMenuDom.addElement(field, 'span', 'app-menu-text-value');
        AppMenuDom.addElement(field, 'span', 'app-menu-text-caret');

        this._nav = new AppMenuListNavigation(() => this._eraseOrCancel(), () => !this._isTopOverlay())
            .setOnStart(() => this._validate());
        this._keyboard = new AppMenuVirtualKeyboard(definition, {
            onChar:     (char) => this._type(char),
            onErase:    () => this._erase(),
            onValidate: () => this._validate(),
            onCancel:   () => this._cancel()
        }).build(modal, this._nav);
        this._nav.attach().selectIndex(this._keyboard.getValidateIndex());

        // No cancel key (`cancel: 'corner'`): a close cross in the top right corner of the modal cancels.
        if (!this._keyboard.hasCancelKey()) {
            AppMenuDom.addIconOnlyButton(modal, 'app-menu-button app-menu-modal-close', 'close', appTranslator.get('menu.cancel'), () => this._cancel());
        }

        // Capture phase: the list navigation would otherwise take Backspace and Escape as back keys.
        document.addEventListener('keydown', this._keyListener, true);
        this._render();

        return this;
    }

    close() {
        document.removeEventListener('keydown', this._keyListener, true);

        return super.close();
    }

    // --- Internal ---

    // Inner runs of spaces are collapsed as they are typed, a leading space refused.
    _type(char) {
        const typed    = AppSettings.normalizeTextChar(this._definition, char);
        const isSpace  = (typed === AppMenuVirtualKeyboard.SPACE);
        const blocked  = (isSpace && ((this._text === '') || this._text.endsWith(AppMenuVirtualKeyboard.SPACE)));
        const tooLong  = ((this._text.length + typed.length) > this._definition.maxLength);
        if ((typed === '') || blocked || tooLong) {
            AppMenuSound.play(AppMenuSound.INVALID);
            return;
        }
        this._text += typed;
        this._render();
    }

    _erase() {
        this._text = this._text.slice(0, -1);
        this._render();
    }

    // Gamepad back: erases, and cancels once there is nothing left to erase.
    _eraseOrCancel() {
        if (this._text === '') {
            this._cancel();
            return;
        }
        this._erase();
    }

    _validate() {
        const value = AppSettings.sanitizeText(this._definition, this._text);
        if (value === '') {
            AppMenuSound.play(AppMenuSound.INVALID);
            return;
        }
        this.close();
        this._onValidate(value);
    }

    _cancel() {
        this.close();
        if (this._onCancel !== null) {
            this._onCancel();
        }
    }

    _render() {
        this._valueEl.textContent = (this._definition.masked
            ? AppMenuTextEntryModal.MASK_CHAR.repeat(Array.from(this._text).length)
            : this._text);
        this._keyboard.setValidateEnabled(AppSettings.sanitizeText(this._definition, this._text) !== '');
    }

    // Arrows fall through to the navigation of the on-screen keys; browser
    // shortcuts (Ctrl, Alt, Meta) are left alone.
    _onKeyDown(event) {
        if (!this._isTopOverlay() || event.ctrlKey || event.altKey || event.metaKey) {
            return;
        }
        const action = this._keyAction(event);
        if (action === null) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        action();
    }

    // Enter is left to the navigation: it presses the highlighted key. A held
    // Escape is swallowed, its repeats must reach nothing else.
    _keyAction(event) {
        if (event.key === 'Backspace') {
            return () => this._erase();
        }
        if (event.key === 'Escape') {
            return (event.repeat ? () => {} : () => this._cancel());
        }
        if (Array.from(event.key).length === 1) {
            return () => this._type(event.key);
        }

        return null;
    }
}
