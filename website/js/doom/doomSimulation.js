/**
 * The game world of one level and the rules that move it: the level built from
 * the WAD, its monsters, projectiles, hitscans and effects, the random
 * sequence, the level statistics it counts, the save snapshots, and the tic
 * that advances everything from one command per player. It runs on the main
 * alone, never reads a device and never draws: DoomMainRole feeds it, and
 * DoomPresentation shows what it builds and counts without knowing it.
 */
class DoomSimulation {
    /**
     * @param {DoomPlayerRoster} roster
     * @param {DoomGameRules}    rules
     * @param {DoomTurnEvents}   events - where every one-shot event of a turn goes
     */
    constructor(roster, rules, events) {
        this._roster      = roster;
        this._rules       = rules;
        this._events      = events;
        this._rng         = new DoomRandom();
        this._skill       = DoomSimulation.DEFAULT_SKILL;
        this._profile     = null;
        this._itemCatalog = null;
        this._itemRules   = null;
        this._skillTable  = null;
        this._world       = null;
        this._level       = null;   // the DoomBuiltLevel it adopted
        this._stats       = new DoomLevelStats();

        this._effects          = null;        // spawner of the sprite effects (puffs, explosions)
        this._hitscan          = null;
        this._projectiles      = null;
        this._decals           = null;        // spawner of the impact decals, null without decal graphics
        this._monsters         = null;
        this._monsterDamage    = null;
        this._monsterAttack    = null;
        this._sectorDamage     = null;
        this._gunTriggers      = null;        // shot-activated lines
        this._sectorSurfaces   = null;        // floor flats/specials rewritten by the "+change" floors
        this._terrain          = null;
        this._playerStarts     = {};          // slot → {x, y, z, yaw}, the map's player starts
        this._deathmatchStarts = [];          // {x, y, z, yaw}, the map's deathmatch starts
        this._bodies           = new Map();   // player id → DoomPlayerBody, while the subs play
        this._corpses          = [];          // DoomBodyView of the dead players' left bodies, oldest first
        this._deadMs           = new Map();   // player id → ms since its death
        this._itemRespawns     = null;        // DoomItemRespawnQueue of the level
        this._onLevelExit      = null;        // (secret) => void, what an exit line calls
        this._limitReached     = false;
    }

    // --- Profile and skill ---

    /**
     * @param {AbstractGameProfile} profile     - the WAD's, resolved by the game
     * @param {DoomItemCatalog}     itemCatalog - built on that profile, shared with the presentation
     */
    useProfile(profile, itemCatalog) {
        this._profile        = profile;
        this._itemCatalog    = itemCatalog;
        this._itemRules      = new DoomItemRules(profile, itemCatalog, this._roster, this._events).useRules(this._rules);
        this._skillTable     = profile.skillRules();
        this._itemRules.setAmmoFactor(this._skillRule().ammoFactor);

        return this;
    }

    /**
     * The mode changes during the game (cooperative opened or stopped): the
     * running level keeps the things it was built with.
     *
     * @param {DoomGameRules} rules
     */
    useRules(rules) {
        this._rules = rules;
        if (this._itemRules !== null) {
            this._itemRules.useRules(rules);
        }
        if (this._monsterDamage !== null) {
            this._monsterDamage.setFriendlyFire(rules.allowsFriendlyFire());
        }
        if (this._world !== null) {
            this._showPlayerBodies();
        }

        return this;
    }

    // The players' bodies exist while the subs play their own players.
    _showPlayerBodies() {
        for (const player of this._roster.getInLevel()) {
            if (this._rules.admitsSubPlayers()) {
                this._addBody(player);
            } else {
                this._removeBody(player);
            }
        }
    }

    _addBody(player) {
        const frames = this._level.getPlayerBodyFrames(DoomPlayerBody.kindOf(player.getId()));
        if (this._bodies.has(player.getId()) || (frames === null)) {
            return;
        }
        const body = new DoomPlayerBody(player, this._level.getPlayerBodyDef(), frames, this._level.getMonsterLevelData());
        this._bodies.set(player.getId(), body);
        this._level.getBodyViews().add(body.getView());
    }

    // G_PlayerReborn: the dead body stays where it fell, as a corpse in the
    // slot's colour the respawned player sees too, at most CORPSE_QUEUE of them.
    _leaveCorpse(player) {
        const body = (this._bodies.get(player.getId()) ?? null);
        if (body === null) {
            return;
        }
        const views  = this._level.getBodyViews();
        const view   = body.getView();
        const corpse = new DoomBodyView(view.getInstance(), view.getFrames(), DoomPlayerBody.corpseKindOf(player.getId()))
            .setFrame(view.getFrameKey(), view.isBright())
            .setFacing(view.getFacing())
            .setSector(view.getSector())
            .setRenderScale(view.getRenderScale());
        views.delete(view);
        views.add(corpse);
        this._bodies.delete(player.getId());
        this._corpses.push(corpse);
        if (this._corpses.length > DoomSimulation.CORPSE_QUEUE) {
            this._dropView(this._corpses.shift());
        }
    }

    _removeBody(player) {
        const body = (this._bodies.get(player.getId()) ?? null);
        if (body === null) {
            return;
        }
        this._dropView(body.getView());
        this._bodies.delete(player.getId());
    }

    _dropView(view) {
        loader.instances().scheduleRemoval(view.getInstance());
        this._level.getBodyViews().delete(view);
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
        this._onLevelExit = onLevelExit;
        this._stats.reset();
        this._adoptLevelServices(built);
        this._adoptMonsters(built, onLevelExit);
        this._effects       = new DoomEffectSpawner(built.getEffectTemplates(), this._rng, this._events);
        this._decals        = ((built.getDecalTemplates() !== null) ? new DoomDecalSpawner(built.getDecalTemplates(), this._rng, this._events) : null);
        this._monsterDamage = new DoomMonsterDamage(this._monsters, this._effects, this._rng, this._profile.monsterDamageRules(), this._stats);
        this._monsters.setDamageModule(this._monsterDamage).setEffects(this._effects).setTurnEvents(this._events);
        this._projectiles = new DoomProjectileSystem(built.getProjectileDefs(), built.getProjectileViews(), this._events, this._effects, this._rng, this._decals, this._monsters, this._monsterDamage);
        this._projectiles.setFastMonsters(this._skillRule().fastMonsters);
        this._monsterAttack = new DoomMonsterAttack(this._monsters, this._monsterDamage, this._rng);
        this._monsters.setAttack(this._monsterAttack);
    }

    // The skill rule (InstantReaction) and the body views precede the adds.
    _adoptMonsters(built, onLevelExit) {
        this._monsters = new DoomMonsterSystem();
        this._monsters.setSkillRule(this._skillRule());
        this._monsters.setRandom(this._rng);
        this._monsters.setNightmareFast(this._profile.nightmareFast());
        this._monsters.setMonsterSounds(this._profile.monsterSounds());
        this._monsters.setBodyViews(built.getBodyViews());
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
            loader.interactions().loadFromData(new DoomSecretInteraction(built.getSecretZones(), this._stats, this._events));
        }
        for (const pickup of built.getPickups()) {
            loader.interactions().loadFromData(new DoomPickupInteraction(pickup.code, pickup.effect, this._itemRules, this._stats, pickup.countsItem)
                .setOnRemoved((code) => this._itemRemoved(code)));
        }
    }

    // A map item taken comes back later when the rules respawn the items.
    _itemRemoved(code) {
        if (this._rules.respawnsItems()) {
            this._itemRespawns.taken(code);
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
        this._bodies       = new Map();
        this._corpses      = [];
        this._deadMs       = new Map();
        this._limitReached = false;
        this._itemRespawns = new DoomItemRespawnQueue(this._level.getPickups(), this._profile.itemRespawnRules(), this._effects, this._events);
        this._monsters.setWorld(world);
        this._monsterDamage.setWorld(world).setFriendlyFire(this._rules.allowsFriendlyFire());
        this._hitscan = new DoomHitscan(collision, this._effects, this._rng, this._decals, this._events, this._gunTriggers, this._monsters, this._monsterDamage);
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
        this._giveSpawnKeys(player.getUser());
        player.markLevelEntry();
        player.getUser().setUseProbeDistance(WadConstants.USE_RANGE * WadConstants.SCALE);
        this._arm(player);

        return this;
    }

    // The weapon controller that fires the player's equipment and, in
    // cooperative, the body the others see.
    _arm(player) {
        const user = player.getUser();
        if (user.getActiveWeapon() !== null) {
            player.setWeapon(new DoomPlayerWeapon(this._itemCatalog, this._profile.weaponFallbackOrder(), player.getWeaponView(), user, this._rng, this._events)
                .setAttackSystems(this._hitscan, this._projectiles)
                .setFireCallback(() => {
                    this._monsters.noiseAlert(user);
                    this._bodies.get(player.getId())?.fired();
                })
                .setFlashCallback(() => this._bodies.get(player.getId())?.flashed()));
        }
        if (this._rules.admitsSubPlayers()) {
            this._addBody(player);
        }
    }

    /**
     * Puts a body on a spot: the given Y is the floor-search ceiling, like the
     * initial snap in World.finalizeInit, the body drops onto the floor below it.
     *
     * @param {User}     user
     * @param {number[]} position - [x, y, z]
     * @param {number}   yaw
     * @param {number}   pitch
     */
    placeUser(user, position, yaw, pitch) {
        user.x     = position[0];
        user.y     = position[1];
        user.z     = position[2];
        user.yaw   = yaw;
        user.pitch = pitch;
        user.syncPositionTracking();

        const floorY = this._world.getCollision().getFloor(user.x, user.z, user.getRadius(), user.y);
        if (floorY !== -Infinity) {
            user.y = floorY;
        }
    }

    /**
     * Takes the player's body out of the running level (a sub gone): nothing
     * aims at it or hunts it any more.
     *
     * @param {DoomPlayer} player
     */
    removePlayer(player) {
        const user = player.getUser();
        this._removeBody(player);
        this._world.removeUser(user);
        this._monsters.forgetActor(user);
        this._projectiles.forgetActor(user);
        player.leaveLevel();

        return this;
    }

    // The main takes the body the world definition built on the player 1 start,
    // moved to a deathmatch start in deathmatch; any other player gets a new
    // one on its spawn spot.
    _bodyFor(player) {
        if (player.getId() === DoomPlayer.MAIN_ID) {
            const user = this._world.getUser();
            if (this._rules.spawnsAtDeathmatchStarts()) {
                const start = this._spawnSpot(player.getId());
                this.placeUser(user, [start.x, start.y, start.z], start.yaw, 0);
            }

            return user;
        }
        const start = this._spawnSpot(player.getId());
        const user  = loader.world().createUser([start.x, start.y, start.z], start.yaw);
        this._world.addUser(user);

        return user;
    }

    _spawnSpot(slot) {
        return ((this._rules.spawnsAtDeathmatchStarts()) ? this._deathmatchStart(slot) : this._freeStart(slot));
    }

    // G_DeathMatchSpawnPlayer: twenty random draws for a free deathmatch start,
    // then the player's own start (a map without any falls back on it too).
    _deathmatchStart(slot) {
        const radius = this._world.getUser().getRadius();
        if (this._deathmatchStarts.length > 0) {
            for (let tries = 0; tries < DoomSimulation.DEATHMATCH_SPAWN_TRIES; tries++) {
                const start = this._deathmatchStarts[this._rng.next() % this._deathmatchStarts.length];
                if (!this._monsters.isSpotOccupied(start.x, start.z, radius)) {
                    return start;
                }
            }
        }

        return this._freeStart(slot);
    }

    // P_SpawnPlayer gives every key in deathmatch.
    _giveSpawnKeys(user) {
        if (this._rules.givesAllKeys()) {
            this._itemRules.giveAllKeys(user);
        }
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
        user.setTurnEvents(this._events);
        user.setLandingSplash(((this._terrain !== null)
            ? ((x, y, z) => this._terrain.splashAt(x, y, z))
            : null));
    }

    getWorld() {
        return this._world;
    }

    // --- Level services handed back by the world builder ---

    _adoptLevelServices(built) {
        this._level            = built;
        this._gunTriggers      = built.getGunTriggers();
        this._sectorDamage     = built.getSectorDamage();
        this._sectorSurfaces   = built.getSectorSurfaces();
        this._terrain          = built.getTerrain();
        this._playerStarts     = built.getPlayerStarts();
        this._deathmatchStarts = built.getDeathmatchStarts();
        this._stats.setTotals(built.getSecretsTotal(), built.getKillsTotal(), built.getItemsTotal());
    }

    getLevelStats() {
        return this._stats;
    }

    getEffects() {
        return this._effects;
    }

    getTurnEvents() {
        return this._events;
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
            this._respawnOnUse(player, commands.get(player.getId()), dt);
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
        if (this._projectiles !== null) {
            this._projectiles.update(dt);
        }
        if (this._monsters !== null) {
            this._monsters.update(dt);
        }
        for (const [id, body] of this._bodies) {
            body.update(dt, (commands.get(id) ?? World.NEUTRAL_COMMAND));
        }
        this._itemRespawns.update(dt);
        this._stats.addMatchTime(dt);
        const timeLimit = this._rules.timeLimitMs();
        if ((timeLimit !== null) && (this._stats.getMatchTimeMs() >= timeLimit)) {
            this._endLevelOnLimit();
        }
    }

    // P_DeathThink: a dead player whose use is pressed once its death settled
    // is reborn (G_DoReborn in a netgame).
    _respawnOnUse(player, command, dt) {
        const user = player.getUser();
        if (!user.isDead()) {
            this._deadMs.delete(player.getId());
            return;
        }
        if (!this._deadMs.has(player.getId())) {
            this._creditDeath(player);
        }
        const deadMs = (this._deadMs.get(player.getId()) ?? 0) + dt;
        this._deadMs.set(player.getId(), deadMs);
        if (this._rules.respawnsDeadPlayers() && (deadMs >= WadConstants.DEATH_SETTLE_MS)
            && command.isJustPressed(UserCommand.ACTION, user.getLastCommand())) {
            this._respawn(player, command);
        }
    }

    // P_KillMobj: a player killed by another player is that one's frag, a
    // player killed by nothing is its own, one killed by a monster nobody's.
    _creditDeath(player) {
        const killer = player.getUser().getKiller();
        if (killer === null) {
            this._stats.addFrag(player.getId(), player.getId());
            return;
        }
        if (DoomActorRef.isPlayer(killer)) {
            this._stats.addFrag(killer.getPlayerId(), player.getId());
            this._checkFragLimit(killer.getPlayerId());
        }
    }

    // UZDoom P_KillMobj fraglimit: the killer reaching the limit ends the level.
    _checkFragLimit(playerId) {
        const limit = this._rules.fragLimit();
        if ((limit !== null) && (this._stats.fragScore(playerId) >= limit)) {
            this._endLevelOnLimit();
        }
    }

    // The level ends as through an exit line, once.
    _endLevelOnLimit() {
        if (this._limitReached) {
            return;
        }
        this._limitReached = true;
        this._onLevelExit(false);
    }

    // G_PlayerReborn + G_CheckSpot, in a teleport fog; the press that brought
    // it back uses nothing (usedown set on reborn).
    _respawn(player, command) {
        const user  = player.getUser();
        const start = this._spawnSpot(player.getId());
        this._leaveCorpse(player);
        user.revive(user.getMaxEnergy()).setLastCommand(command);
        this.placeUser(user, [start.x, start.y, start.z], start.yaw, 0);
        user.clearEquipment();
        this._itemRules.setupLoadout(user);
        this._giveSpawnKeys(user);
        player.enterLevel(user);
        this._arm(player);
        this._effects.spawnArrivalFog(user.x, user.y, user.z, WadGeometry.doomAngleYaw(user.yaw));
    }

    _commandedPlayers(commands) {
        return this._roster.getInLevel().filter((player) => commands.has(player.getId()));
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
// Dead players' bodies kept on the ground (G_PlayerReborn's bodyque, BODYQUESIZE).
DoomSimulation.CORPSE_QUEUE = 32;
// Random deathmatch starts tried for a free one before the player's own start (G_DeathMatchSpawnPlayer).
DoomSimulation.DEATHMATCH_SPAWN_TRIES = 20;
// Buttons and impulse the game adds to the engine's in every UserCommand.
DoomSimulation.BUTTON_FIRE           = 'fire';
DoomSimulation.BUTTON_WEAPON_NEXT    = 'weaponNext';
DoomSimulation.BUTTON_WEAPON_PREV    = 'weaponPrev';
DoomSimulation.BUTTON_CHEAT_FULL_KIT = 'cheatFullKit';
DoomSimulation.IMPULSE_WEAPON_WHEEL  = 'weaponWheel';
// Every button and impulse of a command, in the order its binary message carries them.
DoomSimulation.COMMAND_BUTTONS  = [UserCommand.JUMP, UserCommand.CROUCH, UserCommand.WALK_SLOW, UserCommand.ACTION,
    DoomSimulation.BUTTON_FIRE, DoomSimulation.BUTTON_WEAPON_NEXT, DoomSimulation.BUTTON_WEAPON_PREV, DoomSimulation.BUTTON_CHEAT_FULL_KIT];
DoomSimulation.COMMAND_IMPULSES = [DoomSimulation.IMPULSE_WEAPON_WHEEL];
