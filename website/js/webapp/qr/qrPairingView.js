/**
 * The view a NetPairing flow drives, over DOM elements the caller owns: the code shown as a
 * QR code, the other side's code read with the camera, each with its caption shown only
 * while its step lasts, and the camera released once the pairing is over. With a code
 * channel, codes are published and read through it instead, and the camera stays closed.
 * Captions come translated from the caller.
 */
class QrPairingView {
    /** @type {QrScanner}                   */ _scanner;
    /** @type {object}                      */ _elements;
    /** @type {object}                      */ _captions;
    /** @type {object|null}                 */ _codeChannel;
    /** @type {function|null}               */ _onCameraOpen;
    /** @type {function|null}               */ _onCameraClose;
    /** @type {function|null}               */ _onCodeShown;
    /** @type {function|null}               */ _onCodeRead;

    /**
     * @param {QrScanner} scanner
     * @param {{qr: HTMLElement, camera: HTMLVideoElement, qrCaption: HTMLElement, cameraCaption: HTMLElement}} elements
     * @param {{show: string, read: string}} captions    - under the code shown, under the camera while it reads
     * @param {{publish: function, read: function, cancelRead: function}|null} codeChannel - hands codes around in
     *                                           place of the QR code and the camera (NetLoopbackCodeChannel in tests)
     */
    constructor(scanner, elements, captions, codeChannel = null) {
        this._scanner       = scanner;
        this._elements      = elements;
        this._captions      = captions;
        this._codeChannel   = codeChannel;
        this._onCameraOpen  = null;
        this._onCameraClose = null;
        this._onCodeShown   = null;
        this._onCodeRead    = null;
    }

    /**
     * Clicking the code or the camera toggles it fullscreen (the caller styles QrPairingView.ZOOMED_CLASS).
     */
    enableZoom() {
        for (const element of [this._elements.qr, this._elements.camera]) {
            element.addEventListener('click', () => element.classList.toggle(QrPairingView.ZOOMED_CLASS));
        }
        return this;
    }

    async prepare() {
        if ((this._codeChannel !== null) || this._scanner.isOpen()) {
            return;
        }
        const start    = performance.now();
        const settings = await this._scanner.open(this._elements.camera);
        this._elements.camera.style.visibility = 'visible';
        this._onCameraOpen?.(settings, performance.now() - start);
    }

    async showCode(bytes, link) {
        const start = performance.now();
        const qr    = await QrEncoder.encode(bytes);
        this._elements.qr.replaceChildren(qr.svg);
        this._elements.qr.style.visibility   = 'visible';
        this._elements.qrCaption.textContent = this._captions.show;
        this._codeChannel?.publish(bytes);
        this._onCodeShown?.(bytes, qr.modules, performance.now() - start, link);
    }

    async readCode(accept) {
        if (this._codeChannel !== null) {
            const code = await this._codeChannel.read(accept);
            if (code !== null) {
                this._onCodeRead?.(null);
            }
            return code;
        }
        this._elements.cameraCaption.textContent = this._captions.read;
        const bytes = await this._scanner.scan(accept);
        this._elements.cameraCaption.textContent = '';
        this._unzoom(this._elements.camera);
        if (bytes !== null) {
            this._onCodeRead?.(this._scanner.getLastScanStats());
        }
        return bytes;
    }

    cancelRead() {
        this._codeChannel?.cancelRead();
        this._scanner.stopScan();
    }

    hideCode() {
        this._elements.qr.style.visibility   = 'hidden';
        this._elements.qrCaption.textContent = '';
        this._unzoom(this._elements.qr);
    }

    /**
     * The pairing is over: code hidden and camera released (the next prepare() opens it again).
     */
    finish() {
        this.hideCode();
        const stopped = this._scanner.close();
        this._elements.cameraCaption.textContent = '';
        this._elements.camera.style.visibility   = 'hidden';
        this._unzoom(this._elements.camera);
        if (this._codeChannel === null) {
            this._onCameraClose?.(stopped);
        }
    }

    /**
     * @param {function(MediaTrackSettings, number)} callback - settings, opening time in ms
     */
    setOnCameraOpen(callback) {
        this._onCameraOpen = callback;
        return this;
    }

    /**
     * @param {function(string[])} callback - state of each track stopped (QrScanner.close)
     */
    setOnCameraClose(callback) {
        this._onCameraClose = callback;
        return this;
    }

    /**
     * @param {function(Uint8Array, int, number, NetLink)} callback - code, QR modules, encoding time in ms, link
     */
    setOnCodeShown(callback) {
        this._onCodeShown = callback;
        return this;
    }

    /**
     * @param {function(object|null)} callback - the scan timings (QrScanner.getLastScanStats), null through a code channel
     */
    setOnCodeRead(callback) {
        this._onCodeRead = callback;
        return this;
    }

    _unzoom(element) {
        element.classList.remove(QrPairingView.ZOOMED_CLASS);
    }
}

QrPairingView.ZOOMED_CLASS = 'zoomed';
