/**
 * The game world of one level and the rules that move it: the level built from
 * the WAD, its monsters, projectiles, hitscans and effects, the random
 * sequence, the level statistics, the save snapshots, and the tic that
 * advances everything from one command per player. It never reads a device
 * and never draws: DoomGame feeds it, DoomPresentation shows it.
 */
class DoomSimulation {
    /**
     * @param {DoomPlayerRoster} roster
     * @param {DoomGameRules}    rules
     */
    constructor(roster, rules) {
        this._roster             = roster;
        this._rules              = rules;
        this._rng                = new DoomRandom();
        this._skill              = DoomSimulation.DEFAULT_SKILL;
        this._profile            = null;
        this._itemRules          = null;
        this._thingCatalog       = null;
        this._monsterCatalog     = null;
        this._skillTable         = null;
        this._world              = null;
        this._onPlayerTeleported = null;
        // Vanilla totalsecret / totalkills / totalitems + leveltime; the totals
        // come with the built level.
        this._secretsFound       = 0;
        this._secretsTotal       = 0;
        this._killsCount         = 0;
        this._killsTotal         = 0;
        this._itemsFound         = 0;
        this._itemsTotal         = 0;
        this._levelTimeMs        = 0;
        this._levelClockLast     = null;

        this._weaponSprites  = null;
        this._effects        = null;   // transient sprite effects (puffs, explosions)
        this._hitscan        = null;
        this._projectiles    = null;
        this._decals         = null;
        this._monsters       = null;
        this._monsterDamage  = null;
        this._monsterAttack  = null;
        this._sectorLight    = null;
        this._sectorDamage   = null;
        this._gunTriggers    = null;   // shot-activated lines
        this._sectorSurfaces = null;   // floor flats/specials rewritten by the "+change" floors
        this._terrain        = null;
        this._moverSounds    = null;
        this._ambientSounds  = null;
        this._automap        = null;   // null when the WAD has no usable BSP
        this._playerStarts   = {};     // slot → {x, y, z, yaw}, the map's player starts

        // Placeholder until the game detects the WAD's profile.
        this.useProfile(new DefaultGameProfile());
    }

    // --- Profile and skill ---

    useProfile(profile) {
        this._profile        = profile;
        this._itemRules      = new DoomItemRules(profile, this._roster);
        this._thingCatalog   = profile.createThingCatalog();
        this._monsterCatalog = profile.createMonsterCatalog();
        this._skillTable     = profile.skillRules();
        this._itemRules.setAmmoFactor(this._skillRule().ammoFactor);

        return this;
    }

    getGameProfile() {
        return this._profile;
    }

    getItemRules() {
        return this._itemRules;
    }

    setSkill(skill) {
        this._skill = skill;
        this._itemRules.setAmmoFactor(this._skillRule().ammoFactor);

        return this;
    }

    getSkill() {
        return this._skill;
    }

    // Out-of-range skills (dev starter) fall back to the HMP rules.
    _skillRule() {
        return (this._skillTable[this._skill] ?? this._skillTable[DoomSimulation.DEFAULT_SKILL]);
    }

    // --- Level building ---

    /**
     * Builds the level inside the loader batch the caller opened: every object
     * registered after endBatch would re-fire the loader.
     *
     * @param {WadFile}  wadFile
     * @param {string}   levelCode
     * @param {function} onLevelExit - (secret) => void
     */
    async buildLevel(wadFile, levelCode, onLevelExit) {
        this._resetLevelStats();

        // Built before the builder, which feeds it. The skill rule must be
        // known at add() time (InstantReaction).
        this._monsters = new DoomMonsterSystem();
        this._monsters.setSkillRule(this._skillRule());
        this._monsters.setRandom(this._rng);
        this._monsters.setNightmareFast(this._profile.nightmareFast());
        this._monsters.setMonsterSounds(this._profile.monsterSounds());
        this._adoptLevel(await new WadWorldBuilder(wadFile, levelCode, {
            onLevelExit: onLevelExit,
            thingCatalog: this._thingCatalog,
            skill: this._skill,
            multiplayerThings: this._rules.spawnsMultiplayerThings(),
            simulation: this,
            profile: this._profile,
            monsterCatalog: this._monsterCatalog,
            monsterSystem: this._monsters
        }).build());

        this._weaponSprites = new DoomWeaponSpriteBank(wadFile);
        this._itemRules.resolveAvailableWeapons(this._weaponSprites);
        this._effects = new DoomEffects(this._weaponSprites, this._rng, this._profile);
        // Skipped if the decal graphics are not decoded yet (first-level race).
        this._decals = ((doomImageAssets.isReady()) ? new DoomDecals(doomImageAssets, this._rng, this._profile) : null);
        // Not vanilla: a game with no splash of its own gets a generic one,
        // tinted with the colour of each liquid flat.
        if ((this._terrain !== null) && doomImageAssets.isReady()) {
            new DoomGenericSplash(doomImageAssets, this._effects, this._profile).apply(this._terrain);
        }
        this._monsterDamage = new DoomMonsterDamage(this._monsters, this._effects, this._rng, this._profile.monsterDamageRules(), this);
        this._monsters.setDamageModule(this._monsterDamage).setEffects(this._effects);
        this._projectiles = new DoomProjectileSystem(this._weaponSprites, this._effects, this._rng, this._decals, this._profile, this._monsters, this._monsterDamage);
        this._projectiles.setFastMonsters(this._skillRule().fastMonsters);
        this._monsterAttack = new DoomMonsterAttack(this._monsters, this._monsterDamage, this._rng);
        this._monsters.setAttack(this._monsterAttack);
    }

    /**
     * Wires the level's systems on the loaded world; the players join it next,
     * through addPlayer.
     *
     * @param {World} world
     */
    startLevel(world) {
        this._world = world;
        const collision = world.getCollision();

        // Vanilla M_ClearRandom.
        this._rng.reset();
        this._monsters.setWorld(world);
        this._monsterDamage.setWorld(world).setFriendlyFire(this._rules.allowsFriendlyFire());
        this._hitscan = new DoomHitscan(collision, this._effects, this._rng, this._decals, this._gunTriggers, this._monsters, this._monsterDamage);
        this._effects.setWorld(collision);
        if (this._terrain !== null) {
            this._terrain.setEffects(this._effects);
            this._hitscan.setTerrain(this._terrain);
            this._projectiles.setTerrain(this._terrain);
            this._monsters.setTerrain(this._terrain);
            this._monsterDamage.setTerrain(this._terrain);
        }
        this._projectiles.setWorld(world);
        this._monsterAttack.setChannels(this._hitscan, this._projectiles, this._effects);

        return this;
    }

    /**
     * Gives the player its body in the started level, with its equipment —
     * the restored one, else the carried one, else the starting loadout — and
     * the weapon controller that fires it.
     *
     * @param {DoomPlayer}  player
     * @param {object|null} restoredState - the player state of a save being loaded
     */
    addPlayer(player, restoredState) {
        player.enterLevel(this._bodyFor(player));
        this._equip(player, restoredState);
        player.markLevelEntry();

        const user = player.getUser();
        user.setUseProbeDistance(WadConstants.USE_RANGE * WadConstants.SCALE);
        if (user.getActiveWeapon() !== null) {
            player.setWeapon(new DoomPlayerWeapon(this._itemRules, user, this._weaponSprites, this._rng)
                .setAttackSystems(this._hitscan, this._projectiles)
                .setNoiseCallback(() => this._monsters.noiseAlert(user)));
        }

        return this;
    }

    // The main takes the body the world definition built on the player 1 start;
    // any other player gets a new one on a free start.
    _bodyFor(player) {
        if (player.getId() === DoomPlayer.MAIN_ID) {
            return this._world.getUser();
        }
        const start = this._freeStart(player.getId());
        const user  = loader.world().createUser([start.x, start.y, start.z], start.yaw);
        this._world.addUser(user);

        return user;
    }

    // G_CheckSpot / G_DoReborn: its own start when free, else another free
    // start, else its own anyway, else the player 1 start of a map placing
    // fewer starts. The slot is the player id until the lobby hands them out.
    _freeStart(slot) {
        const radius = this._world.getUser().getRadius();
        const own    = (this._playerStarts[slot] ?? null);
        const others = Object.keys(this._playerStarts).map(Number).sort((a, b) => (a - b))
            .filter((other) => (other !== slot)).map((other) => this._playerStarts[other]);
        const free   = [own, ...others].find((start) => ((start !== null) && !this._monsters.isSpotOccupied(start.x, start.z, radius)));

        return (free ?? own ?? this._playerStarts[DoomPlayer.MAIN_ID] ?? WadConstants.FALLBACK_SPAWN);
    }

    _equip(player, restoredState) {
        const user    = player.getUser();
        const carried = player.getCarriedState();
        if (restoredState !== null) {
            // Keys and timed effects included: no per-level reset.
            user.importState(restoredState);
        } else if (carried === null) {
            this._itemRules.setupLoadout(user);
        } else {
            user.importState(carried);
            user.resetForNewLevel(this._itemRules);
        }
        user.setDamageFactor(this._skillRule().damageFactor);
        user.setExitSectorProbe(((this._sectorDamage !== null)
            ? ((body) => this._sectorDamage.isExitSectorAt(body.x, body.z))
            : null));
        user.setLandingSplash(((this._terrain !== null)
            ? ((x, y, z) => this._terrain.splashAt(x, y, z))
            : null));
    }

    getWorld() {
        return this._world;
    }

    // The bodies are drawn as seen from this player's body.
    setViewer(user) {
        this._monsters.setViewer(user);

        return this;
    }

    // --- Level data handed back by the world builder ---

    _adoptLevel(built) {
        this._gunTriggers    = built.getGunTriggers();
        this._sectorDamage   = built.getSectorDamage();
        this._sectorLight    = built.getSectorLight();
        this._sectorSurfaces = built.getSectorSurfaces();
        this._terrain        = built.getTerrain();
        this._moverSounds    = built.getMoverSounds();
        this._ambientSounds  = built.getAmbientSounds();
        this._automap        = built.getAutomap();
        this._playerStarts   = built.getPlayerStarts();
        this._secretsTotal   = built.getSecretsTotal();
        this._killsTotal     = built.getKillsTotal();
        this._itemsTotal     = built.getItemsTotal();
    }

    getMoverSounds() {
        return this._moverSounds;
    }

    getAmbientSounds() {
        return this._ambientSounds;
    }

    getAutomap() {
        return this._automap;
    }

    // Built after the world: build-time consumers (teleports) must read it at trigger time.
    getEffects() {
        return this._effects;
    }

    // --- Teleports ---

    setOnPlayerTeleported(callback) {
        this._onPlayerTeleported = callback;

        return this;
    }

    notifyPlayerTeleported(user) {
        if (this._onPlayerTeleported !== null) {
            this._onPlayerTeleported(user);
        }
    }

    // --- Tic ---

    /**
     * First half of the tic: each commanded player acts, then the world moves.
     *
     * @param {number} dt
     * @param {Map<int, UserCommand>} commands - by player id
     */
    tickPlayers(dt, commands) {
        const players = this._commandedPlayers(commands);
        for (const player of players) {
            this._applyPlayerCommand(player, commands.get(player.getId()));
        }
        this._world.update(dt, new Map(players.map((player) => [player.getUser(), commands.get(player.getId())])));
        for (const player of players) {
            player.getUser().updateEffects(dt);
        }
    }

    /**
     * Second half of the tic: the weapons, then everything the players do not steer.
     *
     * @param {number} dt
     * @param {Map<int, UserCommand>} commands - by player id
     */
    tickWorld(dt, commands) {
        for (const player of this._commandedPlayers(commands)) {
            this._updateWeapon(player, dt, commands.get(player.getId()));
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
    }

    _commandedPlayers(commands) {
        return this._roster.getAll().filter((player) => commands.has(player.getId()));
    }

    _applyPlayerCommand(player, command) {
        const user     = player.getUser();
        const weapon   = player.getWeapon();
        const previous = user.getLastCommand();
        if (this._rules.allowsCheatFullKit() && command.isJustPressed(DoomSimulation.BUTTON_CHEAT_FULL_KIT, previous)) {
            this._itemRules.applyCheatFullKit(user);
        }
        if (weapon !== null) {
            this._cycleWeapons(weapon, command, previous);
        }
    }

    // Next / previous on a fresh press, then one step per wheel notch.
    _cycleWeapons(weapon, command, previous) {
        if (command.isJustPressed(DoomSimulation.BUTTON_WEAPON_NEXT, previous)) {
            weapon.cycleWeapon(1);
        }
        if (command.isJustPressed(DoomSimulation.BUTTON_WEAPON_PREV, previous)) {
            weapon.cycleWeapon(-1);
        }
        const wheel = command.getImpulse(DoomSimulation.IMPULSE_WEAPON_WHEEL);
        for (let n = 0; n < Math.abs(wheel); n++) {
            weapon.cycleWeapon(((wheel > 0) ? 1 : -1));
        }
    }

    _updateWeapon(player, dt, command) {
        const weapon = player.getWeapon();
        if (weapon === null) {
            return;
        }
        const user = player.getUser();
        if (this._sectorLight !== null) {
            weapon.setLight(this._sectorLight.factorAt(user.x, user.z));
        }
        weapon.update(dt, command.isPressed(DoomSimulation.BUTTON_FIRE));
    }

    // --- Level statistics ---

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

    addSecretFound() {
        this._secretsFound++;
    }

    getSecretsFound() {
        return this._secretsFound;
    }

    getSecretsTotal() {
        return this._secretsTotal;
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

    addItem() {
        this._itemsFound++;
    }

    getItemsFound() {
        return this._itemsFound;
    }

    getItemsTotal() {
        return this._itemsTotal;
    }

    getLevelTimeMs() {
        return this._levelTimeMs;
    }

    /**
     * Real time, not the engine delta, which is clamped to 50 ms and would lag
     * below 20 fps. Backgrounded-tab gaps are not counted.
     *
     * @param {number}  timestamp
     * @param {boolean} counting - false on frozen frames (pause, tally)
     */
    tickLevelClock(timestamp, counting) {
        const now  = ((typeof timestamp === 'number') ? timestamp : performance.now());
        const step = ((this._levelClockLast !== null) ? (now - this._levelClockLast) : 0);
        if (counting && (step > 0) && (step <= DoomSimulation.LEVEL_CLOCK_MAX_STEP_MS)) {
            this._levelTimeMs += step;
        }
        this._levelClockLast = now;
    }

    // --- Save / load ---

    captureSnapshot(player, wadId, levelCode) {
        return new DoomGameSnapshot().capture({...this._snapshotContext(player), wadId: wadId, levelCode: levelCode});
    }

    applySnapshot(player, snapshot) {
        new DoomGameSnapshot().apply(this._snapshotContext(player), snapshot);

        return this;
    }

    _snapshotContext(player) {
        return {
            skill:          this._skill,
            user:           player.getUser(),
            collision:      this._world.getCollision(),
            rng:            this._rng,
            monsters:       this._monsters,
            projectiles:    this._projectiles,
            gunTriggers:    this._gunTriggers,
            sectorSurfaces: this._sectorSurfaces,
            automap:        this._automap,
            secretsFound:   this._secretsFound,
            killsCount:     this._killsCount,
            itemsFound:     this._itemsFound,
            levelTimeMs:    this._levelTimeMs,
            setCounters:    (secretsFound, killsCount, itemsFound, levelTimeMs) => {
                this._secretsFound = secretsFound;
                this._killsCount   = killsCount;
                this._itemsFound   = itemsFound;
                this._levelTimeMs  = levelTimeMs;
            },
        };
    }
}

// Hurt Me Plenty: the vanilla default, and the fallback of an unknown skill.
DoomSimulation.DEFAULT_SKILL = 3;
// Longest gap between two frames the level clock still counts (ms): well above
// the slowest playable frame, well below a tab switch.
DoomSimulation.LEVEL_CLOCK_MAX_STEP_MS = 1000;
// Buttons and impulse the game adds to the engine's in every UserCommand.
DoomSimulation.BUTTON_FIRE           = 'fire';
DoomSimulation.BUTTON_WEAPON_NEXT    = 'weaponNext';
DoomSimulation.BUTTON_WEAPON_PREV    = 'weaponPrev';
DoomSimulation.BUTTON_CHEAT_FULL_KIT = 'cheatFullKit';
DoomSimulation.IMPULSE_WEAPON_WHEEL  = 'weaponWheel';
