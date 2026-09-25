class ScreenWakeLock {
    /** @type {boolean} */                 _isSupported;
    /** @type {WakeLockSentinel|null} */   _wakeLock;

    constructor() {
        this._isSupported = ('wakeLock' in navigator);
        this._wakeLock = null;
    }

    init() {
        this._requestLock();
        document.addEventListener('visibilitychange', this._handleVisibilityChange.bind(this));
    }

    async _requestLock() {
        if (!this._isSupported) {
            return;
        }
        try {
            this._wakeLock = await navigator.wakeLock.request("screen");
        } catch (err) {
            console.log(`Error on Wake Lock - ${err.name}, ${err.message}`);
        }
    }

    release() {
        if (this._wakeLock === null) {
            return;
        }

        let that = this;
        that._wakeLock.release().then(
            () => {
                that._wakeLock = null;
            }
        )
    }

    _handleVisibilityChange() {
        if ((this._wakeLock !== null) && (document.visibilityState === 'visible')) {
            this._requestLock();
        }
    }
}
