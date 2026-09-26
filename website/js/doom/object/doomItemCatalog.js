/**
 * What a game holds, with nothing it does: the weapon, ammo and item catalogs
 * of one game profile, and the weapons the WAD can draw. Every device reads
 * it — the HUD for names, ammo types and the map power-up, the weapon
 * controller for its definitions — while DoomItemRules, on the main alone,
 * applies it to the players.
 */
class DoomItemCatalog {
    /**
     * @param {AbstractGameProfile} profile
     */
    constructor(profile) {
        this._ammoTypes        = profile.buildAmmoTypes();
        this._weapons          = profile.buildWeapons();
        this._items            = profile.buildItems();
        this._availableWeapons = null;   // codes whose sprites exist in this WAD
    }

    getWeapon(code) {
        return (this._weapons[code] ?? null);
    }

    getWeaponCodes() {
        return Object.keys(this._weapons);
    }

    getAmmo(code) {
        return (this._ammoTypes[code] ?? null);
    }

    getAmmoCodes() {
        return Object.keys(this._ammoTypes);
    }

    getItem(code) {
        return (this._items[code] ?? null);
    }

    getItemCodes() {
        return Object.keys(this._items);
    }

    // True when the weapon's sprites exist in the current WAD; always true
    // before the sprite bank is read.
    isWeaponAvailable(code) {
        return ((this._availableWeapons === null) || this._availableWeapons.has(code));
    }

    /**
     * Keeps the weapons whose ready sprite the WAD holds (the super shotgun is
     * absent from Doom 1 WADs) and decodes their sprites.
     *
     * @param {DoomWeaponSpriteBank} spriteBank
     */
    resolveAvailableWeapons(spriteBank) {
        this._availableWeapons = new Set();
        for (const code of Object.keys(this._weapons)) {
            const def       = this._weapons[code];
            const readyLump = def.getState(def.getEntry().ready).getLump();
            if (spriteBank.has(readyLump)) {
                this._availableWeapons.add(code);
                spriteBank.decode(def.getSpriteLumps());
            }
        }

        return this;
    }

    // Doom's computer map and Heretic's map scroll both declare `effect: 'map'`.
    hasMapPowerup(user) {
        for (const code of Object.keys(this._items)) {
            if ((this._items[code].getEffect() === 'map') && user.hasItem(code)) {
                return true;
            }
        }

        return false;
    }
}
