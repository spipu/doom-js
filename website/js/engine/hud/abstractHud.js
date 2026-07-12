class AbstractHud {
    constructor(engine) {
        this._engine    = engine;
        this._user      = null;
        this._inputs    = null;
        this._ratio     = 1;
        this._container = null;
    }

    setRatio(ratio) {
        this._ratio = ratio;
        return this;
    }

    bindUser(user) {
        this._user = user;
        return this;
    }

    bindInputs(inputs) {
        this._inputs = inputs;
        return this;
    }

    init(container) {
        this._container = container;
    }

    // Show/hide the HUD (used by the Doom HUD coordinator to toggle views).
    // No-op by default; concrete HUDs that own a root element override it.
    setVisible(visible) {
    }

    update() {
    }

    // Full-screen feedback tint on the HUD container, common to every concrete
    // HUD (debug and the future graphical one): red while taking damage (or
    // dead), gold on item pickup, transparent otherwise. Damage takes priority
    // over the pickup flash. Both flash values live on the User and decay there.
    _applyScreenFlash() {
        if ((this._user === null) || (this._container === null)) {
            return;
        }
        if (this._user.isDead()) {
            this._container.style.backgroundColor = 'rgba(255, 0, 0, 0.5)';
            return;
        }
        if (this._user.getEnergyFlash() > 0) {
            this._container.style.backgroundColor = 'rgba(255, 0, 0, ' + Math.min(0.6, this._user.getEnergyFlash()) + ')';
            return;
        }
        if (this._user.getPickupFlash() > 0) {
            this._container.style.backgroundColor = 'rgba(215, 186, 69, ' + Math.min(0.35, this._user.getPickupFlash()) + ')';
            return;
        }
        this._container.style.backgroundColor = 'transparent';
    }
}
