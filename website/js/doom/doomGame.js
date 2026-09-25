class DoomGame {
    constructor() {
        this._world             = null;
        this._presentation      = new DoomPresentation(this);
        this._inputs            = null;
        this._commandSampler    = null;
        this._wakeLock          = null;
        this._wadFile           = null;
        this._wadMeta           = null;
        this._mapInfo           = null;
        this._dehackedStrings   = null;
        this._levelCode         = null;
        this._levelName         = null;
        this._spawnOverride     = null;
        this._skill             = 3;
        this._roster            = new DoomPlayerRoster().setLocal(new DoomPlayer(DoomGame.LOCAL_PLAYER_ID));
        this._restoreSnapshot   = null;
        this._pauseWasDown      = true;
        this._running           = false;
        this._transitioning     = false;
        this._paused            = false;
        this._pauseDisplay      = null;
        this._pauseModal        = null;
        this._deathDisplay      = null;
        this._deathModal        = null;
        this._deathClockMs      = 0;
        this._animateCallback   = this._animate.bind(this);
        this._resetLevelStats();

        this._weaponSprites    = null;
        this._availableWeapons = null;   // codes whose sprites exist in this WAD
        this._effects          = null;   // transient sprite effects (puffs, explosions)
        this._hitscan          = null;
        this._projectiles      = null;
        this._decals           = null;
        this._sectorLight      = null;
        this._sectorDamage     = null;
        this._gunTriggers      = null;   // shot-activated lines
        this._sectorSurfaces   = null;   // floor flats/specials rewritten by the "+change" floors
        this._terrain          = null;
        this._moverSounds      = null;
        this._ambientSounds    = null;
        this._automap          = null;   // null when the WAD has no usable BSP
        this._rng              = new DoomRandom();

        // Placeholder until startFromWad detects the WAD's profile.
        this._gameProfile    = new DefaultGameProfile();
        this._weapons        = {};
        this._ammoTypes      = {};
        this._items          = {};
        this._thingCatalog   = null;
        this._monsterCatalog = null;
        this._monsters       = null;
        this._monsterDamage  = null;
        this._monsterAttack  = null;
        this._skillTable     = null;
        this._buildCatalogs();
    }

    // --- Catalogs of definitions ---
    _buildCatalogs() {
        this._ammoTypes      = this._gameProfile.buildAmmoTypes();
        this._weapons        = this._gameProfile.buildWeapons();
        this._items          = this._gameProfile.buildItems();
        this._thingCatalog   = this._gameProfile.createThingCatalog();
        this._monsterCatalog = this._gameProfile.createMonsterCatalog();
        this._skillTable     = this._gameProfile.skillRules();
    }

    // Out-of-range skills (dev starter) fall back to the HMP rules.
    _skillRule() {
        return (this._skillTable[this._skill] ?? this._skillTable[3]);
    }

    /**
     * @returns {DoomPlayer} the player this device samples and views
     */
    _localPlayer() {
        return this._roster.getLocal();
    }

    getGameProfile() {
        return this._gameProfile;
    }

    getWeapon(code) {
        return (this._weapons[code] ?? null);
    }

    // True when the weapon's sprites exist in the current WAD; always true
    // before the sprite bank is built.
    isWeaponAvailable(code) {
        return ((this._availableWeapons === null) || this._availableWeapons.has(code));
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
            doomSound.playAt(DoomGame._pickupSoundFor(effect, this), null, {});
        }

        return consumed;
    }

    // p_inter.c: weapons, keys and power-ups each ring their own pickup sound,
    // everything else takes the plain item blip.
    static _pickupSoundFor(effect, game) {
        if (effect.weapon !== undefined) {
            return 'misc/w_pkup';
        }
        if (effect.item !== undefined) {
            const def = game.getItem(effect.item);
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

    _ammoMultiplier() {
        return this._skillRule().ammoFactor;
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
        const weapon = this._localPlayer().getWeapon();
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
            gaveAmmo = this._grantAmmo(user, ammoType, baseAmmo * ((dropped) ? 0.5 : 1) * this._ammoMultiplier());
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
            this._grantAmmo(user, code, this._ammoTypes[code].getPackGive() * this._ammoMultiplier());
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

    _setupLoadout(user) {
        const loadout = this._gameProfile.startingLoadout();

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
    _applyCheatFullKit() {
        const user = this._localPlayer().getUser();

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

        const armor = this._gameProfile.cheatKitArmor();
        user.setEnergy(user.getMaxEnergy());
        user.setMaxArmor(this._gameProfile.startingLoadout().maxArmor);
        user.setArmor(armor.points);
        user.setArmorAbsorb(armor.absorb);
    }

    // Debug helper. The given Y is the floor-search ceiling, like the initial
    // snap in World.finalizeInit: the player drops onto the floor below it.
    _applySpawnOverride() {
        if (this._spawnOverride === null) {
            return;
        }
        const user     = this._localPlayer().getUser();
        const position = this._spawnOverride.position;
        user.x     = position[0];
        user.y     = position[1];
        user.z     = position[2];
        user.yaw   = this._spawnOverride.yaw;
        user.pitch = this._spawnOverride.pitch;
        user.syncPositionTracking();

        const floorY = this._world.getCollision().getFloor(user.x, user.z, user.getRadius(), user.y);
        if (floorY !== -Infinity) {
            user.y = floorY;
        }
    }

    // --- Level data fed by the world builder ---

    setSecretsTotal(total) {
        this._secretsTotal = total;
    }

    setSectorLight(sectorLight) {
        this._sectorLight = sectorLight;
    }

    setSectorDamage(sectorDamage) {
        this._sectorDamage = sectorDamage;
    }

    setMoverSounds(moverSounds) {
        this._moverSounds = moverSounds;
        return this;
    }

    setAmbientSounds(ambientSounds) {
        this._ambientSounds = ambientSounds;
        return this;
    }

    setGunTriggers(gunTriggers) {
        this._gunTriggers = gunTriggers;
    }

    setSectorSurfaces(sectorSurfaces) {
        this._sectorSurfaces = sectorSurfaces;
    }

    setTerrain(terrain) {
        this._terrain = terrain;
    }

    setAutomap(automap) {
        this._automap = automap;
    }

    // Built after the world: build-time consumers (teleports) must read it at trigger time.
    getEffects() {
        return this._effects;
    }

    startTeleZoom() {
        this._presentation.startTeleZoom();
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

    // --- Level kills (countable monsters put down) ---

    setKillsTotal(total) {
        this._killsTotal = total;
    }

    addKill() {
        this._killsCount++;
    }

    // A resurrected monster counts again in the total (A_VileChase / Revive).
    addKillTotal() {
        this._killsTotal++;
    }

    getKillsCount() {
        return this._killsCount;
    }

    getKillsTotal() {
        return this._killsTotal;
    }

    // Vanilla totalsecret / totalkills / totalitems + leveltime; the totals
    // are pushed back by the world builder.
    _resetLevelStats() {
        this._secretsFound   = 0;
        this._secretsTotal   = 0;
        this._killsCount     = 0;
        this._killsTotal     = 0;
        this._itemsFound     = 0;
        this._itemsTotal     = 0;
        this._levelTimeMs    = 0;
        this._levelClockLast = null;
    }

    // --- Level items (the vanilla MF_COUNTITEM bonuses and power-ups) ---

    setItemsTotal(total) {
        this._itemsTotal = total;
    }

    addItem() {
        this._itemsFound++;
    }

    // Real time, not the engine delta, which is clamped to 50 ms and would lag
    // below 20 fps. Frozen frames and backgrounded-tab gaps are not counted.
    _tickLevelClock(timestamp) {
        const now = ((typeof timestamp === 'number') ? timestamp : performance.now());
        const step = ((this._levelClockLast !== null) ? (now - this._levelClockLast) : 0);
        if (!this._paused && !this._transitioning && (step > 0) && (step <= DoomGame.LEVEL_CLOCK_MAX_STEP_MS)) {
            this._levelTimeMs += step;
        }
        this._levelClockLast = now;
    }

    // --- Save / load ---

    // Restored by the next startFromWad, on top of the rebuilt level.
    setRestoreSnapshot(snapshot) {
        this._restoreSnapshot = snapshot;
        return this;
    }

    captureSnapshot() {
        return new DoomGameSnapshot().capture(this._snapshotContext());
    }

    _snapshotContext() {
        return {
            wadId:        ((this._wadMeta !== null) ? this._wadMeta.id : null),
            levelCode:    this._levelCode,
            skill:        this._skill,
            user:         this._localPlayer().getUser(),
            collision:    this._world.getCollision(),
            rng:          this._rng,
            monsters:     this._monsters,
            projectiles:  this._projectiles,
            gunTriggers:  this._gunTriggers,
            sectorSurfaces: this._sectorSurfaces,
            automap:      this._automap,
            secretsFound: this._secretsFound,
            killsCount:   this._killsCount,
            itemsFound:   this._itemsFound,
            levelTimeMs:  this._levelTimeMs,
            setCounters:  (secretsFound, killsCount, itemsFound, levelTimeMs) => {
                this._secretsFound = secretsFound;
                this._killsCount   = killsCount;
                this._itemsFound   = itemsFound;
                this._levelTimeMs  = levelTimeMs;
            },
        };
    }

    // spawnOverride = {position, yaw, pitch}, debug only (see _applySpawnOverride).
    async startFromWad(wadFile, levelCode, wadMeta = null, spawnOverride = null, skill = null) {
        this._wadFile     = wadFile;
        this._gameProfile = new GameProfileList().getForWad(wadFile);
        this._buildCatalogs();
        this._mapInfo         = new WadMapInfo(wadFile, this._gameProfile);
        this._dehackedStrings = new WadDehackedStrings(wadFile);
        this._levelCode       = levelCode;
        this._levelName       = this._resolveLevelName();
        this._spawnOverride   = spawnOverride;
        if (wadMeta !== null) {
            this._wadMeta = wadMeta;
        }
        // Null on a level transition: the skill carries over.
        if (skill !== null) {
            this._skill = skill;
        }

        // Before loader.reset() destroys the world the equipment is read from.
        this._localPlayer().packForNextLevel();

        this._resetLevelStats();
        // Builder-fed, and not always set: never inherit the previous level's.
        this._automap       = null;
        this._moverSounds   = null;
        this._ambientSounds = null;
        this._sectorDamage  = null;
        this._terrain       = null;

        this._teardownLevel();
        loader.beginBatch();
        // Built before the builder, which feeds it inside the batch (an object
        // registered after endBatch would re-fire the loader). The skill rule
        // must be known at add() time (InstantReaction).
        this._monsters = new DoomMonsterSystem();
        this._monsters.setSkillRule(this._skillRule());
        this._monsters.setRandom(this._rng);
        this._monsters.setNightmareFast(this._gameProfile.nightmareFast());
        this._monsters.setMonsterSounds(this._gameProfile.monsterSounds());
        await new WadWorldBuilder(wadFile, levelCode, {
            onLevelExit: (secret) => {
                this._onLevelExit(secret);
            },
            thingCatalog: this._thingCatalog,
            skill: this._skill,
            game: this,
            profile: this._gameProfile,
            monsterCatalog: this._monsterCatalog,
            monsterSystem: this._monsters
        }).build();

        // Decoded inside the batch: a texture registered after endBatch would
        // re-trigger the loader (and _init).
        this._weaponSprites = new DoomWeaponSpriteBank(wadFile);
        this._availableWeapons = new Set();
        for (const code of Object.keys(this._weapons)) {
            const def = this._weapons[code];
            // E.g. the super shotgun sprites are absent from Doom 1 WADs.
            const readyLump = def.getState(def.getEntry().ready).getLump();
            if (this._weaponSprites.has(readyLump)) {
                this._availableWeapons.add(code);
                this._weaponSprites.decode(def.getSpriteLumps());
            }
        }
        // Effect and projectile billboards: inside the batch too.
        this._effects     = new DoomEffects(this._weaponSprites, this._rng, this._gameProfile);
        // Skipped if the decal graphics are not decoded yet (first-level race).
        this._decals = ((doomImageAssets.isReady()) ? new DoomDecals(doomImageAssets, this._rng, this._gameProfile) : null);
        // Not vanilla: a game with no splash of its own gets a generic one,
        // tinted with the colour of each liquid flat.
        if ((this._terrain !== null) && doomImageAssets.isReady()) {
            new DoomGenericSplash(doomImageAssets, this._effects, this._gameProfile).apply(this._terrain);
        }
        this._monsterDamage = new DoomMonsterDamage(this._monsters, this._effects, this._rng, this._gameProfile.monsterDamageRules(), this);
        this._monsters.setDamageModule(this._monsterDamage).setEffects(this._effects);
        this._projectiles = new DoomProjectileSystem(this._weaponSprites, this._effects, this._rng, this._decals, this._gameProfile, this._monsters, this._monsterDamage);
        this._projectiles.setFastMonsters(this._skillRule().fastMonsters);
        this._monsterAttack = new DoomMonsterAttack(this._monsters, this._monsterDamage, this._rng);
        this._monsters.setAttack(this._monsterAttack);

        loader.setCallback(() => {
            this._init();
        });
        loader.endBatch();
    }

    _init() {
        this._world = loader.world().get();
        // Runtime spawns (puffs, projectiles) must never re-enter _init.
        loader.clearCallback();

        const player  = this._localPlayer().enterLevel(this._world.getUser());
        const user    = player.getUser();
        const carried = player.getCarriedState();
        if (this._restoreSnapshot !== null) {
            // Keys and timed effects included: no per-level reset.
            user.importState(this._restoreSnapshot.player.state);
        } else if (carried === null) {
            this._setupLoadout(user);
        } else {
            user.importState(carried);
            user.resetForNewLevel(this);
        }
        user.setDamageFactor(this._skillRule().damageFactor);
        user.setExitSectorProbe(((this._sectorDamage !== null)
            ? ((body) => this._sectorDamage.isExitSectorAt(body.x, body.z))
            : null));
        user.setLandingSplash(((this._terrain !== null)
            ? ((x, y, z) => this._terrain.splashAt(x, y, z))
            : null));
        player.markLevelEntry();
        this._deathClockMs = 0;
        this._applySpawnOverride();

        if (this._wakeLock === null) {
            this._wakeLock = new ScreenWakeLock();
            this._wakeLock.init();
        }

        // Created once: it owns the keyboard singleton.
        if (this._inputs === null) {
            this._inputs         = new Inputs();
            this._commandSampler = this._createCommandSampler(this._inputs);
            this._presentation.bindInputs(this._inputs);
        }
        this._applyGameSettings(player);
        this._presentation.showLevel(this._world, player, this._automap, {
            wadId:     ((this._wadMeta !== null) ? this._wadMeta.id : null),
            levelCode: this._levelCode,
            skill:     this._skill,
            levelName: this._levelName
        });

        // Vanilla M_ClearRandom.
        this._rng.reset();
        this._monsters.setWorld(this._world.getCollision(), user);
        this._monsterDamage.setWorld(this._world.getCollision(), user);
        this._hitscan = new DoomHitscan(this._world.getCollision(), this._effects, this._rng, this._decals, this._gunTriggers, this._monsters, this._monsterDamage);
        this._effects.setWorld(this._world.getCollision());
        if (this._terrain !== null) {
            this._terrain.setEffects(this._effects);
            this._hitscan.setTerrain(this._terrain);
            this._projectiles.setTerrain(this._terrain);
            this._monsters.setTerrain(this._terrain);
            this._monsterDamage.setTerrain(this._terrain);
        }
        this._projectiles.setWorld(this._world.getCollision(), user);
        this._monsterAttack.setChannels(this._hitscan, this._projectiles, this._effects);
        if (user.getActiveWeapon() !== null) {
            player.setWeapon(new DoomPlayerWeapon(this, user, this._weaponSprites, this._rng)
                .setAttackSystems(this._hitscan, this._projectiles)
                .setNoiseCallback(() => this._monsters.noiseAlert()));
            this._presentation.showWeaponOverlay();
        }

        if (this._restoreSnapshot !== null) {
            new DoomGameSnapshot().apply(this._snapshotContext(), this._restoreSnapshot);
            this._restoreSnapshot = null;
            this._presentation.getEngine().resetDeltaClock();
        }

        // A button held during the level start must not open the pause at once.
        this._pauseWasDown = true;

        // Also lifts the sound freeze left by an exit modal.
        doomSound.bindLevel(user);
        doomSound.playLevelMusic(this._mapInfo.musicLumpsFor(this._levelCode));
        user.setUseProbeDistance(WadConstants.USE_RANGE * WadConstants.SCALE);
        // Declared during the batch, wired now that the loader hands the instances out.
        if (this._moverSounds !== null) {
            this._moverSounds.wireAll();
        }

        this._running = true;
        requestAnimationFrame(this._animateCallback);
    }

    // The game's own controls join the engine's in every command: the
    // simulation never reads a device.
    _createCommandSampler(inputs) {
        return new InputCommandSampler(inputs)
            .addButton(DoomGame.BUTTON_FIRE, () => inputs.readButtonFire())
            .addButton(DoomGame.BUTTON_WEAPON_NEXT, () => inputs.readButtonWeaponNext())
            .addButton(DoomGame.BUTTON_WEAPON_PREV, () => inputs.readButtonWeaponPrev())
            .addButton(DoomGame.BUTTON_CHEAT_FULL_KIT, () => inputs.readButtonCheatFullKit())
            .addImpulse(DoomGame.IMPULSE_WEAPON_WHEEL, () => inputs.readWeaponWheel());
    }

    // Next / previous on a fresh press, then one step per wheel notch.
    _cycleWeapons(weapon, command, previous) {
        if (command.isJustPressed(DoomGame.BUTTON_WEAPON_NEXT, previous)) {
            weapon.cycleWeapon(1);
        }
        if (command.isJustPressed(DoomGame.BUTTON_WEAPON_PREV, previous)) {
            weapon.cycleWeapon(-1);
        }
        const wheel = command.getImpulse(DoomGame.IMPULSE_WEAPON_WHEEL);
        for (let n = 0; n < Math.abs(wheel); n++) {
            weapon.cycleWeapon(((wheel > 0) ? 1 : -1));
        }
    }

    _animate(timestamp) {
        if (!this._running) {
            return;
        }
        this._tickLevelClock(timestamp);

        // Read on paused frames too, to keep the edge state.
        const pauseDown = this._inputs.readButtonPause();
        if (pauseDown && !this._pauseWasDown && !this._transitioning && (this._deathModal === null)) {
            if (this._paused) {
                // A stacked modal handles Escape itself as one step back.
                if (this._pauseModal.isAtRoot()) {
                    this._leavePause();
                }
            } else {
                this._enterPause();
            }
        }
        this._pauseWasDown = pauseDown;

        const player = this._localPlayer();
        // Frozen frame (pause, tally): the modal owns the inputs.
        if (this._paused || this._transitioning) {
            this._applyGameSettings(player);
            this._presentation.presentFrozen();
            requestAnimationFrame(this._animateCallback);
            return;
        }

        const engine = this._presentation.getEngine();
        engine.calculateDeltaTime(timestamp);
        const dt       = engine.getDeltaTime();
        const user     = player.getUser();
        const weapon   = player.getWeapon();
        const previous = user.getLastCommand();
        const command  = this._commandSampler.collect(dt).sample();

        if (command.isJustPressed(DoomGame.BUTTON_CHEAT_FULL_KIT, previous)) {
            this._applyCheatFullKit();
        }

        this._presentation.readViewToggles();

        if (weapon !== null) {
            this._cycleWeapons(weapon, command, previous);
        }

        this._world.update(dt, command);
        user.updateEffects(dt);
        this._trackDeath(dt);
        this._presentation.revealAutomap();
        if (weapon !== null) {
            if (this._sectorLight !== null) {
                weapon.setLight(this._sectorLight.factorAt(user.x, user.z));
            }
            weapon.update(dt, command.isPressed(DoomGame.BUTTON_FIRE));
        }
        if (this._effects !== null) {
            this._effects.update(dt);
        }
        if (this._projectiles !== null) {
            this._projectiles.update(dt);
        }
        if (this._monsters !== null) {
            this._monsters.update(dt);
        }
        if (this._decals !== null) {
            this._decals.update(dt);
        }
        // S_UpdateSounds.
        doomSound.update();
        if (this._ambientSounds !== null) {
            this._ambientSounds.update(dt);
        }
        this._applyGameSettings(player);
        this._presentation.present(dt, this._isGameMenuOpen());

        requestAnimationFrame(this._animateCallback);
    }

    // Read every frame so a change from the pause options applies live.
    _applyGameSettings(player) {
        player.applyMovementSettings({
            fallDamage: doomSettings.getGameFallDamage(),
            jump:       doomSettings.getGameJump(),
            crouch:     doomSettings.getGameCrouch()
        });
    }

    // A gamepad pause can leave the pointer lock engaged. Inputs are null
    // before the first level.
    _teardownLevel() {
        if (this._inputs !== null) {
            this._inputs.releaseMouse();
        }
        this._stopLevel();
        loader.reset();
    }

    // --- Pause menu ---

    _enterPause() {
        this._paused = true;
        doomSound.playUi('menu/activate').setPaused(true);
        this._inputs.releaseMouse().setVirtualPadVisible(false);

        this._pauseDisplay = new MenuDisplay('screen').init(true);
        this._pauseModal   = new MenuPauseModal(this._pauseDisplay)
            .setOnResume(() => this._leavePause())
            .setOnQuit(() => {
                this._leavePause(false);
                this._quitToMenu();
            })
            .setSaveContext(this._saveContext())
            .show(() => this._pauseTitle());
    }

    // Null without WAD metadata (direct test shortcut): saves are keyed by WAD.
    _saveContext() {
        if (this._wadMeta === null) {
            return null;
        }
        return {
            wadMeta:   this._wadMeta,
            buildMeta: (slot) => ({
                id:            DoomSaveStore.saveId(this._wadMeta.id, slot),
                wadId:         this._wadMeta.id,
                slot:          slot,
                levelCode:     this._levelCode,
                skill:         this._skill,
                savedAt:       Date.now(),
                formatVersion: DoomSaveStore.FORMAT_VERSION,
            }),
            capture:   () => this.captureSnapshot(),
            canSave:   () => !this._localPlayer().isDead(),
            onLoad:    (saveMeta) => this._loadFromSave(saveMeta),
        };
    }

    // The browser refuses the mouse grab on an Escape resume (no user
    // activation): the player re-clicks the canvas.
    _leavePause(backToGame = true) {
        doomSound.playUi('menu/clear').setPaused(false);
        this._pauseModal.close();
        this._pauseDisplay.destroy();
        this._pauseModal   = null;
        this._pauseDisplay = null;

        this._paused       = false;
        this._pauseWasDown = true;
        this._presentation.getEngine().resetDeltaClock();
        if (backToGame) {
            this._inputs.setVirtualPadVisible(true);
            if (this._inputs.getMode() === 'keyboardMouse') {
                this._inputs.grabMouse();
            }
        }
    }

    // "{wad} — Episode {n}"; a MAPxx game is episode 1.
    _pauseTitle() {
        const episode  = (WadLevelCode.parse(this._levelCode).episode ?? 1);
        const wadTitle = ((this._wadMeta !== null) ? WadRegistry.displayTitle(this._wadMeta) : this._levelCode);

        return wadTitle + ' — ' + appTranslator.get('menu.episode.item', {episode: episode});
    }

    _quitToMenu() {
        this._teardownLevel();
        this._backToMenu();
    }

    // The running level only goes down once the save proved readable and compatible.
    async _loadFromSave(saveMeta) {
        const display = (this._pauseDisplay ?? this._deathDisplay);
        let snapshot = null;
        try {
            snapshot = (await doomSaveStore.read(saveMeta.wadId, saveMeta.slot)).snapshot;
        } catch (error) {
            console.error(error);
            new MenuModal(display).showError(appTranslator.get('menu.save.loadError'), error.message, () => {});
            return;
        }
        if (snapshot.formatVersion !== DoomSaveStore.FORMAT_VERSION) {
            new MenuModal(display).info(appTranslator.get('menu.save.incompatible'));
            return;
        }

        this._closeGameMenu();
        this._teardownLevel();
        new MenuNavigator().startFromSave(this._wadMeta, saveMeta);
    }

    // The death menu does not freeze the game: its frames run live under it.
    _isGameMenuOpen() {
        return ((this._pauseDisplay !== null) || (this._deathDisplay !== null));
    }

    _closeGameMenu() {
        if (this._pauseModal !== null) {
            this._leavePause(false);
        }
        if (this._deathModal !== null) {
            this._closeDeathMenu();
        }
    }

    // --- Death menu ---

    // The level keeps running under the death menu, like vanilla. Never during
    // a level exit: the tally owns the screen.
    _trackDeath(dt) {
        if (!this._localPlayer().isDead()) {
            this._deathClockMs = 0;
            return;
        }
        if ((this._deathModal !== null) || this._transitioning) {
            return;
        }
        this._deathClockMs += dt;
        if (this._deathClockMs >= DoomGame.DEATH_MENU_DELAY_MS) {
            this._openDeathMenu();
        }
    }

    _openDeathMenu() {
        this._inputs.releaseMouse().setVirtualPadVisible(false);

        this._deathDisplay = new MenuDisplay('screen').init(true);
        this._deathModal   = new MenuDeathModal(this._deathDisplay)
            .setOnRestart(() => this._restartLevel())
            .setOnNewGame(() => {
                this._closeDeathMenu();
                this._teardownLevel();
                this._leaveLevelTo((navigator, meta) => navigator.startAtEpisodes(meta, this._skill));
            })
            .setOnQuit(() => {
                this._closeDeathMenu();
                this._quitToMenu();
            })
            .setSaveContext(this._saveContext())
            .show(() => appTranslator.get('game.death.title'));
    }

    _closeDeathMenu() {
        this._deathModal.close();
        this._deathDisplay.destroy();
        this._deathModal   = null;
        this._deathDisplay = null;
    }

    // Replays the level with the equipment it began with (the level-start
    // autosave of the modern ports).
    _restartLevel() {
        this._transitioning = true;
        this._closeDeathMenu();
        this._localPlayer().requestRestart();

        const display = new MenuDisplay('screen').init(true);
        this._startNextLevel(display, new MenuModal(display), this._levelCode);
    }

    // Carries the skill over so a new game preselects it.
    _backToMenu() {
        this._leaveLevelTo((navigator, meta) => navigator.startAtWadMenu(meta, this._skill));
    }

    _leaveLevelTo(openMenu) {
        const navigator = new MenuNavigator();
        if (this._wadMeta !== null) {
            openMenu(navigator, this._wadMeta);
            return;
        }
        navigator.start();
    }

    // --- Level transition ---

    // Before loader.reset(): the running world reads its data from the loaders.
    _stopLevel() {
        this._running = false;
        doomSound.unbindLevel();
        this._presentation.teardown();
    }

    // Called by an exit line: the tally, the optional story text, then the
    // next level (or back to the menu after the last one).
    _onLevelExit(secret = false) {
        if (this._transitioning) {
            return;
        }
        this._transitioning = true;
        // A corpse pushed over an exit line: the exit wins over the death menu.
        if (this._deathModal !== null) {
            this._closeDeathMenu();
        }
        // The next level's bindLevel lifts the freeze.
        doomSound.setPaused(true).playIntermissionMusic();

        // Null at the end of the game.
        const nextLevel = this._mapInfo.nextLevelCode(this._levelCode, secret === true);

        // A pointer-locked canvas would swallow the clicks on the tally button.
        this._inputs.releaseMouse().setVirtualPadVisible(false);

        const display = new MenuDisplay('screen').init(true);
        const modal = new MenuModal(display);
        const title = this._tallyTitle(nextLevel);
        const buttonCode = ((nextLevel === null) ? 'game.tally.menu' : 'game.tally.next');

        // Vanilla order: the story text comes after the tally.
        const finaleText = this._finaleText(secret === true);
        const tallyCode  = ((finaleText !== null) ? 'game.finale.continue' : buttonCode);

        modal.tally(title, this._tallyLines(), appTranslator.get(tallyCode), () => {
            if (finaleText === null) {
                this._startNextLevel(display, modal, nextLevel);
                return;
            }
            // gameinfo finalemusic (D_VICTOR / D_READ_M / MUS_CPTD).
            doomSound.playFinaleMusic();
            modal.finale(finaleText, appTranslator.get(buttonCode), () => {
                this._startNextLevel(display, modal, nextLevel);
            });
        });
    }

    _tallyTitle(nextLevel) {
        if (nextLevel === null) {
            return appTranslator.get(((WadLevelCode.isEpisodic(this._levelCode)) ? 'game.episode.finished' : 'game.finished'));
        }
        if (this._levelName !== null) {
            return appTranslator.get('game.level.finishedNamed', {level: this._levelCode, name: this._levelName});
        }

        return appTranslator.get('game.level.finished', {level: this._levelCode});
    }

    // Vanilla precedence: UMAPINFO, the DEHACKED HUSTR replacement (Freedoom),
    // then the game's transcribed table.
    _resolveLevelName() {
        return (this._mapInfo.levelNameFor(this._levelCode)
            ?? this._dehackedStrings.levelName(this._levelCode, this._gameProfile.levelNameStringPrefix())
            ?? this._gameProfile.levelNames()[this._levelCode]
            ?? null);
    }

    // Null when the chapter is not over. Precedence: UMAPINFO, the DEHACKED
    // replacement (Freedoom), then the game's catalog, the only translated one.
    _finaleText(secret) {
        const finale = this._mapInfo.finaleFor(this._levelCode, secret);
        if (finale === null) {
            return null;
        }
        const text = ((finale.text !== undefined)
            ? finale.text
            : (this._dehackedStrings.get(finale.code) ?? doomFinaleTexts.get(this._gameProfile.getCode(), finale.code)));

        return ((text !== null) ? DoomFinaleTexts.reflow(text) : null);
    }

    // A score with nothing to find reads "none" instead of 0/0.
    _tallyLines() {
        const score = (code, found, total) => ({
            label: appTranslator.get(code),
            value: ((total <= 0)
                ? appTranslator.get('game.tally.none')
                : found + '/' + total + ' (' + DoomGame.formatPercent(found, total) + ')')
        });

        return [
            {label: appTranslator.get('game.tally.time'), value: DoomGame.formatDuration(this._levelTimeMs)},
            score('game.tally.kills',   this._killsCount,   this._killsTotal),
            score('game.tally.items',   this._itemsFound,   this._itemsTotal),
            score('game.tally.secrets', this._secretsFound, this._secretsTotal)
        ];
    }

    // M:SS, or H:MM:SS past the hour.
    static formatDuration(ms) {
        const total   = Math.max(0, Math.floor(ms / 1000));
        const seconds = String(total % 60).padStart(2, '0');
        const minutes = Math.floor(total / 60) % 60;
        const hours   = Math.floor(total / 3600);

        return ((hours > 0)
            ? (hours + ':' + String(minutes).padStart(2, '0') + ':' + seconds)
            : (minutes + ':' + seconds));
    }

    // Truncated like the vanilla integer division: 199/200 reads 99 %, not 100 %.
    static formatPercent(found, total) {
        const percent = Math.floor((found * 100) / total);

        return new Intl.NumberFormat(appTranslator.getLocale(), {style: 'percent', maximumFractionDigits: 0})
            .format(percent / 100);
    }

    async _startNextLevel(display, modal, nextLevel) {
        if (nextLevel === null) {
            this._teardownLevel();
            modal.close();
            display.destroy();
            this._transitioning = false;
            this._backToMenu();
            return;
        }

        modal.showLoading(appTranslator.get('game.level.loading', {level: nextLevel}));
        try {
            await this.startFromWad(this._wadFile, nextLevel);
            modal.close();
            display.destroy();
            this._transitioning = false;
        } catch (error) {
            console.error(error);
            loader.reset();
            modal.close();
            display.destroy();
            this._transitioning = false;
            this._backToMenu();
        }
    }
}

// Longest gap between two frames the level clock still counts (ms): well above
// the slowest playable frame, well below a tab switch.
DoomGame.LEVEL_CLOCK_MAX_STEP_MS = 1000;
// Delay between the player's death and the death menu: the camera falls and
// the red tint settles first, and an exit fired right after the death wins.
DoomGame.DEATH_MENU_DELAY_MS = 1000;
// Buttons and impulse the game adds to the engine's in every UserCommand.
DoomGame.BUTTON_FIRE           = 'fire';
DoomGame.BUTTON_WEAPON_NEXT    = 'weaponNext';
DoomGame.BUTTON_WEAPON_PREV    = 'weaponPrev';
DoomGame.BUTTON_CHEAT_FULL_KIT = 'cheatFullKit';
DoomGame.IMPULSE_WEAPON_WHEEL  = 'weaponWheel';
// The main holds slot 1; a single-player game has it alone.
DoomGame.LOCAL_PLAYER_ID = 1;
