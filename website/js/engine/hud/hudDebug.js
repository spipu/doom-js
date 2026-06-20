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
        super.init(container);   // stores this._container

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

    // Scale the font (and offset) to the rendered display height so the overlay
    // stays proportional on any screen size — engine.scrHeight is the actual
    // pixel height of the (letterboxed) display, updated on every resize.
    _applyFontScale() {
        if (!this._engine || !this._engine.scrHeight) {
            return;
        }
        const fontPx = Math.max(10, Math.min(24, Math.round(this._engine.scrHeight * 0.028)));
        const pad    = Math.max(2, Math.round(fontPx * 0.4));
        this._el.style.fontSize = fontPx + 'px';
        this._el.style.bottom   = pad + 'px';
        this._el.style.left     = pad + 'px';
    }

    update() {
        this._applyFontScale();
        this._applyScreenFlash();

        const lines = [];
        if (this._engine) {
            lines.push(this._buildEngine());
        }
        if (this._user) {
            lines.push(this._buildUser());
        }
        if (this._inputs) {
            lines.push(this._buildInputs());
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
            + ' | energy: ' + Math.ceil(u.getEnergy()) + '/' + u.getMaxEnergy()
            + ' | shield: ' + Math.ceil(u.getArmor()) + '/' + u.getMaxArmor();
    }

    _buildInputs() {
        const i = this._inputs;
        const buttons = [];
        if (i.readButtonJump()) {
            buttons.push('jump');
        }
        if (i.readButtonAction()) {
            buttons.push('action');
        }
        if (i.readButtonCrouch()) {
            buttons.push('crouch');
        }
        if (i.readButtonFire()) {
            buttons.push('fire');
        }
        if (i.readButtonPause()) {
            buttons.push('pause');
        }
        return '[INPUTS] ' + i.getMode()
            + ' | joy1: ' + i.readJoy1X().toFixed(2) + ',' + i.readJoy1Y().toFixed(2)
            + ' | joy2: ' + i.getLastJoy2DeltaX().toFixed(1) + ',' + i.getLastJoy2DeltaY().toFixed(1)
            + ' | btn: ' + ((buttons.length > 0) ? buttons.join(' ') : '...');
    }
}
