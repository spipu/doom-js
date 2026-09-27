let ScreenWakeLock_private = null;

/**
 * Keeps the screen awake while the page is shown (Screen Wake Lock API), one per page. The
 * system drops the lock when the page is hidden, and may refuse it (low power mode, low
 * battery): it is asked again whenever the page is shown again and, while it is not held, on
 * the next user gesture.
 */
class ScreenWakeLock {
    /** @type {boolean} */                 _isSupported;
    /** @type {boolean} */                 _wanted;
    /** @type {boolean} */                 _listening;
    /** @type {boolean} */                 _requesting;
    /** @type {boolean} */                 _errorLogged;
    /** @type {WakeLockSentinel|null} */   _sentinel;

    // Every game asks for the lock: they share this one.
    constructor() {
        if (ScreenWakeLock_private !== null) {
            return ScreenWakeLock_private;
        }
        ScreenWakeLock_private = this;

        this._isSupported = ('wakeLock' in navigator);
        this._wanted      = false;
        this._listening   = false;
        this._requesting  = false;
        this._errorLogged = false;
        this._sentinel    = null;
    }

    init() {
        this._wanted = true;
        this._listen();
        this._request();

        return this;
    }

    release() {
        this._wanted = false;
        if (this._sentinel !== null) {
            this._sentinel.release();
        }

        return this;
    }

    isHeld() {
        return (this._sentinel !== null);
    }

    _listen() {
        if (this._listening) {
            return;
        }
        this._listening = true;
        document.addEventListener('visibilitychange', () => this._request());
        for (const type of ScreenWakeLock.GESTURE_EVENTS) {
            document.addEventListener(type, () => this._request(), {capture: true, passive: true});
        }
    }

    async _request() {
        if (!this._isSupported || !this._wanted || this._requesting || (this._sentinel !== null)
            || (document.visibilityState !== 'visible')) {
            return;
        }
        this._requesting = true;
        try {
            const sentinel = await navigator.wakeLock.request('screen');
            sentinel.addEventListener('release', () => {
                if (this._sentinel === sentinel) {
                    this._sentinel = null;
                }
            });
            this._sentinel = sentinel;
        } catch (error) {
            // Retried on every gesture: logged once only.
            if (!this._errorLogged) {
                this._errorLogged = true;
                console.log(`Error on Wake Lock - ${error.name}, ${error.message}`);
            }
        } finally {
            this._requesting = false;
        }
    }
}

// The events that give a page user activation, which a browser may demand before granting the lock.
ScreenWakeLock.GESTURE_EVENTS = ['keydown', 'mousedown', 'pointerup', 'touchend'];
