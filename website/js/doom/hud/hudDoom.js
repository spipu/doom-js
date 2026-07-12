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
 * one is updated (the inactive one is hidden via setVisible). The full-screen
 * damage/pickup flash is applied once here, on the shared container.
 *
 * DoomGame keeps the same fluent wiring (new HudDoom(engine).bindUser()…): the
 * binds are forwarded to the relevant sub-view(s).
 */
class HudDoom extends AbstractHud {
    constructor(engine) {
        super(engine);
        this._debug = new HudDoomDebug(engine);
        this._game  = new HudGameBar(engine);
        this._mode  = 'game';
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
        this._applyVisibility();
    }

    // Keyboard toggle between the two views (bound to the H key by DoomGame)
    toggleMode() {
        this._mode = ((this._mode === 'game') ? 'debug' : 'game');
        this._applyVisibility();
    }

    update() {
        this._applyScreenFlash();
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
}
