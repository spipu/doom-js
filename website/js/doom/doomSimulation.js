/**
 * The game world of one level and the rules that move it: the level built from
 * the WAD, its monsters, projectiles, hitscans and effects, the random
 * sequence, the level statistics it counts, the save snapshots, and the tic
 * that advances everything from one command per player. It runs on the main
 * alone, never reads a device and never draws: DoomGame feeds it, and
 * DoomPresentation shows what it builds and counts without knowing it.
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
        this._itemCatalog        = null;
        this._itemRules          = null;
        this._skillTable         = null;
        this._world              = null;
        this._level              = null;   // the DoomBuiltLevel it adopted
        this._stats              = new DoomLevelStats();
        this._onPlayerTeleported = null;

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
        this._playerStarts   = {};     // slot → {x, y, z, yaw}, the map's player starts
    }

    // --- Profile and skill ---

    /**
     * @param {AbstractGameProfile} profile     - the WAD's, resolved by the game
     * @param {DoomItemCatalog}     itemCatalog - built on that profile, shared with the presentation
     */
    useProfile(profile, itemCatalog) {
        this._profile        = profile;
        this._itemCatalog    = itemCatalog;
        this._itemRules      = new DoomItemRules(profile, itemCatalog, this._roster);
        this._skillTable     = profile.skillRules();
        this._itemRules.setAmmoFactor(this._skillRule().ammoFactor);

        return this;
    }

    setSkill(skill) {
        this._skill = skill;
        this._itemRules.setAmmoFactor(this._skillRule().ammoFactor);

        return this;
    }

    // Out-of-range skills (dev starter) fall back to the HMP rules.
    _skillRule() {
        return (this._skillTable[this._skill] ?? this._skillTable[DoomSimulation.DEFAULT_SKILL]);
    }

    // --- Level adoption ---

    /**
     * Wires the simulation onto the level every device builds, inside the
     * loader batch the caller opened: its monster system from the placements,
     * the damage, projectile and attack systems, and the interactions only the
     * simulating device registers (nothing registers after endBatch).
     *
     * @param {DoomBuiltLevel} built
     * @param {function}       onLevelExit - (secret) => void
     */
    adoptLevel(built, onLevelExit) {
        this._stats.reset();
        this._adoptLevelServices(built);
        this._adoptMonsters(built, onLevelExit);
        this._weaponSprites = built.getWeaponSprites();
        this._effects       = built.getEffects().setRandom(this._rng);
        this._decals        = built.getDecals();
        if (this._decals !== null) {
            this._decals.setRandom(this._rng);
        }
        this._monsterDamage = new DoomMonsterDamage(this._monsters, this._effects, this._rng, this._profile.monsterDamageRules(), this._stats);
        this._monsters.setDamageModule(this._monsterDamage).setEffects(this._effects);
        this._projectiles = new DoomProjectileSystem(built.getProjectileDefs(), this._effects, this._rng, this._decals, this._monsters, this._monsterDamage);
        this._projectiles.setFastMonsters(this._skillRule().fastMonsters);
        this._monsterAttack = new DoomMonsterAttack(this._monsters, this._monsterDamage, this._rng);
        this._monsters.setAttack(this._monsterAttack);
    }

    // The skill rule precedes the adds (InstantReaction), and the adds precede
    // the level data, which lights the bodies already added.
    _adoptMonsters(built, onLevelExit) {
        this._monsters = new DoomMonsterSystem();
        this._monsters.setSkillRule(this._skillRule());
        this._monsters.setRandom(this._rng);
        this._monsters.setNightmareFast(this._profile.nightmareFast());
        this._monsters.setMonsterSounds(this._profile.monsterSounds());
        for (const placement of built.getMonsterPlacements()) {
            this._monsters.add(placement);
        }
        this._registerInteractions(built);
        this._monsters.setDrops(this._registerDrops(built.getDropTemplates()));
        this._monsters.setCrushedCorpseView(built.getCrushedCorpseView());
        this._monsters.setSpawnables(built.getMonsterSpawnables());
        this._monsters.setLevelData(built.getMonsterLevelData()).setExitCallback(onLevelExit);
        if (built.getBossRules().length > 0) {
            this._monsters.setBossDeath(new DoomBossDeath(this._monsters, built.getBossRules(), onLevelExit));
        }
        if (built.getBossBrain() !== null) {
            this._monsters.setBossBrain(built.getBossBrain());
        }
    }

    _registerInteractions(built) {
        for (const teleport of built.getTeleports()) {
            loader.interactions().loadFromData(new DoomTeleportInteraction(teleport.code, teleport.destination, this._monsters, this));
        }
        if (built.getPushZones() !== null) {
            loader.interactions().loadFromData(new DoomSectorPushInteraction(built.getPushZones(), this._monsters));
        }
        if (built.getSecretZones() !== null) {
            loader.interactions().loadFromData(new DoomSecretInteraction(built.getSecretZones(), this._stats));
        }
        for (const pickup of built.getPickups()) {
            loader.interactions().loadFromData(new DoomPickupInteraction(pickup.code, pickup.effect, this._itemRules, this._stats, pickup.countsItem));
        }
    }

    // One pickup interaction per drop template; the catalog the monster system
    // spawns them from is keyed by DoomMonsterSystem.dropKey.
    _registerDrops(templates) {
        const catalog = {};
        for (const template of templates) {
            loader.interactions().loadFromData(new DoomPickupInteraction(template.code, template.effect, this._itemRules, this._stats));
            catalog[template.key] = template;
        }

        return catalog;
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
            player.setWeapon(new DoomPlayerWeapon(this._itemCatalog, this._profile.weaponFallbackOrder(), user, this._weaponSprites, this._rng)
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
            user.resetForNewLevel(this._itemCatalog);
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

    // --- Level services handed back by the world builder ---

    _adoptLevelServices(built) {
        this._level          = built;
        this._gunTriggers    = built.getGunTriggers();
        this._sectorDamage   = built.getSectorDamage();
        this._sectorLight    = built.getSectorLight();
        this._sectorSurfaces = built.getSectorSurfaces();
        this._terrain        = built.getTerrain();
        this._playerStarts   = built.getPlayerStarts();
        this._stats.setTotals(built.getSecretsTotal(), built.getKillsTotal(), built.getItemsTotal());
    }

    getLevelStats() {
        return this._stats;
    }

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
            automap:        this._level.getAutomap(),
            stats:          this._stats,
        };
    }
}

// Hurt Me Plenty: the vanilla default, and the fallback of an unknown skill.
DoomSimulation.DEFAULT_SKILL = 3;
// Buttons and impulse the game adds to the engine's in every UserCommand.
DoomSimulation.BUTTON_FIRE           = 'fire';
DoomSimulation.BUTTON_WEAPON_NEXT    = 'weaponNext';
DoomSimulation.BUTTON_WEAPON_PREV    = 'weaponPrev';
DoomSimulation.BUTTON_CHEAT_FULL_KIT = 'cheatFullKit';
DoomSimulation.IMPULSE_WEAPON_WHEEL  = 'weaponWheel';
