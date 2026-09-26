/**
 * The role of a device that follows another's game (a sub). It simulates
 * nothing: on each turn state the main sends, it applies it at once
 * (DoomReplicaApplier) and answers with its command for the next turn before
 * the next frame draws — empty in screen sharing, an acknowledgement. It holds
 * one local player carrying the main's id: the body the state poses and the
 * presentation views. It follows the main's level changes and tells the game
 * when the session ends.
 */
class DoomSubRole {
    /**
     * @param {DoomPlayerRoster}  roster
     * @param {DoomNetSubSession} session
     */
    constructor(roster, session) {
        this._roster            = roster;
        this._session           = session;
        this._stats             = new DoomLevelStats();
        this._codec             = new DoomNetCommandCodec(DoomSimulation.COMMAND_BUTTONS, DoomSimulation.COMMAND_IMPULSES);
        this._command           = new UserCommand();
        this._builtLevel        = null;
        this._applier           = null;
        this._multiplayerThings = false;
        this._lastStateAt       = null;
        this._waitNotified      = false;
        this._playEvent         = null;
        this._onLevelLoad       = null;
        this._onWaiting         = null;
    }

    /**
     * @param {function(object)}   playEvent   - DoomPresentation.playTurnEvent
     * @param {function(object)}   onLevelLoad - the main started a level: {levelCode, skill, multiplayerThings}
     * @param {function(string[])} onWaiting   - the nicknames waited for, none once the wait is over
     * @param {function(string)}   onEnd       - the session ended, with its DoomNetProtocol.END_* reason
     */
    follow(playEvent, onLevelLoad, onWaiting, onEnd) {
        this._playEvent   = playEvent;
        this._onLevelLoad = onLevelLoad;
        this._onWaiting   = onWaiting;
        this._session.setCycle(this).setOnEnd(onEnd);

        return this;
    }

    // The main's thing filter for the level it sent.
    prepareLevel(level) {
        this._multiplayerThings = level.multiplayerThings;
        this._applier           = null;
        this._session.setLivenessSuspended(true);
    }

    // --- Role ---

    spawnsMultiplayerThings() {
        return this._multiplayerThings;
    }

    // A sub's pause only opens its own menu: the main's game goes on.
    pauseFreezes() {
        return false;
    }

    // The main's death is the main's: no death menu here.
    showsDeathMenu() {
        return false;
    }

    savesGame() {
        return false;
    }

    sharesScreen() {
        return false;
    }

    quitCode() {
        return 'multiplayer.pause.leave';
    }

    useProfile() {
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
    // which also clears a wait still shown from the previous level.
    levelStarted() {
        this._lastStateAt = null;
        this._session.setLivenessSuspended(false);
        this._session.sendControl({type: DoomNetProtocol.LEVEL_READY});
    }

    getLevelStats() {
        return this._stats;
    }

    tickLevelClock() {
    }

    isTurnReady() {
        return true;
    }

    /**
     * Nothing moves here but the automap reveal; a state overdue for longer
     * than WAITING_NOTICE_MS with no word from the main names the main.
     */
    advance(dt, command, onPlayersMoved, now) {
        onPlayersMoved();
        if ((this._lastStateAt === null) || this._waitNotified || ((now - this._lastStateAt) <= DoomNetHost.WAITING_NOTICE_MS)) {
            return;
        }
        this._waitNotified = true;
        this._onWaiting([this._session.getHostNickname()]);
    }

    leave() {
        this._session.setCycle(null).leave();
    }

    // --- Session cycle ---

    levelLoad(message) {
        this._onLevelLoad(message);
    }

    waiting(nicknames) {
        this._waitNotified = true;
        this._onWaiting(nicknames);
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
            this._session.reportInvalid(error);
            return;
        }
        this._applier.apply(snapshot);
        this._session.sendBinary(this._codec.encode(snapshot.turn + 1, this._command));
        this._lastStateAt = performance.now();
        if (this._waitNotified) {
            this._waitNotified = false;
            this._onWaiting([]);
        }
    }
}
