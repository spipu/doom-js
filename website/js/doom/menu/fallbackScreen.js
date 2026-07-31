/**
 * Degraded screen when IndexedDB is not available: no WAD can be stored,
 * the game cannot run.
 */
class FallbackScreen extends AbstractMenuScreen {
    _build() {
        this._addTitle('Spipu-Doom');
        this._statusEl = this._addElement('div', 'doom-menu-status');
        this._setError(appTranslator.get('menu.storageUnavailable'));
    }
}
