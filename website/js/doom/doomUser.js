/**
 * The Doom player. Extends the generic engine User (physics + health + armor)
 * and adds the Doom equipment STATE: owned weapons, the active weapon, the
 * shared ammo pool, the held items and the active timed effects.
 *
 * It only carries state — never the definitions, which live on DoomGame. The
 * starting loadout is poured in by DoomGame after construction (DoomUser is
 * built deep in the engine loader, which knows nothing about Doom).
 */
class DoomUser extends User {
    constructor(x, y, z, yaw, pitch, maxEnergy) {
        super(x, y, z, yaw, pitch, maxEnergy);

        this._weapons      = {};   // code -> {owned: bool}
        this._activeWeapon = null;
        this._ammo         = {};   // code -> count
        this._ammoMax      = {};   // code -> max
        this._items        = new Set();
        this._effects        = {};   // code -> remaining time (ms)
        this._damageFactor   = 1;    // skill-derived, set by DoomGame per level
        this._controlFreezeS = 0;
        // Jumping and crouching are ours, not the engine's: vanilla Doom has
        // neither, so the two keys are simply not listened to when the player
        // turns them off (game.jump / game.crouch settings).
        this._jumpAllowed    = true;
        this._crouchAllowed  = true;
    }

    setDamageFactor(factor) {
        this._damageFactor = factor;
        return this;
    }

    // P_Teleport freeze (reactiontime, Player.TeleportFreezeTime): movement,
    // turning and jumping are ignored while the timer runs — the player
    // watches the arrival fog. Firing stays allowed, like vanilla. Transient
    // by design: not part of the saved state.
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

    // A forbidden crouch asks to STAND, never just ignores the call: the
    // setting may go off while the player is down, and he must come back up.
    setCrouch(bool) {
        if (this.isControlFrozen()) {
            return;
        }
        super.setCrouch(bool && this._crouchAllowed);
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

    giveAmmo(type, n) {
        const max = (this._ammoMax[type] ?? 0);
        this._ammo[type] = Math.min(max, (this._ammo[type] ?? 0) + n);
        return this;
    }

    useAmmo(type, n) {
        this._ammo[type] = Math.max(0, (this._ammo[type] ?? 0) - n);
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

    // Invulnerability fully blocks damage while active (the other timed
    // effects are consumed by their own systems: sector damage, the screen
    // tints, the light override, the weapon alpha).
    takeDamage(delta) {
        if (this.hasEffect('invulnerability')) {
            return;
        }
        // Vanilla P_DamageMobj applies the skill damage factor BEFORE the
        // armor absorption, and only when damage > 1 (the int truncation is
        // not replicated — this engine deals float damage).
        if (delta > 1) {
            delta = delta * this._damageFactor;
        }
        super.takeDamage(delta);
    }

    hasEffect(code) {
        return (this._effects[code] !== undefined);
    }

    // Running AND outside the blink-off phases of the vanilla end-of-powerup
    // strobe (ST_doPaletteStuff) — the single visibility rule shared by the
    // screen tints, the HUD countdown lines, the light override and the
    // weapon alpha.
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
    // The DoomUser is rebuilt for each level (the engine loader instantiates a
    // fresh one from the WAD spawn). To carry equipment over, DoomGame snapshots
    // the state before loader.reset() and re-applies it on the next level, then
    // calls resetForNewLevel to drop the level-scoped possessions.
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

        // maxArmor before armor so the setArmor clamp keeps the carried value
        this.setEnergy(state.energy);
        this.setMaxArmor(state.maxArmor);
        this.setArmor(state.armor);
        this.setArmorAbsorb(state.armorAbsorb);
        return this;
    }

    // --- Read accessors for the HUD (no direct private-field access) ---

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
    // Data-driven: drop every held item whose definition is flagged
    // resetOnNewLevel, and clear all timed effects (level-scoped). Weapons,
    // ammo, energy and armor persist. lookup exposes getItem(code).
    resetForNewLevel(lookup) {
        for (const code of Array.from(this._items)) {
            const def = lookup.getItem(code);
            if ((def !== null) && (def !== undefined) && (def.isResetOnNewLevel() === true)) {
                this._items.delete(code);
            }
        }
        this._effects = {};
        return this;
    }
}
