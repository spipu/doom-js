/**
 * The item rules of one game profile: its weapon, ammo and item catalogs, the
 * weapons the WAD can draw, and what every pickup, the starting loadout and
 * the full-kit cheat do to a player's body.
 */
class DoomItemRules {
    /**
     * @param {AbstractGameProfile} profile
     * @param {DoomPlayerRoster}    roster - finds the weapon controller a pickup raises
     */
    constructor(profile, roster) {
        this._profile          = profile;
        this._roster           = roster;
        this._ammoTypes        = profile.buildAmmoTypes();
        this._weapons          = profile.buildWeapons();
        this._items            = profile.buildItems();
        this._availableWeapons = null;   // codes whose sprites exist in this WAD
        this._ammoFactor       = 1;
    }

    getGameProfile() {
        return this._profile;
    }

    setAmmoFactor(factor) {
        this._ammoFactor = factor;

        return this;
    }

    getWeapon(code) {
        return (this._weapons[code] ?? null);
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

    getAmmo(code) {
        return (this._ammoTypes[code] ?? null);
    }

    getItem(code) {
        return (this._items[code] ?? null);
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

    // --- Pickups ---

    // False leaves the thing on the ground (health/armor/ammo already full, key
    // already held). Effect shapes come from DoomThingCatalog.
    applyPickup(user, effect) {
        const consumed = this._applyPickupEffect(user, effect);
        if (consumed) {
            doomSound.playFromPlayer(this._pickupSoundFor(effect), user, null);
        }

        return consumed;
    }

    // p_inter.c: weapons, keys and power-ups each ring their own pickup sound,
    // everything else takes the plain item blip.
    _pickupSoundFor(effect) {
        if (effect.weapon !== undefined) {
            return 'misc/w_pkup';
        }
        if (effect.item !== undefined) {
            const def = this.getItem(effect.item);
            if ((def !== null) && (def.getType() === 'key')) {
                return 'misc/k_pkup';
            }
            return 'misc/p_pkup';
        }

        return 'misc/i_pkup';
    }

    _applyPickupEffect(user, effect) {
        if ((effect === null) || (effect === undefined)) {
            return false;
        }
        if (effect.weapon !== undefined) {
            return this._pickupWeapon(user, effect.weapon, (effect.dropped === true));
        }
        if (effect.ammo !== undefined) {
            return this._pickupAmmo(user, effect.ammo, effect.amount);
        }
        if (effect.backpack === true) {
            return this._pickupBackpack(user);
        }
        if (effect.health !== undefined) {
            return user.addEnergy(effect.health, ((effect.overheal === true) ? 200 : 100));
        }
        if (effect.armor !== undefined) {
            return this._pickupArmor(user, effect.armor);
        }
        if (effect.armorBonus !== undefined) {
            return this._pickupArmorBonus(user, effect.armorBonus, effect.absorb);
        }
        if (effect.item !== undefined) {
            return this._pickupItem(user, effect.item);
        }
        if (effect.mega !== undefined) {
            // p_inter.c: the megasphere SETS the health, it does not add.
            const healed  = user.addEnergy(effect.mega.health, effect.mega.health);
            const armored = this._pickupArmor(user, effect.mega.armor);
            return (healed || armored);
        }
        return false;
    }

    // True when the counter actually rose (it stays put at the cap).
    _grantAmmo(user, type, amount) {
        const before = user.getAmmo(type);
        user.giveAmmo(type, amount);
        return (user.getAmmo(type) > before);
    }

    // Vanilla pendingweapon: the psprite machine raises it. Instant swap only
    // before the controller exists.
    _raiseWeapon(user, code) {
        if (code === null) {
            return;
        }
        const player = this._roster.getByUser(user);
        const weapon = ((player !== null) ? player.getWeapon() : null);
        if (weapon !== null) {
            weapon.requestWeapon(code);
        } else {
            user.setActiveWeapon(code);
        }
    }

    _pickupWeapon(user, code, dropped = false) {
        const def = this.getWeapon(code);
        if ((def === null) || !this.isWeaponAvailable(code)) {
            return false;
        }
        let gaveWeapon = false;
        if (!user.hasWeapon(code)) {
            user.giveWeapon(code);
            this._raiseWeapon(user, code);
            gaveWeapon = true;
        }
        // Heretic sets a per-weapon ammoGive, Doom gives two clips. An owned
        // weapon is still picked up as long as it tops up ammo.
        let gaveAmmo = false;
        const ammoType = def.getAmmoType();
        if (ammoType !== null) {
            // A weapon dropped by a monster gives half (vanilla wp_dropped).
            const baseAmmo = ((def.getAmmoGive() !== null) ? def.getAmmoGive() : this.getAmmo(ammoType).getClip() * 2);
            gaveAmmo = this._grantAmmo(user, ammoType, baseAmmo * ((dropped) ? 0.5 : 1) * this._ammoFactor);
        }
        return (gaveWeapon || gaveAmmo);
    }

    _pickupAmmo(user, type, amount) {
        if (this.getAmmo(type) === null) {
            return false;
        }
        return this._grantAmmo(user, type, amount * this._ammoFactor);
    }

    _pickupBackpack(user) {
        for (const code of Object.keys(this._ammoTypes)) {
            user.setAmmoMax(code, this._ammoTypes[code].getMaxPack());
            this._grantAmmo(user, code, this._ammoTypes[code].getPackGive() * this._ammoFactor);
        }
        return true;
    }

    // spec = {points, absorb}: an armour class of the game catalog.
    _pickupArmor(user, spec) {
        if (user.getArmor() >= spec.points) {
            return false;
        }
        user.setArmor(spec.points);
        user.setArmorAbsorb(spec.absorb);
        return true;
    }

    // absorb = the fraction granted when the bonus lands on a bare player.
    _pickupArmorBonus(user, amount, absorb) {
        if (user.getArmor() >= user.getMaxArmor()) {
            return false;
        }
        if ((user.getArmor() <= 0) && (user.getArmorAbsorb() <= 0)) {
            user.setArmorAbsorb(absorb);
        }
        user.setArmor(Math.min(user.getArmor() + amount, user.getMaxArmor()));
        return true;
    }

    _pickupItem(user, code) {
        const def = this.getItem(code);
        if (def === null) {
            return false;
        }
        if (def.getType() === 'powerupTimed') {
            user.addEffect(def.getEffect(), def.getDuration());
            return true;
        }
        // Berserk (P_GivePower pw_strength): heals before the already-owned
        // check, so every pack is consumed and restarts the red wash.
        if (def.getPickupHeal() !== null) {
            user.giveItem(code);
            user.addEnergy(def.getPickupHeal(), def.getPickupHeal());
            user.addEffect('berserkFlash', WadConstants.BERSERK_FLASH_MS);
            this._raiseWeapon(user, def.getPickupWeapon());
            return true;
        }
        if (user.hasItem(code)) {
            return false;
        }
        user.giveItem(code);
        return true;
    }

    // --- Loadouts ---

    setupLoadout(user) {
        const loadout = this._profile.startingLoadout();

        for (const code of Object.keys(this._weapons)) {
            user.declareWeapon(code);
        }
        for (const code of loadout.weapons) {
            user.giveWeapon(code);
        }
        if (loadout.activeWeapon !== null) {
            user.setActiveWeapon(loadout.activeWeapon);
        }

        for (const code of Object.keys(this._ammoTypes)) {
            user.setAmmoMax(code, this._ammoTypes[code].getMaxNormal());
        }
        for (const code of Object.keys(loadout.ammo)) {
            user.giveAmmo(code, loadout.ammo[code]);
        }

        user.setMaxArmor(loadout.maxArmor);
        user.setArmor(0);
    }

    // Debug cheat (the 'o' key).
    applyCheatFullKit(user) {
        for (const code of Object.keys(this._weapons)) {
            if (this.isWeaponAvailable(code)) {
                user.giveWeapon(code);
            }
        }

        for (const code of Object.keys(this._ammoTypes)) {
            user.giveAmmo(code, user.getAmmoMax(code));
        }

        for (const code of Object.keys(this._items)) {
            if (this._items[code].getType() === 'key') {
                user.giveItem(code);
            }
        }

        const armor = this._profile.cheatKitArmor();
        user.setEnergy(user.getMaxEnergy());
        user.setMaxArmor(this._profile.startingLoadout().maxArmor);
        user.setArmor(armor.points);
        user.setArmorAbsorb(armor.absorb);
    }
}
