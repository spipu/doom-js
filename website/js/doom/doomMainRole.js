/**
 * The role of the device that simulates the game — the only one in single
 * player, the main in a session. DoomGame runs the flow every device shares
 * and asks its role to move the world one turn each frame; this role owns the
 * simulation and everything only the simulating device does: the players
 * entering the level, the save restore and capture, the spawn override, the
 * level clock. A device that only displays the game gets a role of its own.
 */
class DoomMainRole {
    /**
     * @param {DoomPlayerRoster} roster
     * @param {DoomGameRules}    rules
     * @param {DoomTurnEvents}   events
     */
    constructor(roster, rules, events) {
        this._roster     = roster;
        this._simulation = new DoomSimulation(roster, rules, events);
    }

    // --- Level lifecycle ---

    useProfile(profile, itemCatalog, skill) {
        this._simulation.useProfile(profile, itemCatalog).setSkill(skill);

        return this;
    }

    // Inside the loader batch the caller opened, after the common build.
    adoptLevel(builtLevel, onLevelExit) {
        this._simulation.adoptLevel(builtLevel, onLevelExit);
    }

    /**
     * The level's systems on the loaded world, then every player, the main
     * first: it takes the body the world definition built. A save holds the
     * main's player alone.
     *
     * @param {World}       world
     * @param {object|null} snapshot      - the save being restored
     * @param {object|null} spawnOverride - {position, yaw, pitch}, debug only
     */
    enterLevel(world, snapshot, spawnOverride) {
        this._simulation.startLevel(world);
        for (const entering of this._roster.getAll()) {
            const restored = ((snapshot !== null) && (entering.getId() === DoomPlayer.MAIN_ID));
            this._simulation.addPlayer(entering, ((restored) ? snapshot.player.state : null));
        }
        if (spawnOverride !== null) {
            this._applySpawnOverride(spawnOverride);
        }
    }

    // Once the level is shown.
    restoreSnapshot(snapshot) {
        this._simulation.applySnapshot(this._roster.getLocal(), snapshot);
    }

    captureSnapshot(wadId, levelCode) {
        return this._simulation.captureSnapshot(this._roster.getLocal(), wadId, levelCode);
    }

    getLevelStats() {
        return this._simulation.getLevelStats();
    }

    tickLevelClock(timestamp, counting) {
        this._simulation.getLevelStats().tickLevelClock(timestamp, counting);
    }

    // --- Turn ---

    /**
     * One turn: the local player's command, then the two halves of the tic.
     *
     * @param {number}      dt
     * @param {UserCommand} command        - the local player's
     * @param {function}    onPlayersMoved - between the halves, where vanilla's renderer marks the lines
     */
    advance(dt, command, onPlayersMoved) {
        const commands = new Map([[this._roster.getLocal().getId(), command]]);
        this._simulation.tickPlayers(dt, commands);
        onPlayersMoved();
        this._simulation.tickWorld(dt, commands);
    }

    // The given Y is the floor-search ceiling, like the initial snap in
    // World.finalizeInit: the player drops onto the floor below it.
    _applySpawnOverride(spawnOverride) {
        const user     = this._roster.getLocal().getUser();
        const position = spawnOverride.position;
        user.x     = position[0];
        user.y     = position[1];
        user.z     = position[2];
        user.yaw   = spawnOverride.yaw;
        user.pitch = spawnOverride.pitch;
        user.syncPositionTracking();

        const floorY = this._simulation.getWorld().getCollision().getFloor(user.x, user.z, user.getRadius(), user.y);
        if (floorY !== -Infinity) {
            user.y = floorY;
        }
    }
}
