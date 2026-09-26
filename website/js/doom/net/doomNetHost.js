/**
 * The main's side of the synchronous turn cycle. A sub is first syncing: it
 * got the level to build and nobody waits for it; once it reports the level
 * built, the next state sent includes it, and from then on it is awaited —
 * no turn is simulated before its command for that turn is in. After each
 * simulated turn the state is captured and encoded once, and the same buffer
 * goes to every sub in the cycle. An awaited sub silent for COMMAND_TIMEOUT_MS
 * is removed; a longer wait than WAITING_NOTICE_MS names who it is waiting for.
 */
class DoomNetHost {
    /**
     * @param {DoomNetMainSession} session
     */
    constructor(session) {
        this._session   = session;
        this._subs      = new Map();   // peer id → {peer, phase, command, sentAt}
        this._turn      = 0;           // the next turn to simulate, counted over the session
        this._level     = null;        // {levelCode, skill, multiplayerThings}
        this._capture   = null;
        this._recorder  = null;
        this._codec     = new DoomNetCommandCodec(DoomSimulation.COMMAND_BUTTONS, DoomSimulation.COMMAND_IMPULSES);
        this._waitSince = null;
        this._waiting   = [];          // nicknames last announced as waited for
        this._onWaiting = null;
    }

    /**
     * @param {function(string[])} callback - the nicknames waited for, none once the wait is over
     */
    setOnWaiting(callback) {
        this._onWaiting = callback;

        return this;
    }

    /**
     * A level starts on the main: every sub goes back to syncing and builds it.
     *
     * @param {object}              level    - {levelCode, skill, multiplayerThings}
     * @param {DoomNetStateCapture} capture  - of that level
     * @param {DoomNetEvents}       recorder - listening to the turn events of that level
     */
    levelStarted(level, capture, recorder) {
        this._level    = level;
        this._capture  = capture;
        this._recorder = recorder;
        for (const sub of this._subs.values()) {
            this._sync(sub);
        }
    }

    // --- Session cycle ---

    admitted(peer) {
        const sub = {peer: peer, phase: DoomNetHost.SYNCING, command: null, sentAt: 0};
        this._subs.set(peer.getId(), sub);
        if (this._level !== null) {
            this._sync(sub);
        }
    }

    gone(peer) {
        this._subs.delete(peer.getId());
    }

    control(peer, message) {
        const sub = this._subs.get(peer.getId());
        if ((sub !== undefined) && (message.type === DoomNetProtocol.LEVEL_READY) && (sub.phase === DoomNetHost.SYNCING)) {
            sub.phase = DoomNetHost.JOINING;
            peer.setLivenessSuspended(false);
        }
    }

    // A command for another turn — the answer to a state sent before a level
    // change, still in flight — is dropped without fuss.
    binary(peer, buffer) {
        const sub = this._subs.get(peer.getId());
        if ((sub === undefined) || (sub.phase !== DoomNetHost.AWAITED)) {
            return;
        }
        let decoded = null;
        try {
            decoded = this._codec.decode(buffer);
        } catch (error) {
            peer.reportInvalid(error);
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
        const missing = [];
        for (const sub of this._subs.values()) {
            if ((sub.phase !== DoomNetHost.AWAITED) || (sub.command !== null)) {
                continue;
            }
            if ((now - sub.sentAt) > DoomNetHost.COMMAND_TIMEOUT_MS) {
                this._session.remove(sub.peer.getId());
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
        if ((now - this._waitSince) > DoomNetHost.WAITING_NOTICE_MS) {
            this._announce(missing);
        }

        return false;
    }

    /**
     * After the turn is simulated: the state goes to every sub in the cycle,
     * a joining one included, which is awaited from the next turn on.
     *
     * @param {number} elapsedMs - the time step of the turn
     */
    sendState(elapsedMs, now) {
        const receivers = Array.from(this._subs.values()).filter((sub) => (sub.phase !== DoomNetHost.SYNCING));
        if (receivers.length === 0) {
            this._recorder.drain();
            this._turn++;
            return;
        }
        const buffer = DoomNetStateCodec.encode(this._capture.capture(this._turn, elapsedMs));
        this._turn++;
        for (const sub of receivers) {
            sub.peer.sendBinary(buffer);
            sub.phase   = DoomNetHost.AWAITED;
            sub.command = null;
            sub.sentAt  = now;
        }
    }

    _sync(sub) {
        sub.phase   = DoomNetHost.SYNCING;
        sub.command = null;
        sub.peer.setLivenessSuspended(true);
        sub.peer.sendControl(Object.assign({type: DoomNetProtocol.LEVEL_LOAD}, this._level));
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
            if ((sub.phase === DoomNetHost.AWAITED) && (sub.command !== null)) {
                sub.peer.sendControl({type: DoomNetProtocol.WAITING, nicknames: nicknames});
            }
        }
    }
}

DoomNetHost.SYNCING = 'syncing';   // building the level, nobody waits for it
DoomNetHost.JOINING = 'joining';   // level built, joins with the next state sent
DoomNetHost.AWAITED = 'awaited';   // its command gates every turn

DoomNetHost.COMMAND_TIMEOUT_MS = 5000;
DoomNetHost.WAITING_NOTICE_MS  = 500;
