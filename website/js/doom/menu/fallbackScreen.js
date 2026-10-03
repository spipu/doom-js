/**
 * Degraded screen when the storage cannot be opened: no WAD can be read, the
 * game cannot run until the cause shown here is gone.
 */
class FallbackScreen extends AbstractMenuScreen {
    constructor(navigator, display) {
        super(navigator, display);

        this._messageCode = FallbackScreen.UNAVAILABLE;
    }

    /**
     * @param {string} messageCode - translation code of the cause
     */
    setMessageCode(messageCode) {
        this._messageCode = messageCode;

        return this;
    }

    _build() {
        this._addTitle('Spipu-Doom');
        this._statusEl = this._addElement('div', 'doom-menu-status');
        this._setError(appTranslator.get(this._messageCode));
    }
}

FallbackScreen.UNAVAILABLE = 'menu.storageUnavailable';
FallbackScreen.BLOCKED     = 'menu.storageBlocked';
FallbackScreen.FULL        = 'menu.storageFull';
