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

    // Full-screen feedback tint, painted once per frame on the HUD container.
    // The whole policy lives in ONE aggregation point, _computeScreenTint —
    // game HUDs override it with their own rules and colors.
    _applyScreenFlash() {
        if ((this._user === null) || (this._container === null)) {
            return;
        }
        this._container.style.backgroundColor = (this._computeScreenTint() ?? 'transparent');
    }

    // Aggregates every tint source into one CSS color (null = none). Default:
    // death > decaying damage flash > decaying pickup pulse, with neutral
    // engine colors; the flash values live on the User and decay there.
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

    // Merge one tint INTO the accumulated [r, g, b, a] blend, in place
    // (V_AddBlend, v_blend.cpp — originally from Quake 2). The accumulated
    // layers keep dstA/outA of the color and the new tint takes the rest —
    // algebraically the EARLIER layers sit in front, though a strong new
    // alpha still dominates. Stacked sources thus fade through each other
    // instead of switching abruptly.
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
