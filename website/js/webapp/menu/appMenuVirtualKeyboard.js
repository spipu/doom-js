/**
 * On-screen keyboard of a 'text' setting (AppSettings): one key per character of its charset,
 * a wide space key when the charset has one, erase, cancel and validate. No
 * browser <input>: a native field pops the OS keyboard on mobile (viewport
 * resize, fullscreen loss) and cannot be driven by a gamepad.
 *
 * The keys follow the physical layout of the interface language (AZERTY in
 * French, QWERTY otherwise); a charset character the layout lacks gets a row
 * of its own. Every key keeps its grid slot (row, column, span), the grid the
 * list navigation walks.
 *
 * A definition with `layout: 'phone'` (a code of digits: PIN…) gets the keypad
 * of a phone instead: 1 2 3 / 4 5 6 / 7 8 9 / _ 0 erase / cancel validate.
 *
 * A definition with `cancel: 'corner'` has no cancel key: the text entry modal
 * puts a close cross in its top right corner instead. The command row is then
 * space + validate, validate as wide as the erase key above it (validate alone
 * without space); the phone keypad ends with erase 0 validate.
 */
class AppMenuVirtualKeyboard {
    static get COLUMNS() {
        return 10;
    }

    // Short enough to keep up with fast typing, the one-press-in-flight rule still holding.
    static get PRESS_FEEDBACK_MS() {
        return 100;
    }

    static get ERASE_MIN_SPAN() {
        return 2;
    }

    static get SPACE_SPAN() {
        return 4;
    }

    static get SPACE() {
        return ' ';
    }

    static get LAYOUT_PHONE() {
        return 'phone';
    }

    static get CANCEL_CORNER() {
        return 'corner';
    }

    // Three keys a row, two grid columns each: the command row splits in two halves.
    static get PHONE_ROWS() {
        return ['123', '456', '789'];
    }

    static get PHONE_COLUMNS() {
        return 6;
    }

    static get PHONE_KEY_SPAN() {
        return 2;
    }

    static get LAYOUTS() {
        return {
            qwerty: ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL-', 'ZXCVBNM'],
            azerty: ['1234567890', 'AZERTYUIOP', 'QSDFGHJKLM', 'WXCVBN-']
        };
    }

    // Italian and Spanish keyboards are QWERTY too.
    static get LAYOUT_BY_LANGUAGE() {
        return {
            fr: 'azerty'
        };
    }

    static get DEFAULT_LAYOUT() {
        return 'qwerty';
    }

    // Accessible names of the icon keys.
    static get ICON_LABEL_CODES() {
        return {
            space:    'key.space',
            erase:    'menu.keyboard.erase',
            cancel:   'menu.cancel',
            validate: 'menu.confirm'
        };
    }

    /**
     * @param {object} definition - a 'text' AppSettings definition
     * @param {{onChar: function(string), onErase: function, onValidate: function, onCancel: function}} handlers
     */
    constructor(definition, handlers) {
        this._definition  = definition;
        this._handlers    = handlers;
        this._keys        = [];
        this._validateKey = null;
    }

    /**
     * @param {HTMLElement}        parent
     * @param {AppMenuListNavigation} nav - every key becomes one of its entries, in reading order
     */
    build(parent, nav) {
        const grid = AppMenuDom.addElement(parent, 'div', 'app-menu-keyboard' + (this.isPhone() ? ' app-menu-keyboard-phone' : ''));
        grid.style.gridTemplateColumns = 'repeat(' + (this.isPhone() ? AppMenuVirtualKeyboard.PHONE_COLUMNS : AppMenuVirtualKeyboard.COLUMNS) + ', 1fr)';
        for (const row of (this.isPhone() ? this._phoneLayout() : this._layout())) {
            for (const slot of row) {
                if (slot.kind === 'blank') {
                    AppMenuDom.addElement(grid, 'span', 'app-menu-key-blank').style.gridColumn = 'span ' + slot.span;
                    continue;
                }
                this._addKey(grid, slot);
            }
        }
        for (const key of this._keys) {
            nav.addButtonItem(key.el);
        }
        nav.setGrid(this._keys.map((key) => ({row: key.row, column: key.column, span: key.span})));

        return this;
    }

    /**
     * @returns {boolean} the keypad of a phone (definition `layout: 'phone'`)
     */
    isPhone() {
        return (this._definition.layout === AppMenuVirtualKeyboard.LAYOUT_PHONE);
    }

    /**
     * @returns {boolean} a cancel key on the keyboard (false with `cancel: 'corner'`: the modal shows a close cross)
     */
    hasCancelKey() {
        return (this._definition.cancel !== AppMenuVirtualKeyboard.CANCEL_CORNER);
    }

    setValidateEnabled(enabled) {
        this._validateKey.disabled = !enabled;

        return this;
    }

    /**
     * @returns {int} position of the validate key among the keys (and the navigation entries)
     */
    getValidateIndex() {
        return this._keys.findIndex((key) => (key.el === this._validateKey));
    }

    // Character rows first, erase closing the last of them, then the command row.
    _layout() {
        const columns = AppMenuVirtualKeyboard.COLUMNS;
        const rows    = this._characterRows().map((chars) => chars.map((char) => ({kind: 'char', char: char, span: 1})));
        const free    = columns - ((rows.length > 0) ? rows[rows.length - 1].length : columns);
        let eraseSpan = free;
        if (free < AppMenuVirtualKeyboard.ERASE_MIN_SPAN) {
            eraseSpan = columns;
            rows.push([{kind: 'erase', span: columns}]);
        } else {
            rows[rows.length - 1].push({kind: 'erase', span: free});
        }
        rows.push(this._commandRow(eraseSpan));

        return rows.map((row, rowIndex) => AppMenuVirtualKeyboard._placed(row, rowIndex));
    }

    // Keypad of a phone: digit rows reduced to the charset, then an empty slot, 0 and erase, then cancel and validate.
    _phoneLayout() {
        const span    = AppMenuVirtualKeyboard.PHONE_KEY_SPAN;
        const charset = Array.from(this._definition.charset);
        const rows    = AppMenuVirtualKeyboard.PHONE_ROWS
            .map((row) => Array.from(row).filter((char) => charset.includes(char)).map((char) => ({kind: 'char', char: char, span: span})))
            .filter((row) => (row.length > 0));
        const zero = (charset.includes('0') ? {kind: 'char', char: '0', span: span} : {kind: 'blank', span: span});
        if (!this.hasCancelKey()) {
            rows.push([{kind: 'erase', span: span}, zero, {kind: 'validate', span: span}]);

            return rows.map((row, rowIndex) => AppMenuVirtualKeyboard._placed(row, rowIndex));
        }
        rows.push([{kind: 'blank', span: span}, zero, {kind: 'erase', span: span}]);
        const half = AppMenuVirtualKeyboard.PHONE_COLUMNS / 2;
        rows.push([{kind: 'cancel', span: half}, {kind: 'validate', span: half}]);

        return rows.map((row, rowIndex) => AppMenuVirtualKeyboard._placed(row, rowIndex));
    }

    // The layout rows reduced to the charset, then whatever the charset holds
    // beyond the layout, in rows of the keyboard width.
    _characterRows() {
        const charset = Array.from(this._definition.charset).filter((char) => (char !== AppMenuVirtualKeyboard.SPACE));
        const rows    = AppMenuVirtualKeyboard._layoutRows()
            .map((row) => Array.from(row).filter((char) => charset.includes(char)))
            .filter((row) => (row.length > 0));
        const placed  = rows.flat();
        const extra   = charset.filter((char) => !placed.includes(char));
        for (let start = 0; start < extra.length; start += AppMenuVirtualKeyboard.COLUMNS) {
            rows.push(extra.slice(start, start + AppMenuVirtualKeyboard.COLUMNS));
        }

        return rows;
    }

    static _layoutRows() {
        const code = (AppMenuVirtualKeyboard.LAYOUT_BY_LANGUAGE[appTranslator.getLanguage()] ?? AppMenuVirtualKeyboard.DEFAULT_LAYOUT);

        return AppMenuVirtualKeyboard.LAYOUTS[code];
    }

    // Without cancel key, validate takes the width of the erase key right above it (the side width of the space
    // key when erase fills a row of its own), space the rest.
    _commandRow(eraseSpan) {
        const columns = AppMenuVirtualKeyboard.COLUMNS;
        const space   = this._definition.charset.includes(AppMenuVirtualKeyboard.SPACE);
        const side    = (columns - AppMenuVirtualKeyboard.SPACE_SPAN) / 2;
        if (!this.hasCancelKey()) {
            if (!space) {
                return [{kind: 'validate', span: columns}];
            }
            const validateSpan = ((eraseSpan < columns) ? eraseSpan : Math.ceil(side));

            return [
                {kind: 'char', char: AppMenuVirtualKeyboard.SPACE, span: columns - validateSpan},
                {kind: 'validate', span: validateSpan}
            ];
        }
        if (!space) {
            return [{kind: 'cancel', span: columns / 2}, {kind: 'validate', span: columns / 2}];
        }
        return [
            {kind: 'cancel', span: Math.floor(side)},
            {kind: 'char', char: AppMenuVirtualKeyboard.SPACE, span: AppMenuVirtualKeyboard.SPACE_SPAN},
            {kind: 'validate', span: Math.ceil(side)}
        ];
    }

    static _placed(row, rowIndex) {
        let column = 0;

        return row.map((slot) => {
            const placed = Object.assign({row: rowIndex, column: column}, slot);
            column += slot.span;

            return placed;
        });
    }

    _addKey(grid, slot) {
        const isIcon = ((slot.kind !== 'char') || (slot.char === AppMenuVirtualKeyboard.SPACE));
        const label  = (isIcon ? '' : slot.char);
        const kind   = (((slot.kind === 'char') && isIcon) ? 'space' : slot.kind);
        const el     = AppMenuDom.addButton(grid, 'app-menu-button app-menu-key' + (isIcon ? ' app-menu-key-icon app-menu-key-' + kind : ''),
            label, () => this._activate(slot), AppMenuVirtualKeyboard.PRESS_FEEDBACK_MS);
        el.style.gridColumn = 'span ' + slot.span;
        if (isIcon) {
            const name = appTranslator.get(AppMenuVirtualKeyboard.ICON_LABEL_CODES[kind]);
            el.setAttribute('aria-label', name);
            el.title = name;
        }
        if (slot.kind === 'validate') {
            this._validateKey = el;
        }
        this._keys.push({el: el, row: slot.row, column: slot.column, span: slot.span});
    }

    _activate(slot) {
        if (slot.kind === 'char') {
            this._handlers.onChar(slot.char);
            return;
        }
        if (slot.kind === 'erase') {
            this._handlers.onErase();
            return;
        }
        if (slot.kind === 'validate') {
            this._handlers.onValidate();
            return;
        }
        this._handlers.onCancel();
    }
}
