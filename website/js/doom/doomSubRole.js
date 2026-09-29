/**
 * The role of a device that follows another's game (a sub). It simulates
 * nothing: on each turn state the main sends, it applies it at once
 * (DoomReplicaApplier) and answers with its command for the next turn before
 * the next frame draws — sampled from what its devices collected since the
 * previous one, which the main ignores in screen sharing. It holds
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
        this._sampler           = null;    // the local player's, handed over on each frame
        this._neutralCommand    = new UserCommand();
        this._builtLevel        = null;
        this._applier           = null;
        this._multiplayerThings = false;
        this._levelSeq          = null;    // the main's sequence number of the level being built
        this._lastStateAt       = null;
        this._waitingFor        = [];      // nicknames the game waits for
        this._mainPaused        = false;
        this._mainDead          = false;
        this._levelOver         = false;   // the main's tally or story text is shown
        this._notice            = null;
        this._playEvent         = null;
        this._onLevelLoad       = null;
        this._onNotice          = null;
        this._onPhase           = null;
    }

    /**
     * @param {function(object)}      playEvent   - DoomPresentation.playTurnEvent
     * @param {function(object)}      onLevelLoad - the main started a level: {levelCode, skill, multiplayerThings}
     * @param {function(string|null)} onNotice    - the message to show over the game, null for none
     * @param {function(object)}      onPhase     - the main's tally or story text: its control message
     * @param {function(string)}      onEnd       - the session ended, with its DoomNetProtocol.END_* reason
     */
    follow(playEvent, onLevelLoad, onNotice, onPhase, onEnd) {
        this._playEvent   = playEvent;
        this._onLevelLoad = onLevelLoad;
        this._onNotice    = onNotice;
        this._onPhase     = onPhase;
        this._session.setCycle(this).setOnEnd(onEnd);

        return this;
    }

    // The main's thing filter for the level it sent, and which level it is.
    prepareLevel(level) {
        this._multiplayerThings = level.multiplayerThings;
        this._levelSeq          = level.seq;
        this._applier           = null;
        this._levelOver         = false;
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

    padControls() {
        return DoomSubRole.PAD_CONTROLS;
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
    // which also clears a message still shown from the previous level.
    levelStarted() {
        this._lastStateAt = null;
        this._session.setLivenessSuspended(false);
        this._session.sendControl({type: DoomNetProtocol.LEVEL_READY, seq: this._levelSeq});
    }

    getLevelStats() {
        return this._stats;
    }

    tickLevelClock() {
    }

    isTurnReady() {
        return true;
    }

    // Only the simulating device announces phases.
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
        if ((this._lastStateAt === null) || this._mainPaused || this._levelOver || (this._waitingFor.length > 0)
            || ((now - this._lastStateAt) <= DoomNetHost.WAITING_NOTICE_MS)) {
            return;
        }
        this._waitingFor = [this._session.getHostNickname()];
        this._refreshNotice();
    }

    leave() {
        this._session.setCycle(null).leave();
    }

    // --- Session cycle ---

    levelLoad(message) {
        this._onLevelLoad(message);
    }

    waiting(nicknames) {
        this._waitingFor = nicknames;
        this._refreshNotice();
    }

    // No state comes during a phase: a pause ends with the next state, the
    // level's end with the next level.
    phase(message) {
        this._waitingFor = [];
        if (message.type === DoomNetProtocol.PAUSE) {
            this._mainPaused = true;
            this._refreshNotice();
            return;
        }
        this._levelOver = true;
        this._refreshNotice();
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
            this._session.reportInvalid(error);
            return;
        }
        this._applier.apply(snapshot);
        const command = ((this._sampler !== null) ? this._sampler.sample() : this._neutralCommand);
        this._session.sendBinary(this._codec.encode(snapshot.turn + 1, command));
        this._lastStateAt = performance.now();
        this._waitingFor  = [];
        this._mainPaused  = false;
        this._mainDead    = this._roster.getLocal().getUser().isDead();
        this._refreshNotice();
    }

    // One message at a time: a wait first, then the main's pause, then its death.
    _refreshNotice() {
        const notice = this._noticeText();
        if (notice === this._notice) {
            return;
        }
        this._notice = notice;
        this._onNotice(notice);
    }

    _noticeText() {
        if (this._waitingFor.length > 0) {
            return appTranslator.get('multiplayer.waiting', {nickname: this._waitingFor.join(', ')});
        }
        if (this._mainPaused) {
            return appTranslator.get('multiplayer.pausedByMain');
        }
        if (this._mainDead) {
            return appTranslator.get('multiplayer.mainDead');
        }

        return null;
    }
}

// A viewer's command is empty: its pad keeps the menu and the map only.
DoomSubRole.PAD_CONTROLS = {jump: false, crouch: false, action: false, fire: false, weaponNext: false, move: false, aim: false};
