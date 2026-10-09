/**
 * Persistent game settings, stored as {key, value} rows in the `settings` store
 * of the spipudoom IndexedDB base. The settings UI is built from DEFINITIONS
 * and uses the generic get(); the game reads the dedicated getters.
 *
 * Types: 'bool', 'char' (one physical key code), 'padButton' (one gamepad
 * button index, null unmapped), 'padAxis' (a signed axis code, see axisCode,
 * AXIS_NONE unmapped), 'list' (the stored value is
 * one of `values: [{code, ...}]`) and 'text' (a free string restricted to its
 * `charset`, `maxLength` long at most, uppercased). A list value carries exactly
 * one of: `label` (a proper name, never translated), `labelCode` (a translation
 * code) or `format` (the code rendered in the current locale, e.g. percentages).
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

    /**
     * @param {number[]} numbers
     * @param {string}   format  - see formatListValue
     * @returns {object[]} "none" first, then [{code, format}]
     */
    static limitValues(numbers, format) {
        return [{code: DoomSettings.LIMIT_NONE, labelCode: 'value.noLimit'}]
            .concat(numbers.map((number) => ({code: String(number), format: format})));
    }

    static get FRAG_LIMIT_VALUES() {
        return DoomSettings.limitValues([5, 10, 15, 20, 30, 50], 'number');
    }

    static get TIME_LIMIT_VALUES() {
        return DoomSettings.limitValues([5, 10, 15, 20, 30], 'minutes');
    }

    // Deathmatch 1.0 and 2.0 ("altdeath"), named by what they do.
    static get DEATHMATCH_ITEMS_VALUES() {
        return [
            {code: DoomSettings.DEATHMATCH_WEAPONS_STAY, labelCode: 'value.deathmatchItems.weaponsStay'},
            {code: DoomSettings.DEATHMATCH_ITEMS_RESPAWN, labelCode: 'value.deathmatchItems.itemsRespawn'}
        ];
    }

    static get NICKNAME_CHARSET() {
        return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -';
    }

    static get DEFINITIONS() {
        return [
            {key: 'display.language',             nameCode: 'settings.display.language',           type: 'list', default: 'en', values: [{code: 'en', label: 'English'}, {code: 'fr', label: 'Français'}, {code: 'it', label: 'Italiano'}, {code: 'es', label: 'Español'}]},
            // Codes must match the keys of Object3dRendererList.
            {key: 'display.renderer',             nameCode: 'settings.display.renderer',           type: 'list', default: 'webgl', values: [{code: 'webgl', label: 'WebGL'}, {code: 'full', labelCode: 'value.renderer.softwareTextured'}, {code: 'flat', labelCode: 'value.renderer.softwareFlat'}, {code: 'fast', labelCode: 'value.renderer.softwareWireframe'}]},
            {key: 'display.crosshair',            nameCode: 'settings.display.crosshair',          type: 'bool', default: true},
            {key: 'display.distance_shading',     nameCode: 'settings.display.distanceShading',    type: 'bool', default: true},
            {key: 'display.texture_smoothing',    nameCode: 'settings.display.textureSmoothing',   type: 'bool', default: true},
            // Read when a level is built: a change shows from the next load on.
            {key: 'display.water_effects',        nameCode: 'settings.display.waterEffects',       type: 'bool', default: false},
            {key: 'display.show_fps',             nameCode: 'settings.display.showFps',            type: 'bool', default: false},
            // None of these exists in vanilla: fall damage stays off to match it,
            // jumping and crouching are on since they cost nothing when unused.
            {key: 'game.fall_damage',             nameCode: 'settings.game.fallDamage',            type: 'bool', default: false},
            {key: 'game.jump',                    nameCode: 'settings.game.jump',                  type: 'bool', default: true},
            {key: 'game.crouch',                  nameCode: 'settings.game.crouch',                type: 'bool', default: true},
            {key: 'multiplayer.nickname',         nameCode: 'settings.multiplayer.nickname',       type: 'text', default: '', charset: DoomSettings.NICKNAME_CHARSET, maxLength: 16},
            // The defaults of the original: friendly fire on, and a plain -deathmatch
            // keeps its monsters, has no limit and leaves the weapons in place.
            {key: 'multiplayer.friendly_fire',    nameCode: 'settings.multiplayer.friendlyFire',   type: 'bool', default: true},
            {key: 'multiplayer.dm_monsters',      nameCode: 'settings.multiplayer.dmMonsters',     type: 'bool', default: true},
            {key: 'multiplayer.frag_limit',       nameCode: 'settings.multiplayer.fragLimit',      type: 'list', default: DoomSettings.LIMIT_NONE, values: DoomSettings.FRAG_LIMIT_VALUES},
            {key: 'multiplayer.time_limit',       nameCode: 'settings.multiplayer.timeLimit',      type: 'list', default: DoomSettings.LIMIT_NONE, values: DoomSettings.TIME_LIMIT_VALUES},
            {key: 'multiplayer.dm_items',         nameCode: 'settings.multiplayer.dmItems',        type: 'list', default: DoomSettings.DEATHMATCH_WEAPONS_STAY, values: DoomSettings.DEATHMATCH_ITEMS_VALUES},
            // 100 % is the UZDoom default (snd_sfxvolume / snd_musicvolume).
            {key: 'sound.volume_music',           nameCode: 'settings.sound.volumeMusic',          type: 'list', default: '100', values: DoomSettings.VOLUME_VALUES},
            {key: 'sound.volume_effects',         nameCode: 'settings.sound.volumeEffects',        type: 'list', default: '100', values: DoomSettings.VOLUME_VALUES},
            // Codes must match Inputs.MODES; the Controls page offers the available ones only.
            {key: 'controls.device',              nameCode: 'settings.controls.device',            type: 'list', default: DoomSettings.DEVICE_AUTO, values: [{code: DoomSettings.DEVICE_AUTO, labelCode: 'device.auto'}, {code: 'keyboardMouse', labelCode: 'device.keyboardMouse'}, {code: 'gamepad', labelCode: 'device.gamepad'}, {code: 'virtualGamepad', labelCode: 'device.virtualPad'}]},
            {key: 'pad.y_inverse',                nameCode: 'settings.pad.yInverse',               type: 'bool', default: false},
            // Captured by pushing the stick towards `direction`; the defaults
            // mirror InputGamepad.DEFAULT_AXIS_MAPPING.
            {key: 'pad.move_x',                   nameCode: 'settings.pad.moveX',                  type: 'padAxis', default: '+0', action: 'moveX', direction: 'right'},
            {key: 'pad.move_y',                   nameCode: 'settings.pad.moveY',                  type: 'padAxis', default: '+1', action: 'moveY', direction: 'up'},
            {key: 'pad.look_x',                   nameCode: 'settings.pad.lookX',                  type: 'padAxis', default: '+2', action: 'lookX', direction: 'right'},
            {key: 'pad.look_y',                   nameCode: 'settings.pad.lookY',                  type: 'padAxis', default: '+5', action: 'lookY', direction: 'up'},
            // The defaults mirror InputGamepad.DEFAULT_MAPPING.
            {key: 'pad.run',                      nameCode: 'settings.action.run',                 type: 'padButton', default: 10, action: 'run'},
            {key: 'pad.jump',                     nameCode: 'settings.action.jump',                type: 'padButton', default: 1,  action: 'jump'},
            {key: 'pad.crouch',                   nameCode: 'settings.action.crouch',              type: 'padButton', default: 0,  action: 'crouch'},
            {key: 'pad.action',                   nameCode: 'settings.action.action',              type: 'padButton', default: 3,  action: 'action'},
            {key: 'pad.fire',                     nameCode: 'settings.action.fire',                type: 'padButton', default: 7,  action: 'fire'},
            {key: 'pad.weapon_prev',              nameCode: 'settings.action.weaponPrev',          type: 'padButton', default: 4,  action: 'weaponPrev'},
            {key: 'pad.weapon_next',              nameCode: 'settings.action.weaponNext',          type: 'padButton', default: 5,  action: 'weaponNext'},
            {key: 'pad.map',                      nameCode: 'settings.action.map',                 type: 'padButton', default: 12, action: 'map'},
            {key: 'pad.pause',                    nameCode: 'settings.action.pause',               type: 'padButton', default: 9,  action: 'pause'},
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
            {key: 'keyboard.run',                 nameCode: 'settings.action.run',                 type: 'char', default: 'ShiftLeft', action: 'run'},
            {key: 'keyboard.jump',                nameCode: 'settings.action.jump',                type: 'char', default: 'Space',     action: 'jump'},
            {key: 'keyboard.crouch',              nameCode: 'settings.action.crouch',              type: 'char', default: 'KeyC',      action: 'crouch'},
            {key: 'keyboard.action',              nameCode: 'settings.action.action',              type: 'char', default: 'KeyE',      action: 'action'},
            {key: 'keyboard.fire',                nameCode: 'settings.action.fire',                type: 'char', default: 'KeyQ',      action: 'fire'},
            {key: 'keyboard.weapon_prev',         nameCode: 'settings.action.weaponPrev',          type: 'char', default: 'KeyF',      action: 'weaponPrev'},
            {key: 'keyboard.weapon_next',         nameCode: 'settings.action.weaponNext',          type: 'char', default: 'KeyG',      action: 'weaponNext'},
            {key: 'keyboard.toggle_hud',          nameCode: 'settings.keyboard.toggleHud',         type: 'char', default: 'KeyH',      action: 'toggleHud'},
            {key: 'keyboard.map',                 nameCode: 'settings.action.map',                 type: 'char', default: 'Tab',       action: 'map'},
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
            const rows = await database.getAll(DoomDatabaseSchema.SETTING);
            for (const row of rows) {
                this._values[row.key] = row.value;
            }
        } catch (error) {
            console.warn('DoomSettings - unable to load the settings: ' + error.message);
        }
        this._repairValues();
        this._yieldTakenDefaults();

        return this;
    }

    // A key, a button or an axis serves one action only: an action still on its
    // default gives it up when the player saved it for another action (a
    // default that moved onto a key the player had already chosen).
    _yieldTakenDefaults() {
        for (const type of DoomSettings.BINDING_TYPES) {
            const bindingDefs = DoomSettings.DEFINITIONS.filter((def) => (def.type === type));
            const saved       = new Set(bindingDefs.filter((def) => (this._values[def.key] !== undefined))
                .map((def) => DoomSettings.boundControl(def, this._values[def.key])));
            for (const def of bindingDefs) {
                if ((this._values[def.key] === undefined) && saved.has(DoomSettings.boundControl(def, def.default))) {
                    this.set(def.key, DoomSettings.UNBOUND_VALUES[type]);
                }
            }
        }
    }

    // Resets every stored value its definition no longer accepts, before any
    // consumer reads it: Object3dRendererList throws on an unknown renderer code.
    _repairValues() {
        for (const def of DoomSettings.DEFINITIONS) {
            const value = this._values[def.key];
            if ((value === undefined) || DoomSettings.isValidValue(def, value)) {
                continue;
            }
            console.warn('DoomSettings - [' + def.key + '] held an invalid value, repaired');
            this.set(def.key, DoomSettings._repairedValue(def, value));
        }
    }

    // A text keeps what survives its sanitising; anything else falls back to the default.
    static _repairedValue(def, value) {
        if ((def.type === 'text') && (typeof value === 'string')) {
            return DoomSettings.sanitizeText(def, value);
        }

        return def.default;
    }

    /**
     * Characters a typed character stands for, once uppercased and stripped of
     * its diacritics ('é' → 'E', 'ß' → 'SS'); '' when the charset refuses it.
     *
     * @param {object} def  - a 'text' definition
     * @param {string} char
     * @returns {string}
     */
    static normalizeTextChar(def, char) {
        const plain = char.toUpperCase().normalize('NFD').replace(DoomSettings.DIACRITICS, '');

        return (Array.from(plain).every((c) => def.charset.includes(c)) ? plain : '');
    }

    /**
     * The value a 'text' setting stores: every character normalized, the
     * refused ones dropped, inner runs of spaces collapsed, trimmed, cut to its
     * maximum length.
     *
     * @param {object} def   - a 'text' definition
     * @param {string} value
     * @returns {string}
     */
    static sanitizeText(def, value) {
        const kept = Array.from(value, (char) => DoomSettings.normalizeTextChar(def, char)).join('');

        return kept.replace(/ +/g, ' ').trim().slice(0, def.maxLength).trim();
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
        if (def.type === 'padButton') {
            return ((value === null) || (Number.isInteger(value) && (value >= 0)));
        }
        if (def.type === 'padAxis') {
            return ((value === DoomSettings.AXIS_NONE) || ((typeof value === 'string') && DoomSettings.AXIS_CODE.test(value)));
        }
        if (def.type === 'text') {
            return ((typeof value === 'string') && (DoomSettings.sanitizeText(def, value) === value));
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
            this._database.upsert(DoomDatabaseSchema.SETTING, DoomDatabaseSchema.SETTING_BY_KEY, {key: key, value: value}).catch((error) => {
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
        const locale = appTranslator.getLocale();
        if (entry.format === 'percent') {
            return new Intl.NumberFormat(locale, {style: 'percent', maximumFractionDigits: 1})
                .format(parseFloat(entry.code) / 100);
        }
        if (entry.format === 'number') {
            return new Intl.NumberFormat(locale).format(parseFloat(entry.code));
        }
        if (entry.format === 'minutes') {
            return new Intl.NumberFormat(locale, {style: 'unit', unit: 'minute', unitDisplay: 'long'})
                .format(parseFloat(entry.code));
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

    /**
     * Binds a key, a button or an axis to one action: every other binding of
     * the same kind holding it becomes unmapped.
     *
     * @param {object} definition - a 'char', 'padButton' or 'padAxis' definition
     * @param {string|int} value
     */
    bind(definition, value) {
        const target = DoomSettings.boundControl(definition, value);
        for (const def of DoomSettings.DEFINITIONS) {
            if ((def.type === definition.type) && (def.key !== definition.key) && (DoomSettings.boundControl(def, this.get(def.key)) === target)) {
                this.set(def.key, DoomSettings.UNBOUND_VALUES[def.type]);
            }
        }

        return this.set(definition.key, value);
    }

    // An axis is held whatever its direction: '+3' and '-3' hold the same axis.
    static boundControl(def, value) {
        return ((def.type === 'padAxis') ? DoomSettings.parseAxisCode(value).index : value);
    }

    // {action: code}: only the bindings saved by the player override the engine defaults.
    getKeyboardMapping() {
        return this._getSavedBindings('char');
    }

    // {action: index|null}, same rule as the keyboard.
    getPadButtonMapping() {
        return this._getSavedBindings('padButton');
    }

    // {slot: {index, inverted}}, same rule as the keyboard, a null index unmapping the slot.
    getPadAxisMapping() {
        const mapping = this._getSavedBindings('padAxis');
        for (const slot of Object.keys(mapping)) {
            mapping[slot] = DoomSettings.parseAxisCode(mapping[slot]);
        }

        return mapping;
    }

    _getSavedBindings(type) {
        const mapping = {};
        for (const def of DoomSettings.DEFINITIONS) {
            if ((def.type === type) && (this._values[def.key] !== undefined)) {
                mapping[def.action] = this._values[def.key];
            }
        }

        return mapping;
    }

    // Hardware convention: '+3' is axis 3, '-3' the same axis inverted.
    static axisCode(index, inverted) {
        return ((inverted ? '-' : '+') + index);
    }

    // AXIS_NONE gives a null index.
    static parseAxisCode(code) {
        if (!DoomSettings.AXIS_CODE.test(code)) {
            return {index: null, inverted: false};
        }

        return {index: parseInt(code.slice(1), 10), inverted: code.startsWith('-')};
    }

    // Wipes the whole store, not just the known keys, so orphan rows of older
    // versions go too. Fire-and-forget like set().
    resetAll() {
        this._values = Object.create(null);
        if (this._database !== null) {
            this._database.clear(DoomDatabaseSchema.SETTING).catch((error) => {
                console.warn('DoomSettings - unable to reset the settings: ' + error.message);
            });
        }

        return this;
    }

    applyToInputs(inputs) {
        inputs.setPreferredMode(this.getControlsDevice());
        inputs.setLookInvertY('gamepad', this.getPadYInverse());
        inputs.setLookInvertY('virtualGamepad', this.getVirtualPadYInverse());
        inputs.setLookInvertY('keyboardMouse', this.getMouseYInverse());
        inputs.setKeyMapping(this.getKeyboardMapping());
        inputs.setGamepadButtonMapping(this.getPadButtonMapping());
        inputs.setGamepadAxisMapping(this.getPadAxisMapping());
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

    // The forced input mode, null for the automatic choice.
    getControlsDevice() {
        const device = this.get('controls.device');

        return ((device !== DoomSettings.DEVICE_AUTO) ? device : null);
    }

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

    getDisplayWaterEffects() {
        return (this.get('display.water_effects') === true);
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

    getMultiplayerNickname() {
        return this.get('multiplayer.nickname');
    }

    getMultiplayerFriendlyFire() {
        return (this.get('multiplayer.friendly_fire') === true);
    }

    getMultiplayerDeathmatchMonsters() {
        return (this.get('multiplayer.dm_monsters') === true);
    }

    // null: no limit.
    getMultiplayerFragLimit() {
        return this._getLimit('multiplayer.frag_limit');
    }

    // Minutes, null: no limit.
    getMultiplayerTimeLimit() {
        return this._getLimit('multiplayer.time_limit');
    }

    // DoomSettings.DEATHMATCH_WEAPONS_STAY | DEATHMATCH_ITEMS_RESPAWN
    getMultiplayerDeathmatchItems() {
        return this.get('multiplayer.dm_items');
    }

    _getLimit(key) {
        const value = this.get(key);

        return ((value === DoomSettings.LIMIT_NONE) ? null : parseInt(value, 10));
    }
}

DoomSettings.DIACRITICS               = /\p{M}/gu;
DoomSettings.LIMIT_NONE               = 'none';
DoomSettings.DEVICE_AUTO              = 'auto';
DoomSettings.AXIS_NONE                = 'none';
DoomSettings.AXIS_CODE                = /^[+-]\d+$/;
DoomSettings.BINDING_TYPES            = ['char', 'padButton', 'padAxis'];
DoomSettings.UNBOUND_VALUES           = {char: '', padButton: null, padAxis: DoomSettings.AXIS_NONE};
DoomSettings.DEATHMATCH_WEAPONS_STAY  = 'weapons_stay';
DoomSettings.DEATHMATCH_ITEMS_RESPAWN = 'items_respawn';

const doomSettings = new DoomSettings();
