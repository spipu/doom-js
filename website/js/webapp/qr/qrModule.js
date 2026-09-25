/**
 * The vendored zxing-wasm library, prepared once for the page: its .wasm is redirected to
 * the local copy so that no CDN is ever contacted and QR codes work offline.
 */
class QrModule {
    /**
     * Starts loading the library; called once, before any QrEncoder or QrScanner use.
     *
     * @param {string} wasmUrl - URL of zxing_full.wasm
     * @returns {Promise<void>}
     */
    static prepare(wasmUrl) {
        if (QrModule._ready === null) {
            QrModule._ready = ZXingWASM.prepareZXingModule({
                overrides: {
                    locateFile: (path, prefix) => (path.endsWith('.wasm') ? wasmUrl : prefix + path)
                },
                fireImmediately: true
            });
            // A failed load (offline first visit…) must not sink every later use: the next prepare retries.
            QrModule._ready.catch(() => {
                QrModule._ready = null;
            });
        }
        return QrModule._ready;
    }

    /**
     * @returns {Promise<void>} settles once the library is loaded
     */
    static ready() {
        if (QrModule._ready === null) {
            throw new Error('QrModule.prepare must be called first');
        }
        return QrModule._ready;
    }
}

QrModule._ready = null;
