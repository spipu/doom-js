/**
 * The role of the device that simulates the game — the only one in single
 * player, the main in a session. DoomGame runs the flow every device shares
 * and asks its role to move the world one turn each frame; this role owns the
 * simulation and everything only the simulating device does: the players
 * entering the level, the save restore and capture, the spawn override, the
 * level clock — and, while it hosts a session, the turn cycle of the subs
 * (DoomNetTurnCycle) and, in cooperative, their players: each one enters the
 * level with its first command and leaves it with its sub. A device that only
 * follows the game holds a DoomSubRole.
 */
class DoomMainRole {
    /**
     * @param {DoomPlayerRoster} roster
     * @param {DoomGameRules}    rules
     * @param {DoomTurnEvents}   events
     */
    constructor(roster, rules, events) {
        this._roster     = roster;
        this._rules      = rules;
        this._events     = events;
        this._simulation = new DoomSimulation(roster, rules, events);
        this._builtLevel = null;
        this._level      = null;   // {levelCode, skill, multiplayerThings} of the level shown
        this._cycle      = null;
        this._recorder   = null;   // DoomNetEvents listening to the turn events while hosting
    }

    spawnsMultiplayerThings() {
        return this._rules.spawnsMultiplayerThings();
    }

    pauseFreezes() {
        return true;
    }

    showsDeathMenu() {
        return true;
    }

    savesGame() {
        return true;
    }

    hostsSessions() {
        return true;
    }

    quitCode() {
        return 'game.pause.quit';
    }

    // The pad targets this device plays with (jump and crouch follow the settings).
    padControls() {
        return DoomMainRole.PAD_CONTROLS;
    }

    // --- Hosting ---

    /**
     * The subs of the session follow this device's game from now on.
     *
     * @param {DoomNetMainSession} session
     * @param {function(string[])} onWaiting - the nicknames waited for, none once the wait is over
     */
    startHosting(session, onWaiting) {
        this._cycle = new DoomNetTurnCycle(session).setOnWaiting(onWaiting).setOnPlayerGone((id) => this._removePlayer(id));
        this._hostLevel();
        session.setCycle(this._cycle);
    }

    // The subs' players leave with their session.
    stopHosting() {
        this._detachRecorder();
        this._cycle = null;
        for (const player of this._roster.getAll()) {
            if (player !== this._roster.getLocal()) {
                this._removePlayer(player.getId());
            }
        }
    }

    // A paused main freezes the whole game: nothing to hold back.
    setLocalPaused() {
    }

    // A phase without turns opens (a pause): the subs show it.
    announcePhase(message) {
        if (this._cycle !== null) {
            this._cycle.announcePhase(message);
        }
    }

    turnsResumed(now) {
        if (this._cycle !== null) {
            this._cycle.turnsResumed(now);
        }
    }

    // Nothing to leave: the main's session is stopped by the game.
    leave() {
    }

    // The level is shown: the subs build it too.
    levelStarted(level) {
        this._level = level;
        if (this._cycle !== null) {
            this._hostLevel();
        }
    }

    _hostLevel() {
        this._detachRecorder();
        this._recorder = new DoomNetEvents(this._builtLevel.getEntityIds(), this._roster);
        this._events.addListener(this._recorder.getListener());
        const capture = new DoomNetStateCapture(this._roster, this._builtLevel, this._simulation.getLevelStats(), this._recorder);
        this._cycle.levelStarted(this._level, capture, this._recorder);
    }

    _detachRecorder() {
        if (this._recorder !== null) {
            this._events.removeListener(this._recorder.getListener());
            this._recorder = null;
        }
    }

    // --- Level lifecycle ---

    useRules(rules) {
        this._rules = rules;
        this._simulation.useRules(rules);

        return this;
    }

    useProfile(profile, itemCatalog, skill) {
        this._simulation.useProfile(profile, itemCatalog).setSkill(skill);

        return this;
    }

    // Inside the loader batch the caller opened, after the common build.
    adoptLevel(builtLevel, onLevelExit) {
        this._builtLevel = builtLevel;
        this._simulation.adoptLevel(builtLevel, onLevelExit);
    }

    /**
     * The level's systems on the loaded world, then the main's player: it
     * takes the body the world definition built, with the save's state when
     * one is restored. The subs' players enter as their devices get ready.
     *
     * @param {World}       world
     * @param {object|null} snapshot      - the save being restored
     * @param {object|null} spawnOverride - {position, yaw, pitch}, debug only
     */
    enterLevel(world, snapshot, spawnOverride) {
        this._simulation.startLevel(world);
        this._simulation.addPlayer(this._roster.getLocal(), ((snapshot !== null) ? snapshot.player.state : null));
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

    // No turn before every awaited sub's command for it is in.
    isTurnReady(now) {
        return ((this._cycle === null) || this._cycle.isTurnReady(now));
    }

    /**
     * One turn: the local player's command sampled now, then the two halves
     * of the tic, then the state to the subs.
     *
     * @param {number}              dt
     * @param {InputCommandSampler} sampler        - the local player's, collected up to this frame
     * @param {function}            onPlayersMoved - between the halves, where vanilla's renderer marks the lines
     * @param {number}              now
     */
    advance(dt, sampler, onPlayersMoved, now) {
        const commands = new Map([[this._roster.getLocal().getId(), sampler.sample()]]);
        if ((this._cycle !== null) && this._rules.admitsSubPlayers()) {
            this._addSubCommands(commands);
        }
        this._simulation.tickPlayers(dt, commands);
        onPlayersMoved();
        this._simulation.tickWorld(dt, commands);
        if (this._cycle !== null) {
            this._cycle.sendState(dt, now);
        }
    }

    // A sub's player enters the level with its first command: on its slot's
    // start, with what it carried in, or the starting loadout on a drop-in.
    _addSubCommands(commands) {
        for (const [id, command] of this._cycle.commands()) {
            let player = this._roster.getById(id);
            if (player === null) {
                player = new DoomPlayer(id);
                this._roster.add(player);
            }
            if (!player.isInLevel()) {
                this._simulation.addPlayer(player, null);
            }
            commands.set(id, command);
        }
    }

    _removePlayer(id) {
        const player = this._roster.getById(id);
        if ((player === null) || (player === this._roster.getLocal())) {
            return;
        }
        if (player.isInLevel()) {
            this._simulation.removePlayer(player);
        }
        this._roster.remove(id);
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

// Given back on every level: the pad outlives a game, and a followed one withdrew them.
DoomMainRole.PAD_CONTROLS = {action: true, fire: true, weaponNext: true, move: true, aim: true};
