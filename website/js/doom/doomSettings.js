/**
 * Persistent game settings, stored in the `settings` store of the spipudoom
 * IndexedDB base ({key, value} rows).
 *
 * Every setting is declared in DEFINITIONS (key, display name, type,
 * default): the settings UI is built from that table (filtered by key
 * prefix, one prefix per input device), init() loads all the saved rows in
 * one pass at boot, set() persists a new value. The generic get() serves the
 * settings UI; the game code reads the dedicated getters (one per setting).
 */
class DoomSettings {
    static get DEFINITIONS() {
        return [
            {key: 'pad.y_inverse',         name: 'Inverser l\'axe vertical', type: 'bool', default: false},
            {key: 'virtual_pad.y_inverse', name: 'Inverser l\'axe vertical', type: 'bool', default: false},
            {key: 'mouse.y_inverse',       name: 'Inverser l\'axe vertical de la souris', type: 'bool', default: false},
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
     * builds one page section per device this way ('pad.', 'virtual_pad.',
     * 'mouse.', 'keyboard.').
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

        return this;
    }

    // --- Dedicated getters (game side) ---

    getPadYInverse() {
        return (this.get('pad.y_inverse') === true);
    }

    getVirtualPadYInverse() {
        return (this.get('virtual_pad.y_inverse') === true);
    }

    getMouseYInverse() {
        return (this.get('mouse.y_inverse') === true);
    }
}

const doomSettings = new DoomSettings();
