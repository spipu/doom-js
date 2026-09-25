/**
 * The Doom player: the engine User plus the equipment state (weapons, ammo,
 * items, timed effects). The definitions live on DoomGame, which also pours in
 * the starting loadout after the engine loader has built the player.
 */
class DoomUser extends User {
    constructor(x, y, z, yaw, pitch, maxEnergy) {
        super(x, y, z, yaw, pitch, maxEnergy);

        this._weapons         = {};   // code -> {owned: bool}
        this._activeWeapon    = null;
        this._ammo            = {};   // code -> count
        this._ammoMax         = {};   // code -> max
        this._items           = new Set();
        this._effects         = {};   // code -> remaining time (ms)
        this._damageFactor    = 1;    // skill-derived, set by DoomGame per level
        this._exitSectorProbe = null; // (user) → bool, set by DoomGame per level
        this._controlFreezeS  = 0;
        this._jumpAllowed     = true;
        this._crouchAllowed   = true;
        this._landingSplash   = null; // (x, y, z) => void, set by DoomGame per level
    }

    setDamageFactor(factor) {
        this._damageFactor = factor;
        return this;
    }

    // (user) → bool, null when the level has no exit sector; see takeDamage.
    setExitSectorProbe(probe) {
        this._exitSectorProbe = probe;
        return this;
    }

    // P_Teleport freeze (reactiontime): movement, turning and jumping are
    // ignored, firing stays allowed like vanilla. Not part of the saved state.
    freezeControls(seconds) {
        this._controlFreezeS = seconds;
        return this;
    }

    isControlFrozen() {
        return (this._controlFreezeS > 0);
    }

    setJumpAllowed(allowed) {
        this._jumpAllowed = (allowed === true);
        return this;
    }

    setCrouchAllowed(allowed) {
        this._crouchAllowed = (allowed === true);
        return this;
    }

    beginFrame(deltaTime) {
        super.beginFrame(deltaTime);
        if (this._controlFreezeS > 0) {
            this._controlFreezeS -= deltaTime / 1000;
        }
    }

    move(scale) {
        if (this.isControlFrozen()) {
            return;
        }
        super.move(scale);
    }

    strafe(scale) {
        if (this.isControlFrozen()) {
            return;
        }
        super.strafe(scale);
    }

    lookMouse(dx, dy) {
        if (this.isControlFrozen()) {
            return;
        }
        super.lookMouse(dx, dy);
    }

    pressJump() {
        if (this.isControlFrozen() || !this._jumpAllowed) {
            return;
        }
        super.pressJump();
    }

    // releaseJump stays open: swallowing it would leave the jump held.

    // A forbidden crouch still stands the player up: the setting may go off while he is down.
    setCrouch(crouched) {
        if (this.isControlFrozen()) {
            return;
        }
        super.setCrouch(crouched && this._crouchAllowed);
    }

    // --- Weapons ---
    declareWeapon(code) {
        if (this._weapons[code] === undefined) {
            this._weapons[code] = {owned: false};
        }
        return this;
    }

    giveWeapon(code) {
        this.declareWeapon(code);
        this._weapons[code].owned = true;
        return this;
    }

    hasWeapon(code) {
        return ((this._weapons[code] !== undefined) && (this._weapons[code].owned === true));
    }

    setActiveWeapon(code) {
        this._activeWeapon = code;
        return this;
    }

    getActiveWeapon() {
        return this._activeWeapon;
    }

    // --- Ammo (shared pool by type) ---
    setAmmoMax(type, max) {
        this._ammoMax[type] = max;
        if (this._ammo[type] === undefined) {
            this._ammo[type] = 0;
        }
        return this;
    }

    giveAmmo(type, amount) {
        const max = (this._ammoMax[type] ?? 0);
        this._ammo[type] = Math.min(max, (this._ammo[type] ?? 0) + amount);
        return this;
    }

    useAmmo(type, amount) {
        this._ammo[type] = Math.max(0, (this._ammo[type] ?? 0) - amount);
        return this;
    }

    getAmmo(type) {
        return (this._ammo[type] ?? 0);
    }

    getAmmoMax(type) {
        return (this._ammoMax[type] ?? 0);
    }

    // --- Items (keys + permanent power-ups) ---
    giveItem(code) {
        this._items.add(code);
        return this;
    }

    hasItem(code) {
        return this._items.has(code);
    }

    // --- Timed effects ---
    addEffect(code, duration) {
        this._effects[code] = duration;
        return this;
    }

    takeDamage(delta) {
        if (this.hasEffect('invulnerability')) {
            return;
        }
        // P_DamageMobj: skill factor before the armor, only when damage > 1
        // (no int truncation, this engine deals float damage).
        if (delta > 1) {
            delta = delta * this._damageFactor;
        }
        // P_DamageMobj "end of game hell hack": in the exit sector a killing
        // blow leaves the player standing, and the sector ends the level.
        if ((this._exitSectorProbe !== null) && this._exitSectorProbe(this)) {
            delta = Math.max(0, Math.min(delta, this.getEnergy() - WadConstants.SECTOR_DAMAGE_EXIT_KEPT_HEALTH));
        }
        const wasAlive     = !this.isDead();
        const energyBefore = this.getEnergy();
        super.takeDamage(delta);
        this._voiceDamage(wasAlive, energyBefore);
    }

    // P_KillMobj / P_DamageMobj cries. The engine clamps the energy, so the
    // extreme-death overkill comes from its own bookkeeping.
    _voiceDamage(wasAlive, energyBefore) {
        if (!wasAlive || (this.getEnergy() >= energyBefore)) {
            return;
        }
        if (!this.isDead()) {
            doomSound.playAt('*pain100', null, {replaceKey: 'player:voice'});
            return;
        }
        const scream = ((this.getLastOverkill() > DoomUser.XDEATH_OVERKILL) ? '*xdeath' : '*death');
        doomSound.playAt(scream, null, {replaceKey: 'player:voice'});
    }

    // --- Player feedback hooks (engine no-ops overridden) ---

    /**
     * Splash spawned where the player lands (the level's terrain service).
     *
     * @param {function|null} callback (x, y, z) => void
     */
    setLandingSplash(callback) {
        this._landingSplash = callback;
        return this;
    }

    // A corpse never grunts (vanilla), but still splashes.
    _onLanded(fallDist) {
        if (!this.isDead() && (fallDist >= (WadConstants.LAND_GRUNT_FALL_UNITS * WadConstants.SCALE))) {
            doomSound.playAt('*land', null, {replaceKey: 'player:voice'});
        }
        if (((this._landingSplash ?? null) !== null)
            && (fallDist >= (WadConstants.SPLASH_FALL_UNITS * WadConstants.SCALE))) {
            this._landingSplash(this.x, this.y, this.z);
        }
    }

    _onJumped() {
        // No IWAD ships a jump sound (dsjump, plrjmp): silent on vanilla data.
        if (!this.isDead()) {
            doomSound.playAt('*jump', null, {replaceKey: 'player:voice'});
        }
    }

    notifyUseFailed() {
        if (!this.isDead()) {
            doomSound.playAt('*usefail', null, {replaceKey: 'player:voice'});
        }
    }

    hasEffect(code) {
        return (this._effects[code] !== undefined);
    }

    // Running and outside the blink-off phases of the end-of-powerup strobe
    // (ST_doPaletteStuff).
    isEffectVisible(code) {
        const remainingMs = this._effects[code];
        return ((remainingMs !== undefined) && WadConstants.powerupVisibleMs(remainingMs));
    }

    updateEffects(dt) {
        for (const code of Object.keys(this._effects)) {
            this._effects[code] -= dt;
            if (this._effects[code] <= 0) {
                delete this._effects[code];
            }
        }
    }

    // --- Inter-level persistence ---
    // The player is rebuilt for each level: DoomGame exports the state before
    // loader.reset() and imports it into the next one.
    exportState() {
        const weapons = {};
        for (const code of Object.keys(this._weapons)) {
            weapons[code] = this._weapons[code].owned;
        }
        return {
            weapons:      weapons,
            activeWeapon: this._activeWeapon,
            ammo:         {...this._ammo},
            ammoMax:      {...this._ammoMax},
            items:        Array.from(this._items),
            effects:      {...this._effects},
            energy:       this.getEnergy(),
            armor:        this.getArmor(),
            maxArmor:     this.getMaxArmor(),
            armorAbsorb:  this.getArmorAbsorb()
        };
    }

    importState(state) {
        for (const code of Object.keys(state.weapons)) {
            this.declareWeapon(code);
            if (state.weapons[code] === true) {
                this.giveWeapon(code);
            }
        }
        this.setActiveWeapon(state.activeWeapon);

        for (const type of Object.keys(state.ammoMax)) {
            this.setAmmoMax(type, state.ammoMax[type]);
            this.giveAmmo(type, (state.ammo[type] ?? 0));
        }

        for (const code of state.items) {
            this.giveItem(code);
        }
        for (const code of Object.keys(state.effects)) {
            this.addEffect(code, state.effects[code]);
        }

        // maxArmor first, or the setArmor clamp would cut the carried value.
        this.setEnergy(state.energy);
        this.setMaxArmor(state.maxArmor);
        this.setArmor(state.armor);
        this.setArmorAbsorb(state.armorAbsorb);
        return this;
    }

    // --- Read accessors for the HUD ---

    getOwnedWeaponCodes() {
        return Object.keys(this._weapons).filter((code) => this.hasWeapon(code));
    }

    getItemCodes() {
        return Array.from(this._items);
    }

    getEffects() {
        return this._effects;
    }

    // --- Inter-level reset ---
    // Drops the items flagged resetOnNewLevel and every timed effect.
    resetForNewLevel(itemCatalog) {
        for (const code of Array.from(this._items)) {
            const def = itemCatalog.getItem(code);
            if ((def !== null) && (def !== undefined) && (def.isResetOnNewLevel() === true)) {
                this._items.delete(code);
            }
        }
        this._effects = {};
        return this;
    }
}

// Post-armor health points below zero past which the death is the extreme
// scream (P_KillMobj: health < -50).
DoomUser.XDEATH_OVERKILL = 50;
