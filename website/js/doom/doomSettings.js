/**
 * Persistent game settings, stored as {key, value} rows in the `settings` store
 * of the spipudoom IndexedDB base. The settings UI is built from DEFINITIONS
 * and uses the generic get(); the game reads the dedicated getters.
 *
 * Types: 'bool', 'char' (one physical key code) and 'list' (the stored value is
 * one of `values: [{code, ...}]`). A list value carries exactly one of: `label`
 * (a proper name, never translated), `labelCode` (a translation code) or
 * `format` (the code rendered in the current locale, e.g. percentages).
 */
class DoomSettings {
    /**
     * @param {number[]} percents
     * @returns {object[]} [{code, format}]
     */
    static percentValues(percents) {
        return percents.map((percent) => ({code: String(percent), format: 'percent'}));
    }

    // Fine steps at the low end: a floating touch stick re-centres at every
    // touch, so there is no hardware drift to absorb.
    static get DEAD_ZONE_VALUES() {
        return DoomSettings.percentValues([0, 2.5, 5, 7.5, 10, 15]);
    }

    // 100 % = the speed of the non-firing aim gesture.
    static get SENSITIVITY_VALUES() {
        return DoomSettings.percentValues([60, 70, 80, 90, 100]);
    }

    static get VOLUME_VALUES() {
        return DoomSettings.percentValues([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    }

    static get DEFINITIONS() {
        return [
            {key: 'display.language',             nameCode: 'settings.display.language',           type: 'list', default: 'en', values: [{code: 'en', label: 'English'}, {code: 'fr', label: 'Français'}, {code: 'it', label: 'Italiano'}, {code: 'es', label: 'Español'}]},
            // Codes must match the keys of Object3dRendererList.
            {key: 'display.renderer',             nameCode: 'settings.display.renderer',           type: 'list', default: 'webgl', values: [{code: 'webgl', label: 'WebGL'}, {code: 'full', labelCode: 'value.renderer.softwareTextured'}, {code: 'flat', labelCode: 'value.renderer.softwareFlat'}, {code: 'fast', labelCode: 'value.renderer.softwareWireframe'}]},
            {key: 'display.crosshair',            nameCode: 'settings.display.crosshair',          type: 'bool', default: true},
            {key: 'display.distance_shading',     nameCode: 'settings.display.distanceShading',    type: 'bool', default: true},
            {key: 'display.texture_smoothing',    nameCode: 'settings.display.textureSmoothing',   type: 'bool', default: true},
            {key: 'display.show_fps',             nameCode: 'settings.display.showFps',            type: 'bool', default: false},
            // None of these exists in vanilla: fall damage stays off to match it,
            // jumping and crouching are on since they cost nothing when unused.
            {key: 'game.fall_damage',             nameCode: 'settings.game.fallDamage',            type: 'bool', default: false},
            {key: 'game.jump',                    nameCode: 'settings.game.jump',                  type: 'bool', default: true},
            {key: 'game.crouch',                  nameCode: 'settings.game.crouch',                type: 'bool', default: true},
            // 100 % is the UZDoom default (snd_sfxvolume / snd_musicvolume).
            {key: 'sound.volume_music',           nameCode: 'settings.sound.volumeMusic',          type: 'list', default: '100', values: DoomSettings.VOLUME_VALUES},
            {key: 'sound.volume_effects',         nameCode: 'settings.sound.volumeEffects',        type: 'list', default: '100', values: DoomSettings.VOLUME_VALUES},
            {key: 'pad.y_inverse',                nameCode: 'settings.pad.yInverse',               type: 'bool', default: false},
            {key: 'virtual_pad.y_inverse',        nameCode: 'settings.virtualPad.yInverse',        type: 'bool', default: false},
            // The firing gesture is the upper band of the aim stick, not a third stick.
            {key: 'virtual_pad.move_dead_zone',   nameCode: 'settings.virtualPad.moveDeadZone',    type: 'list', default: '15',  values: DoomSettings.DEAD_ZONE_VALUES},
            {key: 'virtual_pad.aim_dead_zone',    nameCode: 'settings.virtualPad.aimDeadZone',     type: 'list', default: '15',  values: DoomSettings.DEAD_ZONE_VALUES},
            {key: 'virtual_pad.fire_dead_zone',   nameCode: 'settings.virtualPad.fireDeadZone',    type: 'list', default: '7.5', values: DoomSettings.DEAD_ZONE_VALUES},
            {key: 'virtual_pad.fire_sensitivity', nameCode: 'settings.virtualPad.fireSensitivity', type: 'list', default: '80', values: DoomSettings.SENSITIVITY_VALUES},
            {key: 'mouse.y_inverse',              nameCode: 'settings.mouse.yInverse',             type: 'bool', default: false},
            // action = the engine mapping slot; the defaults mirror
            // InputKeyboard.DEFAULT_MAPPING.
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
        // Prototype-less: the keys come from the database, and '__proto__' must stay a plain key.
        this._values   = Object.create(null);
        this._defaults = Object.create(null);
        for (const def of DoomSettings.DEFINITIONS) {
            this._defaults[def.key] = def.default;
        }
    }

    /**
     * A storage failure keeps all the defaults.
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
        this._repairValues();

        return this;
    }

    // Resets every stored value its definition no longer accepts, before any
    // consumer reads it: Object3dRendererList throws on an unknown renderer code.
    _repairValues() {
        for (const def of DoomSettings.DEFINITIONS) {
            const value = this._values[def.key];
            if ((value === undefined) || DoomSettings.isValidValue(def, value)) {
                continue;
            }
            console.warn('DoomSettings - [' + def.key + '] held an invalid value, reset to its default');
            this.set(def.key, def.default);
        }
    }

    /**
     * A 'char' accepts any string, '' meaning unmapped.
     *
     * @param {object} def - a DEFINITIONS entry
     * @param {*} value
     * @returns {boolean}
     */
    static isValidValue(def, value) {
        if (def.type === 'list') {
            return def.values.some((item) => (item.code === value));
        }
        if (def.type === 'bool') {
            return (typeof value === 'boolean');
        }
        if (def.type === 'char') {
            return (typeof value === 'string');
        }

        return true;
    }

    getDefinitions(prefix) {
        return DoomSettings.DEFINITIONS.filter((def) => def.key.startsWith(prefix));
    }

    getDefinition(key) {
        return (DoomSettings.DEFINITIONS.find((def) => (def.key === key)) ?? null);
    }

    get(key) {
        return ((this._values[key] !== undefined) ? this._values[key] : this._defaults[key]);
    }

    // Fire-and-forget write: the in-memory value stands even if the write fails.
    set(key, value) {
        this._values[key] = value;
        if (this._database !== null) {
            this._database.put('settings', {key: key, value: value}).catch((error) => {
                console.warn('DoomSettings - unable to save [' + key + ']: ' + error.message);
            });
        }

        return this;
    }

    // Fraction 0..1 of a percent-coded 'list' value ('7.5' → 0.075).
    getPercent(key) {
        const percent = parseFloat(this.get(key));
        if (Number.isFinite(percent)) {
            return (percent / 100);
        }
        // A NaN reaching the physics would silently freeze the stick.
        console.warn('DoomSettings - [' + key + '] is not a number, falling back to its default');

        return (parseFloat(this._defaults[key]) / 100);
    }

    /**
     * Displayed label of the current value of a 'list' setting; a code missing
     * from the list shows as itself.
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

        return (entry.label ?? ((entry.labelCode !== undefined)
            ? appTranslator.get(entry.labelCode)
            : DoomSettings.formatListValue(entry)));
    }

    /**
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
     * Neighbour value of a 'list' setting, wrapping around; an unknown current
     * value restarts at the first entry.
     *
     * @param {object} def - a 'list' definition
     * @param {int} direction - 1 for the next value, -1 for the previous one
     * @returns {string} the new code
     */
    nextListValue(def, direction = 1) {
        const codes = def.values.map((item) => item.code);
        const index = codes.indexOf(this.get(def.key));

        return codes[((index + direction + codes.length) % codes.length)];
    }

    // A key serves one action only: every other binding holding it becomes '' (unmapped).
    unbindKeyCode(code, exceptKey) {
        for (const def of DoomSettings.DEFINITIONS) {
            if ((def.type === 'char') && (def.key !== exceptKey) && (this.get(def.key) === code)) {
                this.set(def.key, '');
            }
        }

        return this;
    }

    // {action: code}: only the bindings saved by the player override the engine defaults.
    getKeyboardMapping() {
        const mapping = {};
        for (const def of DoomSettings.DEFINITIONS) {
            if ((def.type === 'char') && (this._values[def.key] !== undefined)) {
                mapping[def.action] = this._values[def.key];
            }
        }

        return mapping;
    }

    // Wipes the whole store, not just the known keys, so orphan rows of older
    // versions go too. Fire-and-forget like set().
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

    // Fraction of the stick travel.
    getVirtualPadMoveDeadZone() {
        return this.getPercent('virtual_pad.move_dead_zone');
    }

    getVirtualPadAimDeadZone() {
        return this.getPercent('virtual_pad.aim_dead_zone');
    }

    getVirtualPadFireDeadZone() {
        return this.getPercent('virtual_pad.fire_dead_zone');
    }

    // 1 = the speed of the non-firing aim gesture.
    getVirtualPadFireSensitivity() {
        return this.getPercent('virtual_pad.fire_sensitivity');
    }

    getMouseYInverse() {
        return (this.get('mouse.y_inverse') === true);
    }

    getDisplayLanguage() {
        return this.get('display.language');
    }

    getDisplayRenderer() {
        return this.get('display.renderer');
    }

    getDisplayCrosshair() {
        return (this.get('display.crosshair') === true);
    }

    getDisplayShowFps() {
        return (this.get('display.show_fps') === true);
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

    // Linear fraction 0..1: the SoundEngine owns the loudness curve.
    getSoundVolumeMusic() {
        return this.getPercent('sound.volume_music');
    }

    getSoundVolumeEffects() {
        return this.getPercent('sound.volume_effects');
    }
}

const doomSettings = new DoomSettings();
