class Debug {
    constructor(element) {
        this._el       = element;
        this._user     = null;
        this._keyboard = null;
        this._mouse    = null;
    }

    bindUser(user)         { this._user     = user;     return this; }
    bindKeyboard(keyboard) { this._keyboard = keyboard; return this; }
    bindMouse(mouse)       { this._mouse    = mouse;    return this; }

    update() {
        const lines = [];
        if (this._mouse) {
            lines.push(this._mouse.isLocked() ? 'Souris capturée — ESC pour relâcher' : 'Cliquer sur le canvas pour capturer la souris');
            lines.push(this._buildMouse());
        }
        if (this._keyboard) lines.push(this._buildKeyboard());
        if (this._user)     lines.push(this._buildUser());
        this._el.innerText = lines.join('\n');
    }

    _buildUser() {
        const u = this._user;
        return 'pos: x=' + u.x.toFixed(2) + ' y=' + u.y.toFixed(2) + ' z=' + u.z.toFixed(2)
             + ' | yaw=' + u.yaw.toFixed(1) + '° pitch=' + u.pitch.toFixed(1) + '°';
    }

    _buildKeyboard() {
        const keys = this._keyboard.getKeys();
        return 'keys: ' + (keys.length ? keys.join(' ') : '(none)');
    }

    _buildMouse() {
        const m = this._mouse;
        return 'mouse: locked=' + m.isLocked()
             + ' | L=' + m.isLeftClickDown() + ' | R=' + m.isRightClickDown()
             + ' | dx=' + m.getLastDx() + ' dy=' + m.getLastDy();
    }
}
