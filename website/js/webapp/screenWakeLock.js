class ScreenWakeLock {
    /** @type {boolean} */                 isSupported;
    /** @type {WakeLockSentinel|null} */   wakeLock;

    constructor() {
        this.isSupported = ('wakeLock' in navigator);
        this.wakeLock = null;
    }

    init() {
        this.ask();
        document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
    }

    async ask() {
        if (!this.isSupported) {
            return;
        }
        try {
            this.wakeLock = await navigator.wakeLock.request("screen");
        } catch (err) {
            console.log(`Error on Wake Lock - ${err.name}, ${err.message}`);
        }
    }

    release() {
        if (this.wakeLock === null) {
            return;
        }

        let that = this;
        that.wakeLock.release().then(
            () => {
                that.wakeLock = null;
            }
        )
    }

    handleVisibilityChange() {
        if (this.wakeLock !== null && document.visibilityState === 'visible') {
            this.ask();
        }
    }
}
