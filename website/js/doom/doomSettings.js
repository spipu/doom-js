/**
 * Persistent game settings, stored in the `settings` store of the spipudoom
 * IndexedDB base ({key, value} rows).
 *
 * Every setting is declared in DEFINITIONS (key, name translation code, type,
 * default): the settings UI is built from that table (filtered by key
 * prefix, one prefix per input device), init() loads all the saved rows in
 * one pass at boot, set() persists a new value. The generic get() serves the
 * settings UI; the game code reads the dedicated getters (one per setting).
 *
 * Types: 'bool' (yes/no), 'char' (one physical key code, captured in the UI)
 * and 'list' — a closed set of values the definition carries as
 * `values: [{code, label?}]`, of any length: the stored value is the code, the
 * UI shows the label and steps through the list (nextListValue). A list value
 * carries either a literal `label` (a language autonym, never translated) or a
 * `format` tag, and is then rendered in the current locale (see getListLabel).
 */
class DoomSettings {
    /**
     * Values of a percent-coded 'list' setting: only the raw percent as a code.
     * The label is NOT stored — it is formatted at display time from the
     * current locale (see getListLabel), so '7.5' reads '7,5 %' in French and
     * '7.5 %' in English.
     *
     * @param {number[]} percents
     * @returns {object[]} [{code, format}]
     */
    static percentValues(percents) {
        return percents.map((percent) => ({code: String(percent), format: 'percent'}));
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

    // Volume steps of the two sound settings. The quadratic loudness curve
    // lives in the engine (SoundEngine), not here: the stored code is the raw
    // percent the player chose.
    static get VOLUME_VALUES() {
        return DoomSettings.percentValues([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    }

    static get DEFINITIONS() {
        return [
            // Display options ('display.' prefix = the "Affichage" help page).
            {key: 'display.language',             nameCode: 'settings.display.language',           type: 'list', default: 'en', values: [{code: 'fr', label: 'Français'}, {code: 'en', label: 'English'}]},
            {key: 'display.crosshair',            nameCode: 'settings.display.crosshair',          type: 'bool', default: true},
            {key: 'display.distance_shading',     nameCode: 'settings.display.distanceShading',    type: 'bool', default: true},
            {key: 'display.texture_smoothing',    nameCode: 'settings.display.textureSmoothing',   type: 'bool', default: true},
            // Gameplay rules ('game.' prefix = the "Jeu" help page). None of
            // the three exists in vanilla Doom: fall damage stays OFF to match
            // it, while jumping and crouching are offered on — they cost
            // nothing to a player who ignores them, unlike damage he never
            // asked for.
            {key: 'game.fall_damage',             nameCode: 'settings.game.fallDamage',            type: 'bool', default: false},
            {key: 'game.jump',                    nameCode: 'settings.game.jump',                  type: 'bool', default: true},
            {key: 'game.crouch',                  nameCode: 'settings.game.crouch',                type: 'bool', default: true},
            // Sound volumes ('sound.' prefix = the "Son" help page). 100% is
            // the UZDoom default for both (snd_sfxvolume / snd_musicvolume).
            {key: 'sound.volume_music',           nameCode: 'settings.sound.volumeMusic',          type: 'list', default: '100', values: DoomSettings.VOLUME_VALUES},
            {key: 'sound.volume_effects',         nameCode: 'settings.sound.volumeEffects',        type: 'list', default: '100', values: DoomSettings.VOLUME_VALUES},
            // Per-device look options.
            {key: 'pad.y_inverse',                nameCode: 'settings.pad.yInverse',               type: 'bool', default: false},
            {key: 'virtual_pad.y_inverse',        nameCode: 'settings.virtualPad.yInverse',        type: 'bool', default: false},
            // The firing gesture is the upper band of the aim stick, not a
            // third stick. Codes are raw percents (see getPercent).
            {key: 'virtual_pad.move_dead_zone',   nameCode: 'settings.virtualPad.moveDeadZone',    type: 'list', default: '15',  values: DoomSettings.DEAD_ZONE_VALUES},
            {key: 'virtual_pad.aim_dead_zone',    nameCode: 'settings.virtualPad.aimDeadZone',     type: 'list', default: '15',  values: DoomSettings.DEAD_ZONE_VALUES},
            {key: 'virtual_pad.fire_dead_zone',   nameCode: 'settings.virtualPad.fireDeadZone',    type: 'list', default: '7.5', values: DoomSettings.DEAD_ZONE_VALUES},
            {key: 'virtual_pad.fire_sensitivity', nameCode: 'settings.virtualPad.fireSensitivity', type: 'list', default: '80', values: DoomSettings.SENSITIVITY_VALUES},
            {key: 'mouse.y_inverse',              nameCode: 'settings.mouse.yInverse',             type: 'bool', default: false},
            // Keyboard bindings ('char' = one PHYSICAL key code, captured in
            // the settings UI). action = the engine mapping slot; the
            // defaults mirror InputKeyboard.DEFAULT_MAPPING one for one.
            {key: 'keyboard.forward',             nameCode: 'settings.keyboard.forward',           type: 'char', default: 'KeyW',      action: 'forward'},
            {key: 'keyboard.backward',            nameCode: 'settings.keyboard.backward',          type: 'char', default: 'KeyS',      action: 'backward'},
            {key: 'keyboard.strafe_left',         nameCode: 'settings.keyboard.strafeLeft',        type: 'char', default: 'KeyA',      action: 'strafeLeft'},
            {key: 'keyboard.strafe_right',        nameCode: 'settings.keyboard.strafeRight',       type: 'char', default: 'KeyD',      action: 'strafeRight'},
            {key: 'keyboard.jump',                nameCode: 'settings.keyboard.jump',              type: 'char', default: 'ShiftLeft', action: 'jump'},
            {key: 'keyboard.crouch',              nameCode: 'settings.keyboard.crouch',            type: 'char', default: 'ControlLeft', action: 'crouch'},
            {key: 'keyboard.action',              nameCode: 'settings.keyboard.action',            type: 'char', default: 'KeyE',      action: 'action'},
            {key: 'keyboard.fire',                nameCode: 'settings.keyboard.fire',              type: 'char', default: 'KeyQ',      action: 'fire'},
            {key: 'keyboard.weapon_prev',         nameCode: 'settings.keyboard.weaponPrev',        type: 'char', default: 'KeyF',      action: 'weaponPrev'},
            {key: 'keyboard.weapon_next',         nameCode: 'settings.keyboard.weaponNext',        type: 'char', default: 'KeyG',      action: 'weaponNext'},
            {key: 'keyboard.walk_slow',           nameCode: 'settings.keyboard.walkSlow',          type: 'char', default: 'AltLeft',   action: 'walkSlow'},
            {key: 'keyboard.toggle_hud',          nameCode: 'settings.keyboard.toggleHud',         type: 'char', default: 'KeyH',      action: 'toggleHud'},
            {key: 'keyboard.map',                 nameCode: 'settings.keyboard.map',               type: 'char', default: 'Tab',       action: 'map'},
            {key: 'keyboard.look_down',           nameCode: 'settings.keyboard.lookDown',          type: 'char', default: 'KeyK',      action: 'lookDown'},
            {key: 'keyboard.look_up',             nameCode: 'settings.keyboard.lookUp',            type: 'char', default: 'KeyI',      action: 'lookUp'},
            {key: 'keyboard.look_right',          nameCode: 'settings.keyboard.lookRight',         type: 'char', default: 'KeyL',      action: 'lookRight'},
            {key: 'keyboard.look_left',           nameCode: 'settings.keyboard.lookLeft',          type: 'char', default: 'KeyJ',      action: 'lookLeft'}
        ];
    }

    constructor() {
        this._database = null;
        // Prototype-less maps: the keys come from the database, and a row keyed
        // '__proto__' would otherwise mutate the prototype chain instead of
        // being stored as a plain value.
        this._values   = Object.create(null);
        this._defaults = Object.create(null);
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
        this._values   = Object.create(null);
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

    // Definitions whose key starts with the given prefix — the settings UI
    // builds its pages this way: one section per device ('pad.',
    // 'virtual_pad.', 'mouse.', 'keyboard.') plus the display page
    // ('display.').
    getDefinitions(prefix) {
        return DoomSettings.DEFINITIONS.filter((def) => def.key.startsWith(prefix));
    }

    // Raw read (settings UI); an unset key falls back to its default.
    get(key) {
        return ((this._values[key] !== undefined) ? this._values[key] : this._defaults[key]);
    }

    // Updates the value and persists it. Fire-and-forget write: the in-memory
    // value is authoritative for the session even if the write fails.
    set(key, value) {
        this._values[key] = value;
        if (this._database !== null) {
            this._database.put('settings', {key: key, value: value}).catch((error) => {
                console.warn('DoomSettings - unable to save [' + key + ']: ' + error.message);
            });
        }

        return this;
    }

    // Fraction 0..1 of a percent-coded 'list' value ('7.5' → 0.075) — the shape
    // every percentage setting uses (see percentValues).
    getPercent(key) {
        const percent = parseFloat(this.get(key));
        if (Number.isFinite(percent)) {
            return (percent / 100);
        }
        // Stored value outside the list (a value code dropped by an evolution, a
        // hand-edited base): fall back to the default rather than let a NaN
        // travel into the physics, where it silently freezes the stick.
        console.warn('DoomSettings - [' + key + '] is not a number, falling back to its default');

        return (parseFloat(this._defaults[key]) / 100);
    }

    /**
     * Label of the current value of a 'list' setting — what the UI displays:
     * the entry's literal label, or its formatted rendering when it carries a
     * format tag instead. A saved code missing from the list (a value dropped
     * since) falls back to the code itself rather than showing an empty row.
     *
     * @param {object} def - a 'list' definition
     * @returns {string}
     */
    getListLabel(def) {
        const value = this.get(def.key);
        const entry = def.values.find((item) => (item.code === value));
        if (entry === undefined) {
            return String(value);
        }

        return (entry.label ?? DoomSettings.formatListValue(entry));
    }

    /**
     * Rendering of a label-less list value, in the current locale: a 'percent'
     * code reads '7,5 %' in French and '7.5%' in English — the separator and
     * the spacing before the sign are the platform's business, not ours.
     *
     * @param {object} entry - a 'list' value {code, format}
     * @returns {string}
     */
    static formatListValue(entry) {
        if (entry.format === 'percent') {
            return new Intl.NumberFormat(appTranslator.getLocale(), {style: 'percent', maximumFractionDigits: 1})
                .format(parseFloat(entry.code) / 100);
        }

        return entry.code;
    }

    /**
     * Next value of a 'list' setting, wrapping back to the first — the step
     * applied when the UI activates its row. An unknown current value restarts
     * at the first entry.
     *
     * @param {object} def - a 'list' definition
     * @returns {string} the new code
     */
    nextListValue(def, dir = 1) {
        const codes = def.values.map((item) => item.code);
        const index = codes.indexOf(this.get(def.key));

        return codes[((index + dir + codes.length) % codes.length)];
    }

    // Removes the given key code from every OTHER keyboard binding that
    // carries it (a key can only serve one action) — the emptied binding is
    // saved as '' (unmapped).
    unbindKeyCode(code, exceptKey) {
        for (const def of DoomSettings.DEFINITIONS) {
            if ((def.type === 'char') && (def.key !== exceptKey) && (this.get(def.key) === code)) {
                this.set(def.key, '');
            }
        }

        return this;
    }

    // Keyboard mapping for the engine ({action: code}): only the bindings
    // explicitly SAVED by the player override the engine defaults; a ''
    // value unmaps the action.
    getKeyboardMapping() {
        const mapping = {};
        for (const def of DoomSettings.DEFINITIONS) {
            if ((def.type === 'char') && (this._values[def.key] !== undefined)) {
                mapping[def.action] = this._values[def.key];
            }
        }

        return mapping;
    }

    // Deletes EVERY saved setting — everything falls back to the defaults.
    // The whole store is wiped (not just the known keys), so orphan rows of
    // older versions go away too. In-memory values reset immediately, the
    // store wipe is fire-and-forget like set().
    resetAll() {
        this._values = Object.create(null);
        if (this._database !== null) {
            this._database.getAll('settings').then((rows) => this._database.deleteMulti(
                rows.map((row) => ({storeName: 'settings', key: row.key}))
            )).catch((error) => {
                console.warn('DoomSettings - unable to reset the settings: ' + error.message);
            });
        }

        return this;
    }

    // Pushes the input-related settings onto the engine Inputs — called at
    // game init and after every change from the settings UI.
    applyToInputs(inputs) {
        inputs.setLookInvertY('gamepad', this.getPadYInverse());
        inputs.setLookInvertY('virtualGamepad', this.getVirtualPadYInverse());
        inputs.setLookInvertY('keyboardMouse', this.getMouseYInverse());
        inputs.setKeyMapping(this.getKeyboardMapping());
        inputs.setVirtualPadDeadZone('move', this.getVirtualPadMoveDeadZone());
        inputs.setVirtualPadDeadZone('aim', this.getVirtualPadAimDeadZone());
        inputs.setVirtualPadDeadZone('fire', this.getVirtualPadFireDeadZone());
        inputs.setVirtualPadSensitivity(this.getVirtualPadFireSensitivity());
        inputs.setVirtualPadControlAllowed('jump', this.getGameJump());
        inputs.setVirtualPadControlAllowed('crouch', this.getGameCrouch());

        return this;
    }

    /**
     * Pushes the language onto the translator — called at boot and after every
     * change from the settings UI, like applyToInputs.
     *
     * @param {AppTranslator} translator
     */
    applyToTranslator(translator) {
        translator.setLanguage(this.getDisplayLanguage());

        return this;
    }

    // --- Dedicated getters (game side) ---

    getPadYInverse() {
        return (this.get('pad.y_inverse') === true);
    }

    getVirtualPadYInverse() {
        return (this.get('virtual_pad.y_inverse') === true);
    }

    // Fractions of the stick travel.
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

    getGameFallDamage() {
        return (this.get('game.fall_damage') === true);
    }

    getGameJump() {
        return (this.get('game.jump') === true);
    }

    getGameCrouch() {
        return (this.get('game.crouch') === true);
    }

    // Fractions 0..1 handed to the SoundEngine, which owns the loudness curve.
    getSoundVolumeMusic() {
        return this.getPercent('sound.volume_music');
    }

    getSoundVolumeEffects() {
        return this.getPercent('sound.volume_effects');
    }
}

const doomSettings = new DoomSettings();
