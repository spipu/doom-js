/**
 * The one message a session shows over the game, by priority: the players
 * the game waits for, then the host's pause, then a player who just left (for
 * DEPARTURE_MS), then the host's death. Each device keeps its own: the main
 * shows who it waits for and who left, a sub everything the main tells it.
 */
class DoomSessionNotice {
    constructor() {
        this._waiting    = [];      // nicknames the game waits for
        this._mainPaused = false;
        this._mainDead   = false;
        this._departure  = null;    // {nickname, until} of the player who left last
        this._shown      = null;
        this._onNotice   = null;
    }

    /**
     * @param {function(string|null)} callback - the message to show, null for none
     */
    setOnNotice(callback) {
        this._onNotice = callback;

        return this;
    }

    setWaiting(nicknames) {
        this._waiting = nicknames;
        this._refresh();
    }

    isWaiting() {
        return (this._waiting.length > 0);
    }

    // The host paused: it waits for nobody meanwhile.
    pausedByMain() {
        this._waiting    = [];
        this._mainPaused = true;
        this._refresh();
    }

    // A turn state came: the wait and the host's pause are over.
    turnArrived(mainDead) {
        this._waiting    = [];
        this._mainPaused = false;
        this._mainDead   = mainDead;
        this._refresh();
    }

    isMainPaused() {
        return this._mainPaused;
    }

    setMainDead(dead) {
        this._mainDead = dead;
        this._refresh();
    }

    /**
     * @param {string} nickname
     * @param {number} now      - performance.now() clock
     */
    departed(nickname, now) {
        this._departure = {nickname: nickname, until: now + DoomSessionNotice.DEPARTURE_MS};
        this._refresh();
    }

    // Called every frame: a departure message runs out.
    update(now) {
        if ((this._departure !== null) && (now >= this._departure.until)) {
            this._departure = null;
            this._refresh();
        }
    }

    // What was said of the previous level is over.
    clear() {
        this._waiting    = [];
        this._mainPaused = false;
        this._mainDead   = false;
        this._departure  = null;
        this._refresh();
    }

    _refresh() {
        const text = this._text();
        if ((text === this._shown) || (this._onNotice === null)) {
            return;
        }
        this._shown = text;
        this._onNotice(text);
    }

    _text() {
        if (this._waiting.length > 0) {
            return appTranslator.get('multiplayer.waiting', {nickname: this._waiting.join(', ')});
        }
        if (this._mainPaused) {
            return appTranslator.get('multiplayer.pausedByMain');
        }
        if (this._departure !== null) {
            return appTranslator.get('multiplayer.playerLeft', {nickname: this._departure.nickname});
        }
        if (this._mainDead) {
            return appTranslator.get('multiplayer.mainDead');
        }

        return null;
    }
}

DoomSessionNotice.DEPARTURE_MS = 3000;
