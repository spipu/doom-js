/**
 * What the items do to the players, on the main alone: every pickup — and,
 * in a multiplayer game, which of them stay on the ground —, the starting
 * loadout and the full-kit cheat, applied from the game's item catalog with
 * the ammo factor of the skill.
 */
class DoomItemRules {
    /**
     * @param {AbstractGameProfile} profile     - starting loadout and cheat armour
     * @param {DoomItemCatalog}     itemCatalog
     * @param {DoomPlayerRoster}    roster      - finds the weapon controller a pickup raises
     * @param {DoomTurnEvents}      events
     */
    constructor(profile, itemCatalog, roster, events) {
        this._profile     = profile;
        this._itemCatalog = itemCatalog;
        this._roster      = roster;
        this._events      = events;
        this._ammoFactor  = 1;
        this._rules       = null;
    }

    // The game mode's rules, which say whether picked weapons and keys stay for the other players.
    useRules(rules) {
        this._rules = rules;

        return this;
    }

    /**
     * A placed weapon or a key stays on the ground in a multiplayer game, as
     * the profile says (a weapon a monster dropped never does).
     *
     * @param {object} effect - pickup effect descriptor
     * @returns {boolean}
     */
    staysOnGround(effect) {
        if ((this._rules === null) || !this._rules.leavesPickedItems() || (effect === null) || (effect === undefined)) {
            return false;
        }
        const rules = this._profile.multiplayerItemRules();
        if (effect.weapon !== undefined) {
            return (rules.weaponsStay && (effect.dropped !== true));
        }

        return (rules.keysStay && (effect.item !== undefined) && this._isKey(effect.item));
    }

    _isKey(code) {
        const def = this._itemCatalog.getItem(code);

        return ((def !== null) && (def.getType() === 'key'));
    }

    setAmmoFactor(factor) {
        this._ammoFactor = factor;

        return this;
    }

    // --- Pickups ---

    // False leaves the thing on the ground (health/armor/ammo already full, key
    // already held). Effect shapes come from DoomThingCatalog. The pickup rings
    // for the taker alone (P_TouchSpecialThing plays it for the console player only).
    applyPickup(user, effect) {
        const consumed = this._applyPickupEffect(user, effect);
        if (consumed) {
            this._events.soundToPlayer(this._pickupSoundFor(effect), user);
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
            return ((this._isKey(effect.item)) ? 'misc/k_pkup' : 'misc/p_pkup');
        }

        return 'misc/i_pkup';
    }

    _applyPickupEffect(user, effect) {
        if ((effect === null) || (effect === undefined)) {
            return false;
        }
        if (effect.weapon !== undefined) {
            return this._pickupWeapon(user, effect.weapon, (effect.dropped === true), this.staysOnGround(effect));
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

    // A weapon staying on the ground gives nothing to a player who owns it,
    // not even its ammo (P_GiveWeapon in a netgame).
    _pickupWeapon(user, code, dropped = false, stays = false) {
        const def = this._itemCatalog.getWeapon(code);
        if ((def === null) || !this._itemCatalog.isWeaponAvailable(code) || (stays && user.hasWeapon(code))) {
            return false;
        }
        let gaveWeapon = false;
        if (!user.hasWeapon(code)) {
            user.giveWeapon(code);
            this._raiseWeapon(user, code);
            gaveWeapon = true;
        }
        // An owned weapon is still picked up as long as it tops up ammo.
        let gaveAmmo = false;
        const ammoType = def.getAmmoType();
        if (ammoType !== null) {
            // A weapon dropped by a monster gives half (vanilla wp_dropped).
            const baseAmmo = this._weaponAmmo(def, ammoType, stays);
            gaveAmmo = this._grantAmmo(user, ammoType, baseAmmo * ((dropped) ? 0.5 : 1) * this._ammoFactor);
        }
        return (gaveWeapon || gaveAmmo);
    }

    // Heretic sets a per-weapon ammoGive; Doom gives two clips, or the
    // profile's deathmatch clips for a weapon that stays (P_GiveWeapon).
    _weaponAmmo(def, ammoType, stays) {
        if (def.getAmmoGive() !== null) {
            return def.getAmmoGive();
        }
        const deathmatchClips = this._profile.multiplayerItemRules().deathmatchWeaponClips;
        const deathmatchAmmo  = (stays && (deathmatchClips !== null) && this._rules.givesDeathmatchWeaponAmmo());
        const clips           = ((deathmatchAmmo) ? deathmatchClips : DoomItemRules.WEAPON_CLIPS);

        return this._itemCatalog.getAmmo(ammoType).getClip() * clips;
    }

    _pickupAmmo(user, type, amount) {
        if (this._itemCatalog.getAmmo(type) === null) {
            return false;
        }
        return this._grantAmmo(user, type, amount * this._ammoFactor);
    }

    _pickupBackpack(user) {
        for (const code of this._itemCatalog.getAmmoCodes()) {
            const ammo = this._itemCatalog.getAmmo(code);
            user.setAmmoMax(code, ammo.getMaxPack());
            this._grantAmmo(user, code, ammo.getPackGive() * this._ammoFactor);
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
        const def = this._itemCatalog.getItem(code);
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

        for (const code of this._itemCatalog.getWeaponCodes()) {
            user.declareWeapon(code);
        }
        for (const code of loadout.weapons) {
            user.giveWeapon(code);
        }
        if (loadout.activeWeapon !== null) {
            user.setActiveWeapon(loadout.activeWeapon);
        }

        for (const code of this._itemCatalog.getAmmoCodes()) {
            user.setAmmoMax(code, this._itemCatalog.getAmmo(code).getMaxNormal());
        }
        for (const code of Object.keys(loadout.ammo)) {
            user.giveAmmo(code, loadout.ammo[code]);
        }

        user.setMaxArmor(loadout.maxArmor);
        user.setArmor(0);
    }

    giveAllKeys(user) {
        for (const code of this._itemCatalog.getItemCodes()) {
            if (this._isKey(code)) {
                user.giveItem(code);
            }
        }
    }

    // Debug cheat (the 'o' key).
    applyCheatFullKit(user) {
        for (const code of this._itemCatalog.getWeaponCodes()) {
            if (this._itemCatalog.isWeaponAvailable(code)) {
                user.giveWeapon(code);
            }
        }

        for (const code of this._itemCatalog.getAmmoCodes()) {
            user.giveAmmo(code, user.getAmmoMax(code));
        }

        this.giveAllKeys(user);

        const armor = this._profile.cheatKitArmor();
        user.setEnergy(user.getMaxEnergy());
        user.setMaxArmor(this._profile.startingLoadout().maxArmor);
        user.setArmor(armor.points);
        user.setArmorAbsorb(armor.absorb);
    }
}

// Clips of ammo a weapon picked up gives (P_GiveWeapon).
DoomItemRules.WEAPON_CLIPS = 2;
