/**
 * On-screen keyboard of a 'text' setting: one key per character of its charset,
 * a wide space key when the charset has one, erase, cancel and validate. No
 * browser <input>: a native field pops the OS keyboard on mobile (viewport
 * resize, fullscreen loss) and cannot be driven by a gamepad.
 *
 * The keys follow the physical layout of the interface language (AZERTY in
 * French, QWERTY otherwise); a charset character the layout lacks gets a row
 * of its own. Every key keeps its grid slot (row, column, span), the grid the
 * list navigation walks.
 */
class MenuVirtualKeyboard {
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
     * @param {object} definition - a 'text' DoomSettings definition
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
     * @param {MenuListNavigation} nav - every key becomes one of its entries, in reading order
     */
    build(parent, nav) {
        const grid = MenuDom.addElement(parent, 'div', 'doom-menu-keyboard');
        grid.style.gridTemplateColumns = 'repeat(' + MenuVirtualKeyboard.COLUMNS + ', 1fr)';
        for (const row of this._layout()) {
            for (const slot of row) {
                this._addKey(grid, slot);
            }
        }
        for (const key of this._keys) {
            nav.addButtonItem(key.el);
        }
        nav.setGrid(this._keys.map((key) => ({row: key.row, column: key.column, span: key.span})));

        return this;
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
        const columns = MenuVirtualKeyboard.COLUMNS;
        const rows    = this._characterRows().map((chars) => chars.map((char) => ({kind: 'char', char: char, span: 1})));
        const free    = columns - ((rows.length > 0) ? rows[rows.length - 1].length : columns);
        if (free < MenuVirtualKeyboard.ERASE_MIN_SPAN) {
            rows.push([{kind: 'erase', span: columns}]);
        } else {
            rows[rows.length - 1].push({kind: 'erase', span: free});
        }
        rows.push(this._commandRow());

        return rows.map((row, rowIndex) => MenuVirtualKeyboard._placed(row, rowIndex));
    }

    // The layout rows reduced to the charset, then whatever the charset holds
    // beyond the layout, in rows of the keyboard width.
    _characterRows() {
        const charset = Array.from(this._definition.charset).filter((char) => (char !== MenuVirtualKeyboard.SPACE));
        const rows    = MenuVirtualKeyboard._layoutRows()
            .map((row) => Array.from(row).filter((char) => charset.includes(char)))
            .filter((row) => (row.length > 0));
        const placed  = rows.flat();
        const extra   = charset.filter((char) => !placed.includes(char));
        for (let start = 0; start < extra.length; start += MenuVirtualKeyboard.COLUMNS) {
            rows.push(extra.slice(start, start + MenuVirtualKeyboard.COLUMNS));
        }

        return rows;
    }

    static _layoutRows() {
        const code = (MenuVirtualKeyboard.LAYOUT_BY_LANGUAGE[appTranslator.getLanguage()] ?? MenuVirtualKeyboard.DEFAULT_LAYOUT);

        return MenuVirtualKeyboard.LAYOUTS[code];
    }

    _commandRow() {
        const columns = MenuVirtualKeyboard.COLUMNS;
        if (!this._definition.charset.includes(MenuVirtualKeyboard.SPACE)) {
            return [{kind: 'cancel', span: columns / 2}, {kind: 'validate', span: columns / 2}];
        }
        const side = (columns - MenuVirtualKeyboard.SPACE_SPAN) / 2;

        return [
            {kind: 'cancel', span: Math.floor(side)},
            {kind: 'char', char: MenuVirtualKeyboard.SPACE, span: MenuVirtualKeyboard.SPACE_SPAN},
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
        const isIcon = ((slot.kind !== 'char') || (slot.char === MenuVirtualKeyboard.SPACE));
        const label  = (isIcon ? '' : slot.char);
        const kind   = (((slot.kind === 'char') && isIcon) ? 'space' : slot.kind);
        const el     = MenuDom.addButton(grid, 'doom-menu-button doom-menu-key' + (isIcon ? ' doom-menu-key-icon doom-menu-key-' + kind : ''),
            label, () => this._activate(slot), MenuVirtualKeyboard.PRESS_FEEDBACK_MS);
        el.style.gridColumn = 'span ' + slot.span;
        if (isIcon) {
            const name = appTranslator.get(MenuVirtualKeyboard.ICON_LABEL_CODES[kind]);
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
