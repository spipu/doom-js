/**
 * Doom HUD coordinator. It owns two views over the same overlay element and
 * toggles which one is visible and updated:
 *   - _game  : the modern graphical status bar (HudGameBar), shown by default
 *   - _debug : the textual debug overlay (HudDoomDebug: fps / position / inputs
 *              / full equipment / level / secrets)
 *
 * ScreenManager drives a single HUD (init + setRatio + update every frame), so
 * the toggle lives here rather than by re-binding the screen: both sub-views
 * init() their own DOM root into the same overlay container, and only the active
 * one is updated (the inactive one is hidden via setVisible). Every full-screen
 * tint is composited once here, on the shared container (_computeScreenTint).
 *
 * The aiming crosshair (a plain cross of two crossing bars, centred on the view
 * point) also lives here so it shows over BOTH views; it follows the
 * display.crosshair setting live (read every frame — a toggle from the help
 * modal applies without reloading).
 */
class HudDoom extends AbstractHud {
    constructor(engine) {
        super(engine);
        this._debug     = new HudDoomDebug(engine);
        this._game      = new HudGameBar(engine);
        this._mode      = 'game';
        this._crosshair = null;
    }

    bindUser(user) {
        this._user = user;
        this._debug.bindUser(user);
        this._game.bindUser(user);
        return this;
    }

    // Inputs are only surfaced by the debug view
    bindInputs(inputs) {
        this._inputs = inputs;
        this._debug.bindInputs(inputs);
        return this;
    }

    // The game bar needs the game to resolve the active weapon's ammo type and
    // name; the debug view needs it for the secret count.
    bindGame(game) {
        this._debug.bindGame(game);
        this._game.bindGame(game);
        return this;
    }

    setLevelInfo(wadId, levelCode, skill, levelName = null) {
        this._debug.setLevelInfo(wadId, levelCode, skill, levelName);
        return this;
    }

    addDescription(message) {
        this._debug.addDescription(message);
        return this;
    }

    setRatio(ratio) {
        this._ratio = ratio;
        this._debug.setRatio(ratio);
        this._game.setRatio(ratio);
        return this;
    }

    init(container) {
        super.init(container);
        this._debug.init(container);
        this._game.init(container);
        this._buildCrosshair(container);
        this._applyVisibility();
    }

    // Keyboard toggle between the two views (bound to the H key by DoomGame)
    toggleMode() {
        this._mode = ((this._mode === 'game') ? 'debug' : 'game');
        this._applyVisibility();
    }

    update() {
        this._applyScreenFlash();
        if (this._crosshair !== null) {
            this._crosshair.style.display = ((doomSettings.getDisplayCrosshair()) ? 'block' : 'none');
        }
        if (this._mode === 'game') {
            this._game.update();
            return;
        }
        this._debug.update();
    }

    _applyVisibility() {
        this._game.setVisible(this._mode === 'game');
        this._debug.setVisible(this._mode === 'debug');
    }

    // The ONE aggregation of every screen tint, composited like UZDoom's
    // V_AddPlayerBlend (v_blend.cpp, same order): the powerup layers first
    // (POWERUP_SCREEN_TINTS — radiation green, invulnerability gold — solid
    // until 4*32 remaining tics then strobing), berserk red wash fading out,
    // then the pickup pulse (BONUS gold) and the damage/death reds merged in:
    // a decaying red fades back into the layers it was mixed with instead of
    // dipping through transparent.
    _computeScreenTint() {
        const palette = WadConstants.SCREEN_FLASH_PALETTE;
        const blend   = [0, 0, 0, 0];
        for (const [code, tint] of HudDoom.POWERUP_TINT_ENTRIES) {
            if (this._user.isEffectVisible(code)) {
                AbstractHud.addBlend(blend, tint.rgb, tint.alpha);
            }
        }
        const berserkMs = this._user.getEffects()['berserkFlash'];
        if (berserkMs !== undefined) {
            const elapsedTics = WadConstants.BERSERK_FLASH_TICS - WadConstants.msToTics(berserkMs);
            AbstractHud.addBlend(blend, WadConstants.BERSERK_FLASH_RGB, WadConstants.berserkFlashAlpha(elapsedTics));
        }
        if (this._user.getPickupFlash() > 0) {
            AbstractHud.addBlend(blend, palette.pickup.rgb, Math.min(palette.pickup.maxAlpha, this._user.getPickupFlash()));
        }
        if (this._user.getEnergyFlash() > 0) {
            AbstractHud.addBlend(blend, palette.damage.rgb, Math.min(palette.damage.maxAlpha, this._user.getEnergyFlash()));
        }
        if (this._user.isDead()) {
            AbstractHud.addBlend(blend, palette.death.rgb, palette.death.alpha);
        }

        return ((blend[3] > 0) ? AbstractHud.rgba(blend, blend[3]) : null);
    }

    // A plain cross centred on the view point (where free-aim shots land):
    // a full-size wrapper carries the cqh unit (container-type like the game
    // bar root, letterbox proportional), holding one horizontal and one
    // vertical bar. Translucent lightly-red tint with a dark halo so it reads
    // on bright and dark walls alike.
    _buildCrosshair(container) {
        this._crosshair = document.createElement('div');
        Object.assign(this._crosshair.style, {
            position: 'absolute', top: '0', left: '0', width: '100%', height: '100%',
            pointerEvents: 'none', containerType: 'size'
        });
        container.appendChild(this._crosshair);

        const barStyle = {
            position: 'absolute', left: '50%', top: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: 'rgba(255, 185, 185, 0.75)',
            boxShadow: '0 0 0.15cqh rgba(0, 0, 0, 0.8)'
        };
        const horizontal = document.createElement('div');
        Object.assign(horizontal.style, barStyle, {width: '2.2cqh', height: '0.22cqh'});
        this._crosshair.appendChild(horizontal);

        const vertical = document.createElement('div');
        Object.assign(vertical.style, barStyle, {width: '0.22cqh', height: '2.2cqh'});
        this._crosshair.appendChild(vertical);
    }
}

HudDoom.POWERUP_TINT_ENTRIES = Object.entries(WadConstants.POWERUP_SCREEN_TINTS);
