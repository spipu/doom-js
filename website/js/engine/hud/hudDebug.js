class HudDebug extends AbstractHud {
    constructor(engine) {
        super(engine);
        this._descriptions = [];
        this._panel        = null;
    }

    addDescription(message) {
        this._descriptions.push(message);
        return this;
    }

    init(container) {
        super.init(container);

        container.style.containerType = 'size';

        this._panel                  = document.createElement('div');
        this._panel.style.position   = 'absolute';
        this._panel.style.bottom     = '1cqh';
        this._panel.style.left       = '1cqh';
        this._panel.style.color      = '#aaa';
        this._panel.style.fontFamily = 'monospace';
        this._panel.style.fontSize   = '2.8cqh';
        this._panel.style.whiteSpace = 'pre';
        this._panel.style.textAlign  = 'left';
        container.appendChild(this._panel);
    }

    setVisible(visible) {
        if (this._panel !== null) {
            this._panel.style.display = ((visible) ? 'block' : 'none');
        }
    }

    update() {
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
        this._panel.innerText = lines.join('\n');
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
