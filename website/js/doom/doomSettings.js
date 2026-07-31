/**
 * Persistent game settings, stored in the `settings` store of the spipudoom
 * IndexedDB base ({key, value} rows).
 *
 * Every setting is declared in DEFINITIONS (key, display name, type,
 * default): the settings UI is built from that table (filtered by key
 * prefix, one prefix per input device), init() loads all the saved rows in
 * one pass at boot, set() persists a new value. The generic get() serves the
 * settings UI; the game code reads the dedicated getters (one per setting).
 *
 * Types: 'bool' (Oui/Non), 'char' (one physical key code, captured in the UI)
 * and 'list' — a closed set of values the definition carries as
 * `values: [{code, label}]`, of any length: the stored value is the code, the
 * UI shows the label and steps through the list (nextListValue).
 */
class DoomSettings {
    /**
     * Values of a percent-coded 'list' setting: the code is the raw percent,
     * the label its French rendering ('7.5' → '7,5 %') — built from one source
     * so a code can never drift from its label.
     *
     * @param {number[]} percents
     * @returns {object[]} [{code, label}]
     */
    static percentValues(percents) {
        return percents.map((percent) => ({
            code:  String(percent),
            label: String(percent).replace('.', ',') + ' %'
        }));
    }

    // Dead zones offered for the virtual pad's gestures: fine steps at the
    // bottom of the scale, which is where a touch stick needs them (a floating
    // stick re-centres at every touch, there is no hardware drift to absorb).
    static get DEAD_ZONE_VALUES() {
        return DoomSettings.percentValues([0, 2.5, 5, 7.5, 10, 15]);
    }

    // Output sensitivities offered for the firing gesture; 100 % = the speed of
    // the silent aim gesture.
    static get SENSITIVITY_VALUES() {
        return DoomSettings.percentValues([60, 70, 80, 90, 100]);
    }

    static get DEFINITIONS() {
        return [
            // Display options ('display.' prefix = the "Affichage" help page).
            {key: 'display.language',          name: 'Langue',                               type: 'list', default: 'fr', values: [{code: 'fr', label: 'Français'}, {code: 'en', label: 'English'}]},
            {key: 'display.crosshair',         name: 'Afficher le réticule',                 type: 'bool', default: true},
            {key: 'display.distance_shading',  name: 'Assombrissement à la distance',        type: 'bool', default: true},
            {key: 'display.texture_smoothing', name: 'Lissage des textures',                 type: 'bool', default: true},
            // Per-device look options.
            {key: 'pad.y_inverse',            name: 'Inverser l\'axe vertical',              type: 'bool', default: false},
            {key: 'virtual_pad.y_inverse',    name: 'Inverser l\'axe vertical',              type: 'bool', default: false},
            // Virtual pad tuning: one dead zone per gesture (the firing gesture
            // is the upper band of the aim stick), plus the output sensitivity
            // of the firing gesture. Codes are raw percents (see getPercent).
            {key: 'virtual_pad.move_dead_zone', name: 'Stick de déplacement — zone morte',    type: 'list', default: '15',  values: DoomSettings.DEAD_ZONE_VALUES},
            {key: 'virtual_pad.aim_dead_zone',  name: 'Stick de visée — zone morte',          type: 'list', default: '15',  values: DoomSettings.DEAD_ZONE_VALUES},
            {key: 'virtual_pad.fire_dead_zone', name: 'Stick de visée en tirant — zone morte', type: 'list', default: '7.5', values: DoomSettings.DEAD_ZONE_VALUES},
            {key: 'virtual_pad.fire_sensitivity', name: 'Stick de visée en tirant — sensibilité', type: 'list', default: '80', values: DoomSettings.SENSITIVITY_VALUES},
            {key: 'mouse.y_inverse',          name: 'Inverser l\'axe vertical de la souris', type: 'bool', default: false},
            // Keyboard bindings ('char' = one PHYSICAL key code, captured in
            // the settings UI). action = the engine mapping slot; the
            // defaults mirror InputKeyboard.DEFAULT_MAPPING one for one.
            {key: 'keyboard.forward',      name: 'Avancer',                  type: 'char', default: 'KeyW',      action: 'forward'},
            {key: 'keyboard.backward',     name: 'Reculer',                  type: 'char', default: 'KeyS',      action: 'backward'},
            {key: 'keyboard.strafe_left',  name: 'Pas à gauche',             type: 'char', default: 'KeyA',      action: 'strafeLeft'},
            {key: 'keyboard.strafe_right', name: 'Pas à droite',             type: 'char', default: 'KeyD',      action: 'strafeRight'},
            {key: 'keyboard.jump',         name: 'Sauter',                   type: 'char', default: 'ShiftLeft', action: 'jump'},
            {key: 'keyboard.crouch',       name: 'S\'accroupir',             type: 'char', default: 'ControlLeft', action: 'crouch'},
            {key: 'keyboard.action',       name: 'Action / utiliser',        type: 'char', default: 'KeyE',      action: 'action'},
            {key: 'keyboard.fire',         name: 'Tirer',                    type: 'char', default: 'KeyQ',      action: 'fire'},
            {key: 'keyboard.weapon_prev',  name: 'Arme précédente',          type: 'char', default: 'KeyF',      action: 'weaponPrev'},
            {key: 'keyboard.weapon_next',  name: 'Arme suivante',            type: 'char', default: 'KeyG',      action: 'weaponNext'},
            {key: 'keyboard.walk_slow',    name: 'Marcher lentement',        type: 'char', default: 'AltLeft',   action: 'walkSlow'},
            {key: 'keyboard.pause',        name: 'Pause / quitter le niveau', type: 'char', default: 'KeyP',     action: 'pause'},
            {key: 'keyboard.toggle_hud',   name: 'Afficher le HUD de debug', type: 'char', default: 'KeyH',      action: 'toggleHud'},
            {key: 'keyboard.look_down',    name: 'Fausse souris - Y+',       type: 'char', default: 'KeyK',      action: 'lookDown'},
            {key: 'keyboard.look_up',      name: 'Fausse souris - Y-',       type: 'char', default: 'KeyI',      action: 'lookUp'},
            {key: 'keyboard.look_right',   name: 'Fausse souris - X+',       type: 'char', default: 'KeyL',      action: 'lookRight'},
            {key: 'keyboard.look_left',    name: 'Fausse souris - X-',       type: 'char', default: 'KeyJ',      action: 'lookLeft'}
        ];
    }

    constructor() {
        this._database = null;
        this._values   = {};
        this._defaults = {};
        for (const def of DoomSettings.DEFINITIONS) {
            this._defaults[def.key] = def.default;
        }
    }

    /**
     * Loads every saved setting at once. Unsaved keys keep their default; a
     * storage failure keeps all the defaults (the game stays playable).
     *
     * @param {AppDatabase} database - the opened spipudoom database
     */
    async init(database) {
        this._database = database;
        this._values   = {};
        try {
            const rows = await database.getAll('settings');
            for (const row of rows) {
                this._values[row.key] = row.value;
            }
        } catch (error) {
            console.warn('DoomSettings - unable to load the settings: ' + error.message);
        }

        return this;
    }

    /**
     * Definitions whose key starts with the given prefix — the settings UI
     * builds its pages this way: one section per device ('pad.',
     * 'virtual_pad.', 'mouse.', 'keyboard.') plus the display page
     * ('display.').
     */
    getDefinitions(prefix) {
        return DoomSettings.DEFINITIONS.filter((def) => def.key.startsWith(prefix));
    }

    /**
     * Raw read (settings UI); an unset key falls back to its default.
     */
    get(key) {
        return ((this._values[key] !== undefined) ? this._values[key] : this._defaults[key]);
    }

    /**
     * Updates the value and persists it. Fire-and-forget write: the in-memory
     * value is authoritative for the session even if the write fails.
     */
    set(key, value) {
        this._values[key] = value;
        if (this._database !== null) {
            this._database.put('settings', {key: key, value: value}).catch((error) => {
                console.warn('DoomSettings - unable to save [' + key + ']: ' + error.message);
            });
        }

        return this;
    }

    /**
     * Fraction 0..1 of a percent-coded 'list' value ('7.5' → 0.075) — the shape
     * every percentage setting uses (see percentValues).
     */
    getPercent(key) {
        return parseFloat(this.get(key)) / 100;
    }

    /**
     * Label of the current value of a 'list' setting — what the UI displays.
     * A saved code missing from the list (a value dropped since) falls back to
     * the code itself rather than showing an empty row.
     *
     * @param {object} def - a 'list' definition
     * @returns {string}
     */
    getListLabel(def) {
        const value = this.get(def.key);
        const entry = def.values.find((item) => (item.code === value));

        return ((entry !== undefined) ? entry.label : String(value));
    }

    /**
     * Next value of a 'list' setting, wrapping back to the first — the step
     * applied when the UI activates its row. An unknown current value restarts
     * at the first entry.
     *
     * @param {object} def - a 'list' definition
     * @returns {string} the new code
     */
    nextListValue(def) {
        const codes = def.values.map((item) => item.code);
        const index = codes.indexOf(this.get(def.key));

        return codes[((index + 1) % codes.length)];
    }

    /**
     * Removes the given key code from every OTHER keyboard binding that
     * carries it (a key can only serve one action) — the emptied binding is
     * saved as '' (unmapped).
     */
    unbindKeyCode(code, exceptKey) {
        for (const def of DoomSettings.DEFINITIONS) {
            if ((def.type === 'char') && (def.key !== exceptKey) && (this.get(def.key) === code)) {
                this.set(def.key, '');
            }
        }

        return this;
    }

    /**
     * Keyboard mapping for the engine ({action: code}): only the bindings
     * explicitly SAVED by the player override the engine defaults; a ''
     * value unmaps the action.
     */
    getKeyboardMapping() {
        const mapping = {};
        for (const def of DoomSettings.DEFINITIONS) {
            if ((def.type === 'char') && (this._values[def.key] !== undefined)) {
                mapping[def.action] = this._values[def.key];
            }
        }

        return mapping;
    }

    /**
     * Deletes EVERY saved setting — everything falls back to the defaults.
     * The whole store is wiped (not just the known keys), so orphan rows of
     * older versions go away too. In-memory values reset immediately, the
     * store wipe is fire-and-forget like set().
     */
    resetAll() {
        this._values = {};
        if (this._database !== null) {
            this._database.getAll('settings').then((rows) => this._database.deleteMulti(
                rows.map((row) => ({storeName: 'settings', key: row.key}))
            )).catch((error) => {
                console.warn('DoomSettings - unable to reset the settings: ' + error.message);
            });
        }

        return this;
    }

    /**
     * Pushes the input-related settings onto the engine Inputs — called at
     * game init and after every change from the settings UI.
     */
    applyToInputs(inputs) {
        inputs.setLookInvertY('gamepad', this.getPadYInverse());
        inputs.setLookInvertY('virtualGamepad', this.getVirtualPadYInverse());
        inputs.setLookInvertY('keyboardMouse', this.getMouseYInverse());
        inputs.setKeyMapping(this.getKeyboardMapping());
        inputs.setVirtualPadDeadZone('move', this.getVirtualPadMoveDeadZone());
        inputs.setVirtualPadDeadZone('aim', this.getVirtualPadAimDeadZone());
        inputs.setVirtualPadDeadZone('fire', this.getVirtualPadFireDeadZone());
        inputs.setVirtualPadSensitivity(this.getVirtualPadFireSensitivity());

        return this;
    }

    // --- Dedicated getters (game side) ---

    getPadYInverse() {
        return (this.get('pad.y_inverse') === true);
    }

    getVirtualPadYInverse() {
        return (this.get('virtual_pad.y_inverse') === true);
    }

    // Dead zones of the virtual pad's three gestures, as a fraction of the
    // stick travel.
    getVirtualPadMoveDeadZone() {
        return this.getPercent('virtual_pad.move_dead_zone');
    }

    getVirtualPadAimDeadZone() {
        return this.getPercent('virtual_pad.aim_dead_zone');
    }

    getVirtualPadFireDeadZone() {
        return this.getPercent('virtual_pad.fire_dead_zone');
    }

    // Output sensitivity of the firing gesture (1 = the silent aim speed).
    getVirtualPadFireSensitivity() {
        return this.getPercent('virtual_pad.fire_sensitivity');
    }

    getMouseYInverse() {
        return (this.get('mouse.y_inverse') === true);
    }

    // Interface language code ('fr' | 'en'). Stored and editable, not consumed
    // yet — no text is localized at this point.
    getDisplayLanguage() {
        return this.get('display.language');
    }

    getDisplayCrosshair() {
        return (this.get('display.crosshair') === true);
    }

    getDisplayDistanceShading() {
        return (this.get('display.distance_shading') === true);
    }

    getDisplayTextureSmoothing() {
        return (this.get('display.texture_smoothing') === true);
    }
}

const doomSettings = new DoomSettings();
