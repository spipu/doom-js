/**
 * The role of a device that follows another's game (a sub). It simulates
 * nothing: on each turn state the main sends, it applies it at once
 * (DoomReplicaApplier) and answers with its command for the next turn before
 * the next frame draws — sampled from what its devices collected since the
 * previous one, which the main ignores in screen sharing and gives to this
 * sub's player in cooperative. It holds one local player — the main's in
 * screen sharing, its own in cooperative —: the body the state poses and the
 * presentation views. It follows the main's level changes and mode changes,
 * and tells the game when the session ends.
 */
class DoomSubRole extends AbstractGameRole {
    /**
     * @param {DoomPlayerRoster}  roster
     * @param {DoomNetSubSession} session
     */
    constructor(roster, session) {
        super();

        this._roster         = roster;
        this._session        = session;
        this._stats          = new DoomLevelStats();
        this._codec          = new DoomNetCommandCodec(DoomSimulation.COMMAND_BUTTONS, DoomSimulation.COMMAND_IMPULSES);
        this._sampler        = null;    // the local player's, handed over on each frame
        this._builtLevel     = null;
        this._applier        = null;
        this._thingFilter    = null;
        this._waterEffects   = false;
        this._levelSeq       = null;    // the main's sequence number of the level being built
        this._lastStateAt    = null;
        this._notice         = new DoomSessionNotice();
        this._levelOver      = false;   // the main's tally or story text is shown
        this._localPaused    = false;
        this._playEvent      = null;
        this._onLevelLoad    = null;
        this._onPhase        = null;
        this._onModeChange   = null;
    }

    /**
     * @param {function(object)}      playEvent    - DoomPresentation.playTurnEvent
     * @param {function(object)}      onLevelLoad  - the main started a level: {levelCode, skill, thingFilter, waterEffects, mode, options}
     * @param {function(string|null)} onNotice     - the message to show over the game, null for none
     * @param {function(object)}      onPhase      - the main's tally or story text: its control message
     * @param {function(string)}      onEnd        - the session ended, with its DoomNetProtocol.END_* reason
     * @param {function}              onModeChange - the main switched the session to another mode
     */
    follow(playEvent, onLevelLoad, onNotice, onPhase, onEnd, onModeChange) {
        this._playEvent    = playEvent;
        this._onLevelLoad  = onLevelLoad;
        this._onPhase      = onPhase;
        this._notice.setOnNotice(onNotice);
        this._onModeChange = onModeChange;
        this._session.setCycle(this).setOnEnd(onEnd);

        return this;
    }

    // The main's thing filter and water sheets for the level it sent, and which
    // level it is. What the previous level said of the main (its pause, its death) is over.
    prepareLevel(level) {
        this._thingFilter  = level.thingFilter;
        this._waterEffects = (level.waterEffects === true);
        this._levelSeq     = level.seq;
        this._applier     = null;
        this._levelOver   = false;
        this._notice.clear();
        this._session.setLivenessSuspended(true);
    }

    // --- Role ---

    thingFilter() {
        return this._thingFilter;
    }

    waterEffects() {
        return this._waterEffects;
    }

    // A sub's pause only opens its own menu: the main's game goes on.
    pauseFreezes() {
        return false;
    }

    // The main's death is the main's: no death menu here.
    showsDeathMenu() {
        return false;
    }

    promptsRespawn() {
        return this._playsOwnPlayer();
    }

    getNotice() {
        return this._notice;
    }

    savesGame() {
        return false;
    }

    restartsLevel() {
        return false;
    }

    hostsSessions() {
        return false;
    }

    quitCode() {
        return ((this._playsOwnPlayer()) ? 'multiplayer.pause.leaveGame' : 'multiplayer.pause.leave');
    }

    // A playing sub has the main's pad; a viewer keeps the menu and the map.
    padControls() {
        return ((this._playsOwnPlayer()) ? DoomMainRole.PAD_CONTROLS : DoomSubRole.PAD_CONTROLS);
    }

    _playsOwnPlayer() {
        return DoomNetProtocol.subsPlayOwnPlayers(this._session.getMode());
    }

    // Its pause freezes nobody: its player stands still, commanded neutral.
    setLocalPaused(paused) {
        this._localPaused = paused;
    }

    // The profile only serves what a sub shows, bound by the game: nothing to simulate with.
    useProfile() {
        return this;
    }

    // The main's rules hold for the game: a sub simulates nothing.
    useRules() {
        return this;
    }

    adoptLevel(builtLevel) {
        this._builtLevel = builtLevel;
    }

    enterLevel(world) {
        this._roster.getLocal().enterLevel(world.getUser());
        this._stats.reset();
        this._applier = new DoomReplicaApplier(this._roster, this._builtLevel, this._stats, this._playEvent);
    }

    // The level is shown: the sub joins the turn cycle with the next state,
    // which also clears a message still shown from the previous level.
    levelStarted() {
        this._lastStateAt = null;
        this._session.setLivenessSuspended(false);
        this._session.sendControl({type: DoomNetProtocol.LEVEL_READY, seq: this._levelSeq});
    }

    getLevelStats() {
        return this._stats;
    }

    // The level clock is the main's: a sub shows the time the state carries.
    tickLevelClock() {
    }

    // Every frame draws: the state, not a turn, moves a sub's world.
    isTurnReady() {
        return true;
    }

    // Only the simulating device announces phases and resumes the turns.
    announcePhase() {
    }

    turnsResumed() {
    }

    /**
     * Nothing moves here but the automap reveal: the sampler keeps collecting
     * until the next state asks for the command. A state overdue for longer
     * than WAITING_NOTICE_MS with no word from the main names the main.
     */
    advance(dt, sampler, onPlayersMoved, now) {
        this._sampler = sampler;
        onPlayersMoved();
        this._notice.update(now);
        if ((this._lastStateAt === null) || this._notice.isMainPaused() || this._levelOver || this._notice.isWaiting()
            || ((now - this._lastStateAt) <= DoomNetTurnCycle.WAITING_NOTICE_MS)) {
            return;
        }
        this._notice.setWaiting([this._session.getHostNickname()]);
    }

    leave() {
        this._session.setCycle(null).leave();
    }

    // --- Session cycle ---

    levelLoad(message) {
        this._onLevelLoad(message);
    }

    // The viewed player and the pad follow the new mode, and so does the notice:
    // a player does not watch the main's death.
    modeChanged() {
        this._onModeChange();
        this._notice.setMainDead(false);
    }

    waiting(nicknames) {
        this._notice.setWaiting(nicknames);
    }

    // Another player left the game: it is named for a moment.
    playerRemoved(message) {
        this._notice.departed(message.nickname, performance.now());
    }

    playerAway(message) {
        this._notice.awayChanged(message.nickname, (message.away === true), performance.now());
    }

    // No state comes during a phase: a pause ends with the next state, the
    // level's end with the next level.
    phase(message) {
        if (message.type === DoomNetProtocol.PAUSE) {
            this._notice.pausedByMain();
            return;
        }
        this._levelOver = true;
        this._notice.setWaiting([]);
        this._onPhase(message);
    }

    // Decoded in full before anything is applied; the command leaves at once.
    state(buffer) {
        if (this._applier === null) {
            return;
        }
        let snapshot = null;
        try {
            snapshot = DoomNetStateCodec.decode(buffer);
        } catch (error) {
            console.error('DoomSubRole - invalid state message (' + buffer.byteLength + ' bytes): ' + error.message);
            this._session.endInvalid();
            return;
        }
        this._applier.apply(snapshot);
        // Sampled even when paused: what the menu took must not reach the game on resuming.
        const sampled = ((this._sampler !== null) ? this._sampler.sample() : null);
        const command = (((sampled === null) || this._localPaused) ? World.NEUTRAL_COMMAND : sampled);
        this._session.sendBinary(this._codec.encode(snapshot.turn + 1, command));
        this._lastStateAt = performance.now();
        this._notice.turnArrived(this._watchesMainDeath(snapshot));
    }

    // A viewer watches the main's death; a player sees its own.
    _watchesMainDeath(snapshot) {
        const main = snapshot.players.find((player) => (player.id === DoomPlayer.MAIN_ID));

        return (!this._playsOwnPlayer() && (main !== undefined) && main.dead);
    }
}

// A viewer's command is ignored by the main: its pad keeps the menu and the map only.
DoomSubRole.PAD_CONTROLS = {jump: false, crouch: false, action: false, run: false, fire: false, weaponNext: false, move: false, aim: false};
