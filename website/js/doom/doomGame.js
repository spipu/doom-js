class DoomGame {
    constructor() {
        this._engine            = null;
        this._world             = null;
        this._screen            = null;
        this._hud               = null;
        this._inputs            = null;
        this._wakeLock          = null;
        this._wadFile           = null;
        this._wadMeta           = null;
        this._mapInfo           = null;
        this._levelName         = null;
        this._spawnOverride     = null;
        this._skill             = 3;
        this._carriedState      = null;
        this._secretsFound      = 0;
        this._secretsTotal      = 0;
        this._pauseWasDown      = true;
        this._cheatWasDown      = false;
        this._hudWasDown        = false;
        this._weaponNextWasDown = false;
        this._weaponPrevWasDown = false;
        this._running           = false;
        this._transitioning     = false;
        this._animateCallback   = this._animate.bind(this);

        // Weapon firing (built per level)
        this._playerWeapon    = null;
        this._weaponSprites   = null;
        this._availableWeapons = null;   // codes whose sprites exist in this WAD
        this._effects         = null;    // transient sprite effects (puffs…)
        this._hitscan         = null;
        this._rng             = new DoomRandom();

        // Shared, immutable definitions (the per-player state lives on DoomUser)
        this._weapons   = {};
        this._ammoTypes = {};
        this._items     = {};
        this._buildCatalogs();

        // World things catalog (sprites placed from the WAD THINGS lump)
        this._thingCatalog = new DoomThingCatalog();
    }

    // --- Catalogs of definitions ---
    _buildCatalogs() {
        this._ammoTypes = {
            bullets: new DoomAmmo({code: 'bullets', name: 'Bullets', maxNormal: 200, maxPack: 400, clip: 10}),
            shells:  new DoomAmmo({code: 'shells',  name: 'Shells',  maxNormal: 50,  maxPack: 100, clip: 4}),
            rockets: new DoomAmmo({code: 'rockets', name: 'Rockets', maxNormal: 50,  maxPack: 100, clip: 1}),
            cells:   new DoomAmmo({code: 'cells',   name: 'Cells',   maxNormal: 300, maxPack: 600, clip: 20})
        };

        this._weapons = DoomWeaponDef.buildAll();

        this._items = {
            redKey:        new DoomItem({code: 'redKey',        name: 'Red Key',         type: 'key'}),
            blueKey:       new DoomItem({code: 'blueKey',       name: 'Blue Key',        type: 'key'}),
            yellowKey:     new DoomItem({code: 'yellowKey',     name: 'Yellow Key',      type: 'key'}),
            berserk:       new DoomItem({code: 'berserk',       name: 'Berserk',         type: 'powerupPermanent', effect: 'berserk'}),
            computerMap:   new DoomItem({code: 'computerMap',   name: 'Computer Map',    type: 'powerupPermanent', effect: 'map'}),
            invulnerability: new DoomItem({code: 'invulnerability', name: 'Invulnerability', type: 'powerupTimed', effect: 'invulnerability', duration: 30000}),
            radiationSuit: new DoomItem({code: 'radiationSuit', name: 'Radiation Suit',  type: 'powerupTimed', effect: 'radiation', duration: 60000}),
            lightVisor:    new DoomItem({code: 'lightVisor',    name: 'Light Visor',     type: 'powerupTimed', effect: 'light', duration: 120000}),
            invisibility:  new DoomItem({code: 'invisibility',  name: 'Invisibility',    type: 'powerupTimed', effect: 'invisibility', duration: 60000})
        };
    }

    getWeapon(code) {
        return (this._weapons[code] ?? null);
    }

    // True when the weapon's sprites exist in the current WAD. Before the sprite
    // bank is built (staging off), everything is treated as available.
    isWeaponAvailable(code) {
        return ((this._availableWeapons === null) || this._availableWeapons.has(code));
    }

    getAmmo(code) {
        return (this._ammoTypes[code] ?? null);
    }

    getItem(code) {
        return (this._items[code] ?? null);
    }

    // --- Pickups (phase 3) ---

    // Apply a picked-up thing's effect descriptor to the player. Returns true
    // when something was actually consumed — false leaves the sprite on the
    // ground (Doom does not pick up health/armor/ammo already full, nor a
    // weapon/key already held). Effect shapes come from DoomThingCatalog.
    applyPickup(user, effect) {
        if ((effect === null) || (effect === undefined)) {
            return false;
        }
        if (effect.weapon !== undefined) {
            return this._pickupWeapon(user, effect.weapon);
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
            return this._pickupArmorBonus(user, effect.armorBonus);
        }
        if (effect.item !== undefined) {
            return this._pickupItem(user, effect.item);
        }
        if (effect.mega === true) {
            // Vanilla megasphere SETS health to 200 (p_inter.c), it does not add
            const healed  = user.addEnergy(200, 200);
            const armored = this._pickupArmor(user, 'blue');
            return (healed || armored);
        }
        return false;
    }

    // Double ammo on the easiest and hardest skills, like Doom (ITYTD / Nightmare).
    _ammoMultiplier() {
        return (((this._skill === 1) || (this._skill === 5)) ? 2 : 1);
    }

    // Give ammo and report whether the counter actually rose (it stays put when
    // already at the cap). Centralises the clamp-and-detect used by every path.
    _grantAmmo(user, type, amount) {
        const before = user.getAmmo(type);
        user.giveAmmo(type, amount);
        return (user.getAmmo(type) > before);
    }

    _pickupWeapon(user, code) {
        const def = this.getWeapon(code);
        // Unknown weapon, or one whose sprites are absent from this WAD (e.g. the
        // super shotgun in Doom 1): not handed out.
        if (def === null || !this.isWeaponAvailable(code)) {
            return false;
        }
        let gaveWeapon = false;
        if (!user.hasWeapon(code)) {
            user.giveWeapon(code);
            // Vanilla sets pendingweapon → the new weapon is raised. Fall back to
            // an instant swap only before the controller exists.
            if (this._playerWeapon !== null) {
                this._playerWeapon.requestWeapon(code);
            } else {
                user.setActiveWeapon(code);
            }
            gaveWeapon = true;
        }
        // Doom hands out 2 × the ammo clip with the weapon (further doubled on
        // skill 1/5). An already-owned weapon is still collected as long as it
        // tops up ammo; it only stays on the ground when ammo is already full.
        let gaveAmmo = false;
        const ammoType = def.getAmmoType();
        if (ammoType !== null) {
            const amount = this.getAmmo(ammoType).getClip() * 2 * this._ammoMultiplier();
            gaveAmmo = this._grantAmmo(user, ammoType, amount);
        }
        return (gaveWeapon || gaveAmmo);
    }

    _pickupAmmo(user, type, amount) {
        if (this.getAmmo(type) === null) {
            return false;
        }
        return this._grantAmmo(user, type, amount * this._ammoMultiplier());
    }

    _pickupBackpack(user) {
        for (const code of Object.keys(this._ammoTypes)) {
            user.setAmmoMax(code, this._ammoTypes[code].getMaxPack());
            // Doom's backpack also grants one base clip of each ammo type.
            this._grantAmmo(user, code, this._ammoTypes[code].getClip() * this._ammoMultiplier());
        }
        return true;
    }

    _pickupArmor(user, kind) {
        const target = ((kind === 'blue') ? 200 : 100);
        const absorb = ((kind === 'blue') ? 0.5 : (1 / 3));
        if (user.getArmor() >= target) {
            return false;
        }
        // The 0→200 ceiling is fixed (set in the loadout); a pickup only sets the
        // armour points and the absorption fraction of its type.
        user.setArmor(target);
        user.setArmorAbsorb(absorb);
        return true;
    }

    _pickupArmorBonus(user, amount) {
        if (user.getArmor() >= 200) {
            return false;
        }
        // A bonus on top of no armor still grants the green absorption fraction.
        if ((user.getArmor() <= 0) && (user.getArmorAbsorb() <= 0)) {
            user.setArmorAbsorb(1 / 3);
        }
        user.setArmor(Math.min(user.getArmor() + amount, 200));
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
        // Berserk (vanilla P_GivePower pw_strength): the heal-to-100 happens
        // BEFORE the already-owned check — every sphere re-heals and is
        // consumed, even when the power is already held.
        if (code === 'berserk') {
            user.giveItem(code);
            user.addEnergy(100, 100);
            return true;
        }
        // Key or permanent power-up: a key already held leaves the sprite.
        if (user.hasItem(code)) {
            return false;
        }
        user.giveItem(code);
        return true;
    }

    // Pour the canonical Doom starting loadout on the freshly built DoomUser:
    // all weapon slots declared, Fist + Pistol owned (Pistol active), the four
    // ammo counters initialised to their normal cap with 50 bullets.
    _setupLoadout(user) {
        for (const code of Object.keys(this._weapons)) {
            user.declareWeapon(code);
        }
        user.giveWeapon('fist');
        user.giveWeapon('pistol');
        user.setActiveWeapon('pistol');

        for (const code of Object.keys(this._ammoTypes)) {
            user.setAmmoMax(code, this._ammoTypes[code].getMaxNormal());
        }
        user.giveAmmo('bullets', 50);

        // Doom armour is a single 0→200 counter; the type (green/blue) only sets
        // the absorption fraction. The player starts at 0 with the 200 ceiling.
        user.setMaxArmor(200);
        user.setArmor(0);
    }

    // Debug/test cheat (the 'o' key): hand the player the full Doom kit — every
    // weapon, every ammo type topped to its current max, all three keys, full
    // energy and a full 200 blue armour. Reuses the existing DoomUser grant
    // paths so it stays consistent with the pickup system (same ammo caps, same
    // fixed 0→200 armour ceiling and blue-armour absorption).
    _applyCheatFullKit() {
        const user = this._world.getUser();

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

        user.setEnergy(user.getMaxEnergy());
        user.setMaxArmor(200);
        user.setArmor(200);
        user.setArmorAbsorb(0.5);
    }

    // Debug helper: force the player to a chosen location instead of the WAD
    // spawn. The given Y is used as the floor-search ceiling (exactly like the
    // initial snap in World.finalizeInit), so the player is dropped onto the
    // floor below it rather than left embedded or floating.
    _applySpawnOverride() {
        if (this._spawnOverride === null) {
            return;
        }
        const user = this._world.getUser();
        const pos  = this._spawnOverride.position;
        user.x     = pos[0];
        user.y     = pos[1];
        user.z     = pos[2];
        user.yaw   = this._spawnOverride.yaw;
        user.pitch = this._spawnOverride.pitch;
        user.syncPositionTracking();

        const floorY = this._world.getCollision().getFloor(user.x, user.z, user.getRadius(), user.y);
        if (floorY !== -Infinity) {
            user.y = floorY;
        }
    }

    // --- Level secrets (sector special 9) ---

    setSecretsTotal(total) {
        this._secretsTotal = total;
    }

    addSecretFound() {
        this._secretsFound++;
    }

    getSecretsFound() {
        return this._secretsFound;
    }

    getSecretsTotal() {
        return this._secretsTotal;
    }

    // spawnOverride is a debug helper: when set ({position, yaw, pitch}) the
    // player is forced to that location after the world is built, instead of the
    // WAD spawn (see _applySpawnOverride).
    async startFromWad(wadFile, levelName, wadMeta = null, spawnOverride = null, skill = null) {
        this._wadFile   = wadFile;
        this._mapInfo   = new WadMapInfo(wadFile);
        this._levelName = levelName;
        this._spawnOverride = spawnOverride;
        if (wadMeta !== null) {
            this._wadMeta = wadMeta;
        }
        // Skill is given on the first launch by the menu and kept across the
        // level chain (the exit-switch transition calls startFromWad without it).
        if (skill !== null) {
            this._skill = skill;
        }

        // Snapshot the player equipment BEFORE loader.reset() destroys the world.
        // Null on the first level (fresh game) → _init pours the starting loadout;
        // set on a level transition → _init restores it then resets level-scoped.
        if (this._world !== null) {
            this._carriedState = this._world.getUser().exportState();
        }

        // Secrets are level stats (vanilla totalsecret / player->secretcount):
        // reset on every level, the total is pushed back by the world builder.
        this._secretsFound = 0;
        this._secretsTotal = 0;

        this._teardownLevel();
        loader.beginBatch();
        await new WadWorldBuilder(wadFile, levelName, {
            onLevelExit: (secret) => {
                this._onLevelExit(secret);
            },
            thingCatalog: this._thingCatalog,
            skill: this._skill,
            game: this
        }).build();

        // Pre-decode every weapon view/flash frame INSIDE the batch: decoding a
        // sprite registers a texture, and any registration after endBatch would
        // re-trigger the loader's global check (and _init) mid-render.
        if (DoomGame.WEAPON_STAGE >= 1) {
            this._weaponSprites = new DoomWeaponSpriteBank(wadFile);
            this._availableWeapons = new Set();
            for (const code of Object.keys(this._weapons)) {
                const def = this._weapons[code];
                // A weapon "exists" in this WAD only if its sprites are present
                // (e.g. the super shotgun / SHT2 is absent from Doom 1 WADs).
                // Probe quietly, then decode only the frames we will actually use.
                const readyLump = def.getState(def.getEntry().ready).getLump();
                if (this._weaponSprites.has(readyLump)) {
                    this._availableWeapons.add(code);
                    this._weaponSprites.decode(def.getSpriteLumps());
                }
            }
            // Effect sprites (puffs…) are built here too, inside the batch.
            this._effects = new DoomEffects(this._weaponSprites, this._rng);
        }

        loader.setCallback(() => {
            this._init();
        });
        loader.endBatch();
    }

    _init() {
        this._world = loader.world().get();
        // Loading is done; drop the callback so runtime texture/instance spawns
        // (weapon frames, puffs, projectiles) never re-enter _init.
        loader.clearCallback();

        const user = this._world.getUser();
        if (this._carriedState === null) {
            this._setupLoadout(user);
        } else {
            // Carry equipment over, then drop the level-scoped possessions
            // (keys, timed effects) — weapons/ammo/energy/armor persist.
            user.importState(this._carriedState);
            user.resetForNewLevel(this);
        }
        this._applySpawnOverride();

        if (this._wakeLock === null) {
            this._wakeLock = new ScreenWakeLock();
            this._wakeLock.init();
        }

        this._screen = new ScreenManager('screen', {
            fullscreen: true,
            virtualWidth: 1920,
            virtualHeight: 1080
        });

        // Inputs owns the keyboard singleton — created once, reused across levels
        if (this._inputs === null) {
            this._inputs = new Inputs();
        }
        // The devices are re-bound to the new screen on each level
        this._inputs.bindScreen(this._screen);

        this._engine = new Engine3d(this._screen, new Object3dRendererList().getRenderer('webgl'));
        this._engine.setFov(45.0);
        this._engine.setZBuffer(0.1, 100);

        this._hud = new HudDoom(this._engine)
            .bindUser(this._world.getUser())
            .bindInputs(this._inputs)
            .bindGame(this)
            .setLevelInfo(((this._wadMeta !== null) ? this._wadMeta.id : null), this._levelName, this._skill, this._mapInfo.levelNameFor(this._levelName))
            .addDescription('(c)2026 Spipu')
        ;

        this._screen.bindHud(this._hud);

        this._engine.initFromWorld(this._world);

        // Weapon firing: a fresh psprite controller per level, RNG cleared like
        // vanilla M_ClearRandom. It brings the active weapon up on construction.
        if (DoomGame.WEAPON_STAGE >= 1) {
            this._rng.reset();
            this._playerWeapon = new DoomPlayerWeapon(this, this._world.getUser(), this._weaponSprites, this._rng);
            this._hitscan = new DoomHitscan(this._world.getCollision(), this._effects, this._rng);
            this._playerWeapon.setAttackSystems(this._hitscan, null);
        }
        if (DoomGame.WEAPON_STAGE >= 2) {
            this._engine.setOverlayCallback((renderer, engine) => this._drawWeaponOverlay(renderer, engine));
        }

        // Require a release before the first press (a button held during the
        // level start must not immediately quit it)
        this._pauseWasDown = true;

        this._running = true;
        requestAnimationFrame(this._animateCallback);
    }

    _animate(timestamp) {
        if (!this._running) {
            return;
        }

        // Pause button (press edge): leave the level, back to the level list
        const pauseDown = this._inputs.readButtonPause();
        if (pauseDown && !this._pauseWasDown && !this._transitioning) {
            this._quitToLevelList();
            return;
        }
        this._pauseWasDown = pauseDown;

        // Cheat key (press edge): hand the player the full test kit
        const cheatDown = this._inputs.readButtonCheatFullKit();
        if (cheatDown && !this._cheatWasDown) {
            this._applyCheatFullKit();
        }
        this._cheatWasDown = cheatDown;

        // HUD toggle (press edge): switch between the game HUD and the debug HUD
        const hudDown = this._inputs.readButtonToggleHud();
        if (hudDown && !this._hudWasDown) {
            this._hud.toggleMode();
        }
        this._hudWasDown = hudDown;

        // Weapon switching + firing are enabled in stages during bring-up
        // (WEAPON_STAGE), so each layer can be validated on its own.
        if (this._playerWeapon !== null && DoomGame.WEAPON_STAGE >= 4) {
            const weaponNextDown = this._inputs.readButtonWeaponNext();
            if (weaponNextDown && !this._weaponNextWasDown) {
                this._playerWeapon.cycleWeapon(1);
            }
            this._weaponNextWasDown = weaponNextDown;

            const weaponPrevDown = this._inputs.readButtonWeaponPrev();
            if (weaponPrevDown && !this._weaponPrevWasDown) {
                this._playerWeapon.cycleWeapon(-1);
            }
            this._weaponPrevWasDown = weaponPrevDown;

            const wheel = this._inputs.readWeaponWheel();
            for (let n = 0; n < Math.abs(wheel); n++) {
                this._playerWeapon.cycleWeapon((wheel > 0) ? 1 : -1);
            }
        }

        this._engine.calculateDeltaTime(timestamp);
        const dt = this._engine.getDeltaTime();
        this._world.update(dt, this._inputs);
        this._world.getUser().updateEffects(dt);
        if (this._playerWeapon !== null && DoomGame.WEAPON_STAGE >= 3) {
            this._playerWeapon.update(dt, this._inputs.readButtonFire());
        }
        if (this._effects !== null) {
            this._effects.update(dt);
        }
        this._engine.displayWorld(this._world);
        this._screen.update();

        requestAnimationFrame(this._animateCallback);
    }

    // Engine overlay callback: draw the weapon view sprite (+ muzzle flash) over
    // the scene. The controller returns 0..1 screen rects; the renderer draws.
    _drawWeaponOverlay(renderer, engine) {
        for (const spr of this._playerWeapon.getViewSprites()) {
            renderer.drawScreenSprite(engine, spr.texId, spr.x, spr.y, spr.w, spr.h, spr.light);
        }
    }

    // Stop the running level and wipe every loader (rAF first: World.update
    // reads the loaders each frame).
    _teardownLevel() {
        this._stopLevel();
        loader.reset();
    }

    // Leave the current level and go back to the level list of the WAD
    _quitToLevelList() {
        this._teardownLevel();
        const navigator = new MenuNavigator();
        if (this._wadMeta !== null) {
            navigator.startAtLevels(this._wadMeta);
            return;
        }
        navigator.start();
    }

    // --- Level transition ---

    // Stop the animation loop and remove the screen — must be done before
    // loader.reset(), the running world reads its data from the loaders
    _stopLevel() {
        this._running = false;
        if (this._screen !== null) {
            this._screen.destroyContainer();
            this._screen = null;
        }
    }

    /**
     * Called by an exit interaction (switch 11/51 or walk-over 52/124): level
     * finished modal, then after 2 seconds, loading modal + next level (or back
     * to the menu after the last level of the WAD). The secret flag routes to
     * the secret level instead of the sequential one.
     */
    _onLevelExit(secret = false) {
        if (this._transitioning) {
            return;
        }
        this._transitioning = true;

        // Progression owned by WadMapInfo: vanilla defaults synthesized from
        // the level names, overlaid by the UMAPINFO lump when the WAD has one
        // (null = end of game → back to the menu).
        const nextLevel = this._mapInfo.nextLevelName(this._levelName, secret === true);

        const display = new MenuDisplay('screen').init();
        const modal = new MenuModal(display);
        modal.showMessage('Niveau ' + this._levelName + ' terminé !');

        setTimeout(() => {
            this._startNextLevel(display, modal, nextLevel);
        }, 2000);
    }

    async _startNextLevel(display, modal, nextLevel) {
        if (nextLevel === null) {
            // Last level of the WAD → back to the menu
            this._teardownLevel();
            modal.close();
            display.destroy();
            this._transitioning = false;
            new MenuNavigator().start();
            return;
        }

        modal.showLoading('Chargement du niveau ' + nextLevel);
        try {
            await this.startFromWad(this._wadFile, nextLevel);
            modal.close();
            display.destroy();
            this._transitioning = false;
        } catch (error) {
            // Conversion failure mid-chain: clean up and fall back to the menu
            // (same recovery as a failed launch from the level list).
            console.error(error);
            loader.reset();
            modal.close();
            display.destroy();
            this._transitioning = false;
            new MenuNavigator().start();
        }
    }
}

// Staged bring-up of the weapon system, so each layer is validated on its own:
// 0 = off (baseline load), 1 = pre-decode sprites + build the controller,
// 2 = + render the view sprite (static), 3 = + tick the state machine (bob,
// fire animation), 4 = + weapon switching (keys / wheel). Raise once validated.
// All stages validated in-game → full weapon system on.
DoomGame.WEAPON_STAGE = 4;
