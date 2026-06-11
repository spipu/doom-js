class HudDebug extends AbstractHud {
    constructor(engine) {
        super(engine);
        this._descriptions = [];
    }

    addDescription(message) {
        this._descriptions.push(message);
        return this;
    }

    init(container) {
        super.init(container);

        this._container = container;

        this._el = document.createElement('div');
        this._el.style.position   = 'absolute';
        this._el.style.bottom     = '5px';
        this._el.style.left       = '5px';
        this._el.style.color      = '#aaa';
        this._el.style.fontFamily = 'monospace';
        this._el.style.fontSize   = '12px';
        this._el.style.whiteSpace = 'pre';
        this._el.style.textAlign  = 'left';
        container.appendChild(this._el);
    }

    update() {
        if (this._user) {
            const alpha = ((this._user.isDead()) ? 0.5 : Math.min(0.6, this._user.getEnergyFlash()));
            this._container.style.backgroundColor = 'rgba(255, 0, 0, ' + alpha + ')';
        }

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
        for (const message of this._descriptions) {
            lines.push(message);
        }
        this._el.innerText = lines.join('\n');
    }

    _buildEngine() {
        return '[ENGINE] ' + this._engine.getFps() + ' fps | renderer: ' + this._engine.getRendererCode() + ' | ' + appBootstrap.getVersion();
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
