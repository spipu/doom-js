/**
 * What a device does with the game it shows — the contract DoomGame drives,
 * one implementation per kind of device: DoomMainRole simulates (alone, or as
 * the main of a session), DoomSubRole follows a main's game. DoomGame runs the
 * flow every device shares and asks its role, never which role it is. Every
 * method here is answered by both roles; what only the simulating device does
 * (hosting a session, saving) lives on DoomMainRole alone, behind the
 * hostsSessions() and savesGame() answers.
 */
class AbstractGameRole {
    /**
     * @returns {{multiplayer: boolean, deathmatch: boolean, monsters: boolean}} which map things the level is built with
     */
    thingFilter() {
        throw new Error('AbstractGameRole: thingFilter not implemented');
    }

    // Whether this device's pause stops the game, or only opens its menu.
    pauseFreezes() {
        throw new Error('AbstractGameRole: pauseFreezes not implemented');
    }

    // Whether this device opens the death menu over its dead player.
    showsDeathMenu() {
        throw new Error('AbstractGameRole: showsDeathMenu not implemented');
    }

    // Whether this device's dead player is told to press use to respawn.
    promptsRespawn() {
        throw new Error('AbstractGameRole: promptsRespawn not implemented');
    }

    /**
     * @returns {DoomSessionNotice|null} the message of the followed session, null when the game shows its own
     */
    getNotice() {
        throw new Error('AbstractGameRole: getNotice not implemented');
    }

    savesGame() {
        throw new Error('AbstractGameRole: savesGame not implemented');
    }

    hostsSessions() {
        throw new Error('AbstractGameRole: hostsSessions not implemented');
    }

    /**
     * @returns {string} the translation code of the pause entry that leaves the level
     */
    quitCode() {
        throw new Error('AbstractGameRole: quitCode not implemented');
    }

    /**
     * @returns {object} pad control → allowed, the targets this device plays with
     */
    padControls() {
        throw new Error('AbstractGameRole: padControls not implemented');
    }

    /**
     * @param {boolean} paused - this device's own menu is open over the game
     */
    setLocalPaused(paused) {
        throw new Error('AbstractGameRole: setLocalPaused not implemented');
    }

    /**
     * A phase without turns opens (pause, tally, story text).
     *
     * @param {object} message - the DoomNetProtocol control message of the phase
     */
    announcePhase(message) {
        throw new Error('AbstractGameRole: announcePhase not implemented');
    }

    /**
     * @param {number} now - performance.now() clock, when the turns run again
     */
    turnsResumed(now) {
        throw new Error('AbstractGameRole: turnsResumed not implemented');
    }

    // The game leaves the level for the menu.
    leave() {
        throw new Error('AbstractGameRole: leave not implemented');
    }

    /**
     * @param {AbstractGameProfile} profile
     * @param {DoomItemCatalog}     itemCatalog
     * @param {int}                 skill
     */
    useProfile(profile, itemCatalog, skill) {
        throw new Error('AbstractGameRole: useProfile not implemented');
    }

    /**
     * @param {DoomGameRules} rules - the game mode's, changed during the game
     */
    useRules(rules) {
        throw new Error('AbstractGameRole: useRules not implemented');
    }

    /**
     * Inside the loader batch, after the common build.
     *
     * @param {DoomBuiltLevel} builtLevel
     * @param {function}       onLevelExit - (secret) => void
     */
    adoptLevel(builtLevel, onLevelExit) {
        throw new Error('AbstractGameRole: adoptLevel not implemented');
    }

    /**
     * The level is loaded: the local player gets its body in it.
     *
     * @param {World}       world
     * @param {object|null} snapshot      - the save being restored
     * @param {object|null} spawnOverride - {position, yaw, pitch}, debug only
     */
    enterLevel(world, snapshot, spawnOverride) {
        throw new Error('AbstractGameRole: enterLevel not implemented');
    }

    /**
     * The level is shown.
     *
     * @param {object} level - {levelCode, skill, thingFilter}
     */
    levelStarted(level) {
        throw new Error('AbstractGameRole: levelStarted not implemented');
    }

    /**
     * @returns {DoomLevelStats} the counts this device shows, whoever fills them
     */
    getLevelStats() {
        throw new Error('AbstractGameRole: getLevelStats not implemented');
    }

    /**
     * @param {number}  timestamp
     * @param {boolean} counting - false on frozen frames
     */
    tickLevelClock(timestamp, counting) {
        throw new Error('AbstractGameRole: tickLevelClock not implemented');
    }

    /**
     * @param {number} now
     * @returns {boolean} whether the next turn may run on this frame
     */
    isTurnReady(now) {
        throw new Error('AbstractGameRole: isTurnReady not implemented');
    }

    /**
     * One live frame of the game.
     *
     * @param {number}              dt
     * @param {InputCommandSampler} sampler        - the local player's, collected up to this frame
     * @param {function}            onPlayersMoved - between the two halves of a tic
     * @param {number}              now
     */
    advance(dt, sampler, onPlayersMoved, now) {
        throw new Error('AbstractGameRole: advance not implemented');
    }
}
