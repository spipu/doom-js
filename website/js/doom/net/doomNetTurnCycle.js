/**
 * The main's side of the synchronous turn cycle. A sub is first syncing: it
 * got the level to build and nobody waits for it; once it reports the level
 * built, the next state sent includes it, and from then on it is awaited —
 * no turn is simulated before its command for that turn is in. After each
 * simulated turn the state is captured and encoded once, and the same buffer
 * goes to every sub in the cycle. An awaited sub silent for COMMAND_TIMEOUT_MS
 * is removed; a longer wait than WAITING_NOTICE_MS names who it is waiting for.
 * When the rules hold the level start, no turn runs either until every sub
 * there before the level's first turn has built it, or has gone; one still
 * building after BUILD_TIMEOUT_MS is removed. A sub whose page is away is
 * neither awaited nor sent states, its player standing still, until it comes
 * back — joining again with the next state — or stays away past AWAY_TIMEOUT_MS.
 */
class DoomNetTurnCycle {
    /**
     * @param {DoomNetMainSession} session
     */
    constructor(session) {
        this._session   = session;
        this._subs      = new Map();   // peer id → {peer, playerId, phase, command, sentAt, awaySince}
        this._turn      = 0;           // the next turn to simulate, counted over the session
        this._level     = null;        // {levelCode, skill, thingFilter}
        this._levelSeq  = 0;           // counts the levels started, echoed by a sub's levelReady
        this._capture   = null;
        this._recorder  = null;
        this._codec     = new DoomNetCommandCodec(DoomSimulation.COMMAND_BUTTONS, DoomSimulation.COMMAND_IMPULSES);
        this._waitSince = null;
        this._waiting   = [];          // nicknames last announced as waited for
        this._phase     = null;        // control message of the phase without turns under way
        this._holdStart = false;       // the rules hold each level start for the subs already there
        this._held      = new Set();   // peer ids of the subs the current level start waits for
        this._holdSince = null;        // when the current level start began waiting for them
        this._levelTurn = 0;           // turns simulated since the level started
        this._onWaiting = null;
        this._onGone    = null;
    }

    /**
     * @param {function(string[])} callback - the nicknames waited for, none once the wait is over
     */
    setOnWaiting(callback) {
        this._onWaiting = callback;

        return this;
    }

    setHoldsLevelStart(hold) {
        this._holdStart = (hold === true);

        return this;
    }

    /**
     * @param {function(int, boolean)} callback - the player id of a sub that left the session, and whether its seat is kept
     */
    setOnPlayerGone(callback) {
        this._onGone = callback;

        return this;
    }

    /**
     * A level starts on the main: every sub goes back to syncing and builds it.
     *
     * @param {object}              level    - {levelCode, skill, thingFilter}
     * @param {DoomNetStateCapture} capture  - of that level
     * @param {DoomNetEvents}       recorder - listening to the turn events of that level
     */
    levelStarted(level, capture, recorder) {
        this._level     = level;
        this._levelSeq++;
        this._capture   = capture;
        this._recorder  = recorder;
        this._phase     = null;
        this._held      = new Set();
        this._holdSince = null;
        this._levelTurn = 0;
        for (const sub of this._subs.values()) {
            this._sync(sub);
        }
    }

    /**
     * No turn runs until turnsResumed (a pause): every sub in the cycle is told,
     * and a sub joining meanwhile is told as soon as its level is built.
     *
     * @param {object} message - the control message of the phase
     */
    announcePhase(message) {
        this._phase = message;
        for (const sub of this._subs.values()) {
            if (sub.phase !== DoomNetTurnCycle.SYNCING) {
                sub.peer.sendControl(message);
            }
        }
    }

    // The time spent in a phase counts neither toward the timeouts nor the waiting notice.
    turnsResumed(now) {
        this._phase     = null;
        this._waitSince = null;
        this._holdSince = null;
        for (const sub of this._subs.values()) {
            sub.sentAt = now;
        }
    }

    // --- Session cycle ---

    admitted(peer) {
        const sub = {
            peer: peer, playerId: this._session.playerIdOf(peer), phase: DoomNetTurnCycle.SYNCING, command: null, sentAt: 0, awaySince: null
        };
        this._subs.set(peer.getId(), sub);
        if (this._level !== null) {
            this._sync(sub);
        }
    }

    gone(peer, keepsSeat) {
        const sub = this._subs.get(peer.getId());
        this._subs.delete(peer.getId());
        if ((sub !== undefined) && (this._onGone !== null)) {
            this._onGone(sub.playerId, (keepsSeat === true));
        }
    }

    // Back from away, a sub that had the level built joins again with the next
    // state; one still building goes on building, its liveness still suspended.
    awayChanged(peer, away) {
        const sub = (this._subs.get(peer.getId()) ?? null);
        if (sub === null) {
            return;
        }
        sub.command = null;
        if (away) {
            sub.awaySince = performance.now();
            peer.setLivenessSuspended(true);
            return;
        }
        sub.awaySince = null;
        if (sub.phase !== DoomNetTurnCycle.SYNCING) {
            sub.phase = DoomNetTurnCycle.JOINING;
        }
        peer.setLivenessSuspended(sub.phase === DoomNetTurnCycle.SYNCING);
    }

    // A levelReady for an earlier level (two levels sent while the sub built
    // the first) is not the answer to the current one: the sub is still building.
    control(peer, message) {
        const sub = this._subs.get(peer.getId());
        if ((sub !== undefined) && (message.type === DoomNetProtocol.LEVEL_READY) && (sub.phase === DoomNetTurnCycle.SYNCING)
            && (message.seq === this._levelSeq)) {
            sub.phase = DoomNetTurnCycle.JOINING;
            peer.setLivenessSuspended(false);
            if (this._phase !== null) {
                peer.sendControl(this._phase);
            }
        }
    }

    // A command for another turn — the answer to a state sent before a level
    // change, still in flight — is dropped without fuss.
    binary(peer, buffer) {
        const sub = this._subs.get(peer.getId());
        if ((sub === undefined) || (sub.phase !== DoomNetTurnCycle.AWAITED) || DoomNetTurnCycle._isAway(sub)) {
            return;
        }
        let decoded = null;
        try {
            decoded = this._codec.decode(buffer);
        } catch (error) {
            console.error('DoomNetTurnCycle - invalid command message (' + buffer.byteLength + ' bytes): ' + error.message);
            this._session.remove(peer.getId(), DoomNetProtocol.END_INVALID);
            return;
        }
        if (decoded.turn === this._turn) {
            sub.command = decoded.command;
        }
    }

    // --- Turn ---

    /**
     * Whether every awaited sub's command for the next turn is in. A sub silent
     * past the timeout is removed here, and the wait is announced past its delay.
     */
    isTurnReady(now) {
        const missing = this._heldNicknames(now);
        for (const sub of this._subs.values()) {
            if (DoomNetTurnCycle._isAway(sub)) {
                this._checkAway(sub, now);
                continue;
            }
            if ((sub.phase !== DoomNetTurnCycle.AWAITED) || (sub.command !== null)) {
                continue;
            }
            if ((now - sub.sentAt) > DoomNetTurnCycle.COMMAND_TIMEOUT_MS) {
                this._session.remove(sub.peer.getId(), DoomNetProtocol.END_TIMEOUT);
                continue;
            }
            missing.push(this._session.nicknameOf(sub.peer));
        }
        if (missing.length === 0) {
            this._waitSince = null;
            this._announce([]);
            return true;
        }
        this._waitSince = (this._waitSince ?? now);
        if ((now - this._waitSince) > DoomNetTurnCycle.WAITING_NOTICE_MS) {
            this._announce(missing);
        }

        return false;
    }

    /**
     * @returns {Map<int, UserCommand>} each awaited sub's command for the turn, by player id — all in once the turn is ready
     */
    commands() {
        const commands = new Map();
        for (const sub of this._subs.values()) {
            if ((sub.phase === DoomNetTurnCycle.AWAITED) && (sub.command !== null) && !DoomNetTurnCycle._isAway(sub)) {
                commands.set(sub.playerId, sub.command);
            }
        }

        return commands;
    }

    /**
     * After the turn is simulated: the state goes to every sub in the cycle,
     * a joining one included, which is awaited from the next turn on.
     *
     * @param {number} elapsedMs - the time step of the turn
     */
    sendState(elapsedMs, now) {
        const receivers = Array.from(this._subs.values())
            .filter((sub) => ((sub.phase !== DoomNetTurnCycle.SYNCING) && !DoomNetTurnCycle._isAway(sub)));
        this._levelTurn++;
        if (receivers.length === 0) {
            this._recorder.drain();
            this._turn++;
            return;
        }
        const buffer = DoomNetStateCodec.encode(this._capture.capture(this._turn, elapsedMs));
        this._turn++;
        for (const sub of receivers) {
            sub.peer.sendBinary(buffer);
            sub.phase   = DoomNetTurnCycle.AWAITED;
            sub.command = null;
            sub.sentAt  = now;
        }
    }

    // The subs the level start still waits for: building it, still in the session.
    _heldNicknames(now) {
        this._pruneHeld();
        if (this._held.size === 0) {
            this._holdSince = null;
            return [];
        }
        this._holdSince = (this._holdSince ?? now);
        if ((now - this._holdSince) > DoomNetTurnCycle.BUILD_TIMEOUT_MS) {
            const stuck = [...this._held];
            this._held.clear();
            for (const id of stuck) {
                this._session.remove(id, DoomNetProtocol.END_TIMEOUT);
            }
            return [];
        }

        return [...this._held].map((id) => this._session.nicknameOf(this._subs.get(id).peer));
    }

    // An away sub holds nobody: it may be gone for good.
    _pruneHeld() {
        for (const id of this._held) {
            const sub = (this._subs.get(id) ?? null);
            if ((sub === null) || (sub.phase !== DoomNetTurnCycle.SYNCING) || DoomNetTurnCycle._isAway(sub)) {
                this._held.delete(id);
            }
        }
    }

    _checkAway(sub, now) {
        if ((now - sub.awaySince) > DoomNetTurnCycle.AWAY_TIMEOUT_MS) {
            this._session.remove(sub.peer.getId(), DoomNetProtocol.END_TIMEOUT);
        }
    }

    static _isAway(sub) {
        return (sub.awaySince !== null);
    }

    // A sub building the level before its first turn holds that turn, when the rules say so.
    _sync(sub) {
        if (this._holdStart && (this._levelTurn === 0)) {
            this._held.add(sub.peer.getId());
        }
        sub.phase   = DoomNetTurnCycle.SYNCING;
        sub.command = null;
        sub.peer.setLivenessSuspended(true);
        sub.peer.sendControl(Object.assign({type: DoomNetProtocol.LEVEL_LOAD, seq: this._levelSeq}, this._level,
            {mode: this._session.getMode(), options: this._session.getOptions()}));
    }

    // The main shows it, the subs not waited for show it too.
    _announce(nicknames) {
        if (nicknames.join() === this._waiting.join()) {
            return;
        }
        this._waiting = nicknames;
        if (this._onWaiting !== null) {
            this._onWaiting(nicknames);
        }
        for (const sub of this._subs.values()) {
            if ((sub.phase === DoomNetTurnCycle.AWAITED) && (sub.command !== null)) {
                sub.peer.sendControl({type: DoomNetProtocol.WAITING, nicknames: nicknames});
            }
        }
    }
}

DoomNetTurnCycle.SYNCING = 'syncing';   // building the level, nobody waits for it
DoomNetTurnCycle.JOINING = 'joining';   // level built, joins with the next state sent
DoomNetTurnCycle.AWAITED = 'awaited';   // its command gates every turn

DoomNetTurnCycle.COMMAND_TIMEOUT_MS = 5000;
DoomNetTurnCycle.WAITING_NOTICE_MS  = 500;
// Far beyond the build of the largest map on a slow device: only a build that never ends is caught.
DoomNetTurnCycle.BUILD_TIMEOUT_MS   = 60000;
// The WebRTC link hardly outlives a suspended page by more (ICE consent lapses after about 30 s).
DoomNetTurnCycle.AWAY_TIMEOUT_MS    = 60000;
