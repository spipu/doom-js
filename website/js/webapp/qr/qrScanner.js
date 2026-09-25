/**
 * Camera stream and QR decode loop (QrModule prepared first). The camera is opened on its
 * own, before anything is scanned: a page holding the camera permission gets real host
 * addresses from WebRTC instead of mDNS names (RFC 8828), so pairing opens it before
 * creating its offer or answer.
 */
class QrScanner {
    /** @type {MediaStream|null}      */ _stream;
    /** @type {Promise|null}          */ _opening;
    /** @type {int}                   */ _generation;
    /** @type {HTMLVideoElement|null} */ _video;
    /** @type {HTMLCanvasElement}     */ _canvas;
    /** @type {int}                   */ _scanId;
    /** @type {object|null}           */ _lastStats;
    /** @type {int}                   */ _scanWidth;

    constructor() {
        this._stream     = null;
        this._opening    = null;
        this._generation = 0;
        this._video      = null;
        this._canvas     = document.createElement('canvas');
        this._scanId     = 0;
        this._lastStats  = null;
        this._scanWidth  = QrScanner.SCAN_MAX_WIDTH;
    }

    /**
     * Opens the camera (once, whatever the number of calls) and shows it in the video element.
     *
     * @param {HTMLVideoElement} video - preview element (playsinline, muted)
     * @returns {Promise<MediaTrackSettings>}
     */
    async open(video) {
        await QrModule.ready();
        if (this._stream === null) {
            await this._requestStream();
        }
        this._video           = video;
        this._video.srcObject = this._stream;
        await this._video.play();
        if (this._stream === null) {
            throw new Error('Camera closed while it was being opened');
        }
        return this._stream.getVideoTracks()[0].getSettings();
    }

    isOpen() {
        return (this._stream !== null);
    }

    /**
     * Decodes camera frames until a QR code passes the filter.
     *
     * @param {function(Uint8Array): boolean} accept - false rejects a code and keeps scanning
     * @returns {Promise<Uint8Array|null>} the accepted bytes, null when stopped before
     */
    scan(accept) {
        const scanId = this._scanId + 1;
        const start  = performance.now();
        const stats  = {waitingMs: 0, readMs: 0, frames: 0, decodeMs: 0, width: 0};
        let seen     = 0;
        this._scanId = scanId;
        return new Promise((resolve, reject) => {
            const tick = async () => {
                if (this._scanId !== scanId) {
                    resolve(null);
                    return;
                }
                const bytes = await this._decodeFrame(stats);
                if ((bytes !== null) && (seen === 0)) {
                    seen = performance.now();
                }
                if ((bytes !== null) && (bytes.length > 0) && accept(bytes)) {
                    stats.waitingMs = seen - start;
                    stats.readMs    = performance.now() - seen;
                    this._lastStats = stats;
                    this._scanId   += 1;
                    resolve(bytes);
                    return;
                }
                setTimeout(() => tick().catch(reject), QrScanner.SCAN_PERIOD_MS);
            };
            tick().catch(reject);
        });
    }

    /**
     * @returns {{waitingMs: number, readMs: number, frames: int, decodeMs: number, width: int}|null}
     *          timings of the last successful scan: waiting = until a code was first seen, read = from then on
     */
    getLastScanStats() {
        return this._lastStats;
    }

    stopScan() {
        this._scanId += 1;
    }

    /**
     * Stops the scan and the camera; a camera still being opened is stopped as soon as it arrives.
     *
     * @returns {string[]} the state of each track just stopped ('ended' expected), empty when not open
     */
    close() {
        this.stopScan();
        this._generation += 1;
        this._opening     = null;
        if (this._stream === null) {
            return [];
        }
        const tracks = this._stream.getTracks();
        tracks.forEach(track => track.stop());
        this._stream = null;
        if (this._video !== null) {
            this._video.pause();
            this._video.srcObject = null;
        }
        return tracks.map(track => track.kind + ' ' + track.readyState);
    }

    /**
     * @returns {string} id and tracks of the open stream, for diagnostics; empty when closed
     */
    describeStream() {
        if (this._stream === null) {
            return '';
        }
        return this._stream.id + ' [' + this._stream.getTracks().map(track => track.kind + ' ' + track.readyState).join(', ') + ']';
    }

    // A close during the request must stop the stream it brings back, or the camera stays on.
    _requestStream() {
        if (this._opening !== null) {
            return this._opening;
        }
        const generation = this._generation;
        const opening    = navigator.mediaDevices.getUserMedia(QrScanner.CONSTRAINTS)
            .then((stream) => {
                if (generation !== this._generation) {
                    stream.getTracks().forEach(track => track.stop());
                    throw new Error('Camera closed while it was being opened');
                }
                this._stream = stream;
            })
            .finally(() => {
                if (this._opening === opening) {
                    this._opening = null;
                }
            });
        this._opening = opening;
        return opening;
    }

    // Decoded at the widest size the device handles within its budget: a module of a code
    // filmed on a phone screen spans few pixels.
    async _decodeFrame(stats) {
        if ((this._video === null) || (this._video.videoWidth === 0)) {
            return null;
        }
        const scale = Math.min(1, this._scanWidth / this._video.videoWidth);
        const ctx   = this._canvas.getContext('2d', {willReadFrequently: true});
        this._canvas.width  = Math.round(this._video.videoWidth * scale);
        this._canvas.height = Math.round(this._video.videoHeight * scale);
        ctx.drawImage(this._video, 0, 0, this._canvas.width, this._canvas.height);
        const start    = performance.now();
        const results  = await ZXingWASM.readBarcodes(ctx.getImageData(0, 0, this._canvas.width, this._canvas.height), QrScanner.READER_OPTIONS);
        const decodeMs = performance.now() - start;
        this._adaptScanWidth(decodeMs);
        stats.decodeMs += decodeMs;
        stats.frames   += 1;
        stats.width     = this._canvas.width;
        if (results.length === 0) {
            return null;
        }
        const valid = results.find(result => result.isValid);
        return ((valid !== undefined) ? valid.bytes : new Uint8Array(0));
    }

    _adaptScanWidth(decodeMs) {
        if ((decodeMs <= QrScanner.DECODE_BUDGET_MS) || (this._scanWidth <= QrScanner.SCAN_MIN_WIDTH)) {
            return;
        }
        this._scanWidth = Math.max(QrScanner.SCAN_MIN_WIDTH, Math.round(this._scanWidth * QrScanner.SCAN_WIDTH_STEP));
    }
}

QrScanner.SCAN_PERIOD_MS   = 150;
QrScanner.SCAN_MAX_WIDTH   = 1280;
QrScanner.SCAN_MIN_WIDTH   = 480;
QrScanner.DECODE_BUDGET_MS = 40;
QrScanner.SCAN_WIDTH_STEP  = 0.75;
QrScanner.CONSTRAINTS      = {
    video: {facingMode: {ideal: 'environment'}, width: {ideal: 1280}, height: {ideal: 720}},
    audio: false
};
// returnErrors reports a code seen but not yet readable, which dates when it came into view.
QrScanner.READER_OPTIONS   = {formats: ['QRCode'], maxNumberOfSymbols: 1, tryHarder: true, returnErrors: true};
