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
        if (this._inputs) {
            lines.push(this._buildInputs());
        }
        for (const message of this._descriptions) {
            lines.push(((typeof message === 'function') ? message() : message));
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
