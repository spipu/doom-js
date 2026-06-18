/**
 * Base of every Doom catalog definition (weapon, ammo, item). Carries the
 * properties shared by all of them. These objects are immutable shared
 * definitions: the per-player state lives on DoomUser, never here.
 *
 * resetOnNewLevel drives the data-driven inter-level persistence: weapons and
 * ammo persist (false), keys and other items are reset (true). The default is
 * set by each subclass and can be overridden per definition.
 */
class AbstractDoomObject {
    constructor(data, defaultResetOnNewLevel) {
        this._code     = data.code;
        this._name     = data.name;
        this._hudImage = data.hudImage ?? null;
        this._resetOnNewLevel = ((data.resetOnNewLevel !== undefined) ? (data.resetOnNewLevel === true) : defaultResetOnNewLevel);
    }

    getCode() {
        return this._code;
    }

    getName() {
        return this._name;
    }

    getHudImage() {
        return this._hudImage;
    }

    isResetOnNewLevel() {
        return this._resetOnNewLevel;
    }
}
