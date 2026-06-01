class Debug {
    constructor(element) {
        this._el       = element;
        this._engine   = null;
        this._user     = null;
        this._keyboard = null;
        this._mouse    = null;
    }

    bindEngine(engine) {
        this._engine = engine;
        return this;
    }

    bindUser(user) {
        this._user = user;
        return this;
    }

    bindKeyboard(keyboard) {
        this._keyboard = keyboard;
        return this;
    }

    bindMouse(mouse) {
        this._mouse = mouse;
        return this;
    }

    update() {
        const lines = [];
        if (this._engine) {
            lines.push(this._buildEngine());
        }
        if (this._user) {
            lines.push(this._buildUser());
        }
        if (this._keyboard) {
            lines.push(this._buildKeyboard());
        }
        if (this._mouse) {
            lines.push(this._buildMouse());
        }
        this._el.innerText = lines.join('\n');
    }

    _buildEngine() {
        return '[ENGINE] ' + this._engine.getFps() + ' fps | renderer: ' + this._engine.getRendererCode() + ' | v' + bootstrap.getVersion();
    }

    _buildUser() {
        const u = this._user;
        return '[USER]'
            + ' x=' + u.x.toFixed(2) + ' y=' + u.y.toFixed(2) + ' z=' + u.z.toFixed(2)
            + ' | yaw=' + u.yaw.toFixed(1) + '° pitch=' + u.pitch.toFixed(1) + '°'
            + ' | energy: ' + Math.ceil(u.getEnergy()) + '/' + u.getMaxEnergy();
    }

    _buildKeyboard() {
        const keys = this._keyboard.getKeys();
        return '[KEYBOARD] ' + (keys.length ? keys.join(' ') : '...');
    }

    _buildMouse() {
        const m = this._mouse;
        return '[MOUSE]'
            + ' locked=' + m.isLocked()
            + ' | L=' + m.isLeftClickDown() + ' | R=' + m.isRightClickDown()
            + ' | dx=' + m.getLastDx() + ' dy=' + m.getLastDy();
    }
}
