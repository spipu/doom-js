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

    // Overridden by HUDs that own a root element
    setVisible(visible) {
    }

    update() {
    }

    // The tint policy lives in _computeScreenTint, which game HUDs override
    _applyScreenFlash() {
        if ((this._user === null) || (this._container === null)) {
            return;
        }
        this._container.style.backgroundColor = (this._computeScreenTint() ?? 'transparent');
    }

    // One CSS colour or null. Default priority: death > damage > pickup.
    _computeScreenTint() {
        if (this._user.isDead()) {
            return AbstractHud.rgba([255, 0, 0], 0.5);
        }
        if (this._user.getEnergyFlash() > 0) {
            return AbstractHud.rgba([255, 0, 0], Math.min(0.6, this._user.getEnergyFlash()));
        }
        if (this._user.getPickupFlash() > 0) {
            return AbstractHud.rgba([215, 186, 69], Math.min(0.35, this._user.getPickupFlash()));
        }

        return null;
    }

    // Merges one tint into the [r, g, b, a] blend in place (V_AddBlend,
    // v_blend.cpp), so stacked sources fade through each other.
    static addBlend(blend, rgb, alpha) {
        if (alpha <= 0) {
            return;
        }
        const a2 = blend[3] + (1 - blend[3]) * alpha;
        const a3 = blend[3] / a2;
        blend[0] = blend[0] * a3 + rgb[0] * (1 - a3);
        blend[1] = blend[1] * a3 + rgb[1] * (1 - a3);
        blend[2] = blend[2] * a3 + rgb[2] * (1 - a3);
        blend[3] = a2;
    }

    static rgba(rgb, alpha) {
        return ('rgba(' + Math.round(rgb[0]) + ', ' + Math.round(rgb[1]) + ', ' + Math.round(rgb[2]) + ', ' + alpha + ')');
    }
}
