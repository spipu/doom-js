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
        this._restoreSnapshot   = null;
        this._secretsFound      = 0;
        this._secretsTotal      = 0;
        this._killsCount        = 0;
        this._killsTotal        = 0;
        this._pauseWasDown      = true;
        this._cheatWasDown      = false;
        this._hudWasDown        = false;
        this._weaponNextWasDown = false;
        this._weaponPrevWasDown = false;
        this._running           = false;
        this._transitioning     = false;
        this._paused            = false;
        this._pauseDisplay      = null;
        this._pauseModal        = null;
        this._animateCallback   = this._animate.bind(this);

        // Weapon firing (built per level)
        this._playerWeapon    = null;
        this._weaponSprites   = null;
        this._availableWeapons = null;   // codes whose sprites exist in this WAD
        this._effects         = null;    // transient sprite effects (puffs, explosions)
        this._hitscan         = null;
        this._projectiles     = null;    // rocket / plasma / BFG shots
        this._decals          = null;    // persistent wall impact decals
        this._sectorLight     = null;    // player-sector light lookup (weapon shading)
        this._gunTriggers     = null;    // impact-special lines (shot-activated movers)
        this._depthShadingOn  = null;    // last display states pushed to the engine (null = never)
        this._texSmoothingOn  = null;
        this._fov             = WadConstants.PLAYER_FOV;   // current Doom FOV (telezoom eases it back)
        this._fovTicAcc       = 0;
        this._rng             = new DoomRandom();

        // Per-game policy + shared immutable definitions (the per-player state
        // lives on DoomUser). The default profile covers the pre-WAD state;
        // startFromWad re-detects and rebuilds from the real WAD's profile.
        this._gameProfile    = new DefaultGameProfile();
        this._weapons        = {};
        this._ammoTypes      = {};
        this._items          = {};
        this._thingCatalog   = null;
        this._monsterCatalog = null;
        this._monsters       = null;   // runtime monster system (built per level)
        this._monsterDamage  = null;   // shared damage pipeline (built per level)
        this._skillTable     = null;
        this._buildCatalogs();
    }

    // --- Catalogs of definitions (all per-game data comes from the profile) ---
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

    getGameProfile() {
        return this._gameProfile;
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

    // --- Pickups ---

    // Apply a picked-up thing's effect descriptor to the player. Returns true
    // when something was actually consumed — false leaves the sprite on the
    // ground (Doom does not pick up health/armor/ammo already full, nor a
    // weapon/key already held). Effect shapes come from the profile's thing types (DoomThingCatalog).
    applyPickup(user, effect) {
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
            // Megasphere-like: SETS health to the given value (p_inter.c, it
            // does not add) and grants the given armour class.
            const healed  = user.addEnergy(effect.mega.health, effect.mega.health);
            const armored = this._pickupArmor(user, effect.mega.armor);
            return (healed || armored);
        }
        return false;
    }

    // Extra ammo on the easiest and hardest skills — the factor is per-game
    // profile data (Doom ×2, Heretic ×1.5).
    _ammoMultiplier() {
        return this._skillRule().ammoFactor;
    }

    // Give ammo and report whether the counter actually rose (it stays put when
    // already at the cap). Centralises the clamp-and-detect used by every path.
    _grantAmmo(user, type, amount) {
        const before = user.getAmmo(type);
        user.giveAmmo(type, amount);
        return (user.getAmmo(type) > before);
    }

    _pickupWeapon(user, code, dropped = false) {
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
        // Ammo handed out with the weapon: the def's own ammoGive when the game
        // sets one (Heretic per-weapon amounts), else the Doom 2 × clip rule —
        // further doubled on skill 1/5. An already-owned weapon is still
        // collected as long as it tops up ammo; it only stays on the ground
        // when ammo is already full.
        let gaveAmmo = false;
        const ammoType = def.getAmmoType();
        if (ammoType !== null) {
            // A weapon dropped by a monster hands out HALF its ammo (vanilla
            // wp_dropped), still skill-multiplied.
            const base   = ((def.getAmmoGive() !== null) ? def.getAmmoGive() : this.getAmmo(ammoType).getClip() * 2);
            gaveAmmo = this._grantAmmo(user, ammoType, base * ((dropped) ? 0.5 : 1) * this._ammoMultiplier());
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
            this._grantAmmo(user, code, this._ammoTypes[code].getPackGive() * this._ammoMultiplier());
        }
        return true;
    }

    // spec = {points, absorb} — the armour classes are per-game catalog data
    // (Doom green 100/⅓ + blue 200/½, Heretic silver 100/½ + enchanted 200/¾).
    _pickupArmor(user, spec) {
        if (user.getArmor() >= spec.points) {
            return false;
        }
        // The 0→200 ceiling is fixed (set in the loadout); a pickup only sets the
        // armour points and the absorption fraction of its type.
        user.setArmor(spec.points);
        user.setArmorAbsorb(spec.absorb);
        return true;
    }

    // absorb = the fraction granted when the bonus lands on a bare player
    // (catalog data — Doom's helmet bonus gives the green class).
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
        // Pickup heal (catalog data — Doom's berserk, vanilla P_GivePower
        // pw_strength): the heal happens BEFORE the already-owned check, so
        // every sphere re-heals and is consumed even when already held — and
        // each pickup restarts the fading red wash (PowerStrength resets its
        // EffectTics on re-pickup).
        if (def.getPickupHeal() !== null) {
            user.giveItem(code);
            user.addEnergy(def.getPickupHeal(), def.getPickupHeal());
            user.addEffect('berserkFlash', WadConstants.BERSERK_FLASH_MS);
            return true;
        }
        // Key or permanent power-up: a key already held leaves the sprite.
        if (user.hasItem(code)) {
            return false;
        }
        user.giveItem(code);
        return true;
    }

    // Pour the game's canonical starting loadout (profile data) on the freshly
    // built DoomUser: all weapon slots declared, the starting weapons owned,
    // the ammo counters initialised to their normal cap with the starting ammo.
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

        // The armour is a single 0→max counter; a pickup only sets the points
        // and the absorption fraction of its type. The player starts at 0.
        user.setMaxArmor(loadout.maxArmor);
        user.setArmor(0);
    }

    // Debug cheat (the 'o' key): full kit through the normal DoomUser grant
    // paths — same ammo caps and armour ceiling as the pickups.
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

        const armor = this._gameProfile.cheatKitArmor();
        user.setEnergy(user.getMaxEnergy());
        user.setMaxArmor(this._gameProfile.startingLoadout().maxArmor);
        user.setArmor(armor.points);
        user.setArmorAbsorb(armor.absorb);
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

    // Sector-light lookup handed over by the world builder (weapon shading).
    setSectorLight(sectorLight) {
        this._sectorLight = sectorLight;
    }

    // Impact-special lines handed over by the world builder (gun triggers,
    // tested by the hitscan against every shot trace).
    setGunTriggers(gunTriggers) {
        this._gunTriggers = gunTriggers;
    }

    // Transient effect spawner — built after the world, so build-time
    // consumers (teleport interactions) read it lazily at trigger time.
    getEffects() {
        return this._effects;
    }

    // ZDoom telezoom (deliberate borrow, cvar telezoom): a teleport arrival
    // widens the FOV instantly, then _updateTeleZoom eases it back per tic.
    startTeleZoom() {
        this._fov       = Math.min(WadConstants.TELEZOOM_FOV_MAX, WadConstants.PLAYER_FOV + WadConstants.TELEZOOM_FOV_BOOST);
        this._fovTicAcc = 0;
        this._applyFov();
    }

    // CheckFOV ease-back: max(TELEZOOM_STEP_MIN, diff × TELEZOOM_STEP_FACTOR)
    // degrees per tic, snapping once the gap drops under the minimum step.
    _updateTeleZoom(dt) {
        if (this._fov === WadConstants.PLAYER_FOV) {
            return;
        }
        const msPerTic = WadConstants.SECONDS_PER_TIC * 1000;
        this._fovTicAcc += dt;
        while (this._fovTicAcc >= msPerTic) {
            this._fovTicAcc -= msPerTic;
            const diff = this._fov - WadConstants.PLAYER_FOV;
            if (Math.abs(diff) < WadConstants.TELEZOOM_STEP_MIN) {
                this._fov = WadConstants.PLAYER_FOV;
                break;
            }
            const step = Math.max(WadConstants.TELEZOOM_STEP_MIN, Math.abs(diff) * WadConstants.TELEZOOM_STEP_FACTOR);
            this._fov += ((diff > 0) ? -step : step);
        }
        this._applyFov();
    }

    // The engine's fov parameter is the half-angle of the projection.
    _applyFov() {
        this._engine.setFov(this._fov / 2);
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

    getKillsCount() {
        return this._killsCount;
    }

    getKillsTotal() {
        return this._killsTotal;
    }

    // --- Save / load ---

    /**
     * Arms the next startFromWad to restore a saved game on top of the rebuilt
     * level (see DoomGameSnapshot). Consumed by _init.
     */
    setRestoreSnapshot(snapshot) {
        this._restoreSnapshot = snapshot;
        return this;
    }

    /**
     * Snapshot of the running level (save game) — captured while the game is
     * frozen under the pause menu, so the state is coherent.
     */
    captureSnapshot() {
        return new DoomGameSnapshot().capture(this._snapshotContext());
    }

    // Explicit dependencies of the snapshot service — it never reaches into
    // the game's privates.
    _snapshotContext() {
        return {
            wadId:        ((this._wadMeta !== null) ? this._wadMeta.id : null),
            levelCode:    this._levelName,
            skill:        this._skill,
            user:         this._world.getUser(),
            collision:    this._world.getCollision(),
            rng:          this._rng,
            monsters:     this._monsters,
            gunTriggers:  this._gunTriggers,
            secretsFound: this._secretsFound,
            killsCount:   this._killsCount,
            setCounters:  (secretsFound, killsCount) => {
                this._secretsFound = secretsFound;
                this._killsCount   = killsCount;
            },
        };
    }

    // spawnOverride is a debug helper: when set ({position, yaw, pitch}) the
    // player is forced to that location after the world is built, instead of the
    // WAD spawn (see _applySpawnOverride).
    async startFromWad(wadFile, levelName, wadMeta = null, spawnOverride = null, skill = null) {
        this._wadFile     = wadFile;
        this._gameProfile = new GameProfileList().getForWad(wadFile);
        this._buildCatalogs();
        this._mapInfo     = new WadMapInfo(wadFile, this._gameProfile);
        this._levelName   = levelName;
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

        // Secrets and kills are level stats (vanilla totalsecret/totalkills):
        // reset on every level, the totals are pushed back by the world builder.
        this._secretsFound = 0;
        this._secretsTotal = 0;
        this._killsCount   = 0;
        this._killsTotal   = 0;

        this._teardownLevel();
        loader.beginBatch();
        // The monster system is created BEFORE the builder: the builder feeds
        // it while pre-building every (frame × rotation) billboard inside the
        // batch (an object registered after endBatch would re-fire the loader).
        // The skill rule must be known at add() time (InstantReaction).
        this._monsters = new DoomMonsterSystem();
        this._monsters.setSkillRule(this._skillRule());
        this._monsters.setRandom(this._rng);
        this._monsters.setNightmareFast(this._gameProfile.nightmareFast());
        await new WadWorldBuilder(wadFile, levelName, {
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

        // Pre-decode every weapon view/flash frame INSIDE the batch: decoding a
        // sprite registers a texture, and any registration after endBatch would
        // re-trigger the loader's global check (and _init) mid-render.
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
        // Effect + projectile sprites are built here too, inside the batch, so no
        // billboard object is registered after endBatch (which would re-fire the
        // loader). The projectile system gets its world (collision + user) in _init.
        this._effects     = new DoomEffects(this._weaponSprites, this._rng, this._gameProfile);
        // Impact decals: textures + quad templates are built here in the batch,
        // from the game profile's decal set. Skipped only if the decal graphics
        // haven't finished decoding yet (first-level race).
        this._decals = ((doomDecalTextures.isReady()) ? new DoomDecals(doomDecalTextures, this._rng, this._gameProfile) : null);
        // Shared damage pipeline of the shootable bodies — wired to the world
        // in _init, consumed by hitscan, projectiles and the bodies' own
        // A_Explode (barrels).
        this._monsterDamage = new DoomMonsterDamage(this._monsters, this._effects, this._rng, this._gameProfile.monsterDamageRules(), this);
        this._monsters.setDamageModule(this._monsterDamage).setEffects(this._effects);
        this._projectiles = new DoomProjectileSystem(this._weaponSprites, this._effects, this._rng, this._decals, this._gameProfile, this._monsters, this._monsterDamage);

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
        if (this._restoreSnapshot !== null) {
            // Saved-game restore: the full saved equipment comes back, keys
            // and timed effects included — no per-level reset.
            user.importState(this._restoreSnapshot.player.state);
        } else if (this._carriedState === null) {
            this._setupLoadout(user);
        } else {
            // Carry equipment over, then drop the level-scoped possessions
            // (keys, timed effects) — weapons/ammo/energy/armor persist.
            user.importState(this._carriedState);
            user.resetForNewLevel(this);
        }
        // Skill-derived, re-applied on every level — never part of the
        // carried equipment state.
        user.setDamageFactor(this._skillRule().damageFactor);
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
        doomSettings.applyToInputs(this._inputs);

        this._engine = new Engine3d(this._screen, new Object3dRendererList().getRenderer('webgl'));
        this._fov       = WadConstants.PLAYER_FOV;
        this._fovTicAcc = 0;
        this._applyFov();
        this._engine.setZBuffer(0.1, 100);
        // The engine is recreated on each level: re-arm the display settings.
        this._depthShadingOn = null;
        this._texSmoothingOn = null;
        this._applyDisplaySettings();

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
        // vanilla M_ClearRandom. It brings the active weapon up on construction —
        // skipped entirely while the player has no weapon (a game whose arsenal
        // is not built yet): no controller, no overlay, nothing to decode.
        this._rng.reset();
        this._playerWeapon = null;
        // Monsters + the shared damage pipeline (blood, pain, death, thrust):
        // wired before the hitscan so every attack channel lands on the bodies.
        this._monsters.setWorld(this._world.getCollision(), this._world.getUser());
        this._monsterDamage.setWorld(this._world.getCollision(), this._world.getUser());
        this._hitscan = new DoomHitscan(this._world.getCollision(), this._effects, this._rng, this._decals, this._gunTriggers, this._monsters, this._monsterDamage);
        this._projectiles.setWorld(this._world.getCollision(), this._world.getUser());
        if (this._world.getUser().getActiveWeapon() !== null) {
            this._playerWeapon = new DoomPlayerWeapon(this, this._world.getUser(), this._weaponSprites, this._rng);
            this._playerWeapon.setAttackSystems(this._hitscan, this._projectiles);
            this._playerWeapon.setNoiseCallback(() => this._monsters.noiseAlert());
            this._engine.setOverlayCallback((renderer, engine) => this._drawWeaponOverlay(renderer, engine));
        }

        // Saved-game restore, once everything is built and wired but before
        // the first frame: patch the dynamic state over the fresh level.
        if (this._restoreSnapshot !== null) {
            new DoomGameSnapshot().apply(this._snapshotContext(), this._restoreSnapshot);
            this._restoreSnapshot = null;
            this._engine.resetDeltaClock();
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

        // Pause button (press edge): toggle the pause menu over the frozen
        // game — read every frame, paused included, to keep the edge state.
        const pauseDown = this._inputs.readButtonPause();
        if (pauseDown && !this._pauseWasDown && !this._transitioning) {
            if (this._paused) {
                // A stacked modal (options, save slots, confirm) handles the
                // Escape key itself as one step back: the toggle only leaves
                // the pause from its root.
                if (this._pauseModal.isAtRoot()) {
                    this._leavePause();
                }
            } else {
                this._enterPause();
            }
        }
        this._pauseWasDown = pauseDown;

        // Frozen frame: no other input read (the modal owns them, and some
        // reads are consuming), no time step — just redraw the same image (a
        // resize would otherwise wipe the canvas) under the pause overlay.
        // Display settings stay live: the stacked options modal can toggle them.
        if (this._paused) {
            this._applyDisplaySettings();
            this._engine.displayWorld(this._world);
            this._screen.update();
            requestAnimationFrame(this._animateCallback);
            return;
        }

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

        if (this._playerWeapon !== null) {
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
        if (this._playerWeapon !== null) {
            const user = this._world.getUser();
            if (this._sectorLight !== null) {
                this._playerWeapon.setLight(this._sectorLight.factorAt(user.x, user.z));
            }
            this._playerWeapon.update(dt, this._inputs.readButtonFire());
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
        this._applyDisplaySettings();
        this._updateTeleZoom(dt);
        this._pushEffectDisplay(this._world.getUser());
        this._engine.displayWorld(this._world);
        this._screen.update();

        requestAnimationFrame(this._animateCallback);
    }

    // display.* settings pushed to the engine when they change (read every
    // frame — a toggle from the Display help page applies live, like the
    // crosshair). The diminishing curve constants live in WadConstants.
    _applyDisplaySettings() {
        this._depthShadingOn = this._pushDisplaySetting(
            this._depthShadingOn,
            doomSettings.getDisplayDistanceShading(),
            (on) => this._engine.setDepthShading(((on) ? WadConstants.lightDiminishParams() : null)));
        this._texSmoothingOn = this._pushDisplaySetting(
            this._texSmoothingOn,
            doomSettings.getDisplayTextureSmoothing(),
            (on) => this._engine.setTextureSmoothing(on));
    }

    // Engine-facing state of the running effects, re-derived every frame:
    // night vision (Doom light visor / Heretic torch) = scene-wide light
    // floor, blinking through the vanilla end-of-powerup window.
    _pushEffectDisplay(user) {
        this._engine.setLightOverride(((user.isEffectVisible('light'))
            ? WadConstants.NIGHT_VISION_LIGHT : null));
    }

    _pushDisplaySetting(current, wanted, apply) {
        if (wanted !== current) {
            apply(wanted);
        }
        return wanted;
    }

    // Engine overlay callback: draw the weapon view sprite (+ muzzle flash) over
    // the scene. The controller returns rects normalised on the 320x200
    // psprite canvas — a 4:3 design (1.2 tall pixels) — so on a wider screen
    // the weapon layer is squeezed around the centre to keep its vanilla
    // proportions (gzdoom-like) instead of being stretched to the full width:
    // asymmetric weapons (Heretic gauntlets, the Doom fist) stay where the
    // original game puts them.
    _drawWeaponOverlay(renderer, engine) {
        const k = DoomGame.PSPRITE_ASPECT / this._screen.getAspectRatio();
        // Partial invisibility: the weapon in hand fades out, flashing back
        // solid through the vanilla end-of-powerup blink.
        const alpha = ((this._world.getUser().isEffectVisible('invisibility'))
            ? WadConstants.INVISIBILITY_WEAPON_ALPHA : 1);
        for (const spr of this._playerWeapon.getViewSprites()) {
            renderer.drawScreenSprite(engine, spr.texId, 0.5 + (spr.x - 0.5) * k, spr.y, spr.w * k, spr.h, spr.light, alpha);
        }
    }

    // Stop the running level and wipe every loader (rAF first: World.update
    // reads the loaders each frame). The mouse goes back to the browser —
    // a gamepad pause can leave the pointer lock engaged. Inputs are null
    // until the first level built its screen (startFromWad tears down first).
    _teardownLevel() {
        if (this._inputs !== null) {
            this._inputs.releaseMouse();
        }
        this._stopLevel();
        loader.reset();
    }

    // --- Pause menu ---

    // Freeze the game under the pause modal: no time step runs while paused
    // (engine clock untouched → animated textures, movers, monsters, weapons
    // and screen flashes all hold still). The mouse goes back to the browser
    // and the touch pad hides under the overlay.
    _enterPause() {
        this._paused = true;
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

    // Save/load wiring of the pause menu — the frozen game captures a coherent
    // snapshot. Null without stored WAD metadata (direct test shortcut): saves
    // are partitioned by WAD, there is nothing to key them on.
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
                levelCode:     this._levelName,
                skill:         this._skill,
                savedAt:       Date.now(),
                formatVersion: DoomSaveStore.FORMAT_VERSION,
            }),
            capture:   () => this.captureSnapshot(),
            canSave:   () => !this._world.getUser().isDead(),
            onLoad:    (saveMeta) => this._loadFromSave(saveMeta),
        };
    }

    // Back to the game: the delta clock restarts from zero so the paused
    // wall-time never reaches the world, and the mouse is grabbed back — a
    // click/Enter resume carries the user activation the lock needs; an
    // Escape resume does not (the browser refuses it), the player re-clicks
    // the canvas, the pre-existing recovery. Quitting the level skips the
    // grab — the canvas is about to be destroyed.
    _leavePause(backToGame = true) {
        this._pauseModal.close();
        this._pauseDisplay.destroy();
        this._pauseModal   = null;
        this._pauseDisplay = null;

        this._paused       = false;
        this._pauseWasDown = true;
        this._engine.resetDeltaClock();
        if (backToGame) {
            this._inputs.setVirtualPadVisible(true);
            if (this._inputs.getMode() === 'keyboardMouse') {
                this._inputs.grabMouse();
            }
        }
    }

    // "{wad} — Episode {n}" — the episode digit comes from the level name
    // (a MAPxx game is its single episode 1); without stored meta (direct
    // test shortcut) the level name stands in for the WAD.
    _pauseTitle() {
        const episodeMatch = /^E(\d)M/i.exec(this._levelName);
        const episode      = ((episodeMatch !== null) ? Number(episodeMatch[1]) : 1);
        const wadTitle     = ((this._wadMeta !== null) ? WadRegistry.displayTitle(this._wadMeta) : this._levelName);

        return wadTitle + ' — ' + appTranslator.get('menu.episode.item', {episode: episode});
    }

    // Leave the current level (pause menu quit entry) and go back to the
    // WAD's menu.
    _quitToMenu() {
        this._teardownLevel();
        this._backToMenu();
    }

    // Load a saved game from the pause menu: the running level only goes down
    // once the save proved readable and compatible — a broken slot must not
    // cost the current (unsaved) game.
    async _loadFromSave(saveMeta) {
        let snapshot = null;
        try {
            snapshot = (await doomSaveStore.read(saveMeta.wadId, saveMeta.slot)).snapshot;
        } catch (error) {
            console.error(error);
            new MenuModal(this._pauseDisplay).showError(appTranslator.get('menu.save.loadError'), error.message, () => {});
            return;
        }
        if (snapshot.formatVersion !== DoomSaveStore.FORMAT_VERSION) {
            new MenuModal(this._pauseDisplay).info(appTranslator.get('menu.save.incompatible'));
            return;
        }

        this._leavePause(false);
        this._teardownLevel();
        new MenuNavigator().startFromSave(this._wadMeta, saveMeta);
    }

    // Back to the played WAD's menu (pause, end of game, failed chain
    // conversion), carrying the skill of the interrupted game so a new one
    // preselects it — or to the WAD list when no meta is known (direct test
    // shortcut).
    _backToMenu() {
        const navigator = new MenuNavigator();
        if (this._wadMeta !== null) {
            navigator.startAtWadMenu(this._wadMeta, this._skill);
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
        let message = appTranslator.get('game.level.finished', {level: this._levelName});
        if (nextLevel === null) {
            const endCode = ((/^E\dM\d$/.test(this._levelName)) ? 'game.episode.finished' : 'game.finished');
            message = appTranslator.get(endCode);
        }
        modal.showMessage(message);

        setTimeout(() => {
            this._startNextLevel(display, modal, nextLevel);
        }, 2000);
    }

    async _startNextLevel(display, modal, nextLevel) {
        if (nextLevel === null) {
            // Last level of the WAD → back to the WAD's menu
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
            // Conversion failure mid-chain: clean up and fall back to the
            // WAD's menu (same recovery as the end of a game).
            console.error(error);
            loader.reset();
            modal.close();
            display.destroy();
            this._transitioning = false;
            this._backToMenu();
        }
    }
}

// The 320x200 psprite canvas was authored for a 4:3 display.
DoomGame.PSPRITE_ASPECT = 4 / 3;
