/**
 * Hands pairing codes between tabs of one browser, in place of a QR code and a camera:
 * the loopback counterpart of the code exchange, for development and automated tests.
 */
class NetLoopbackCodeChannel {
    /** @type {BroadcastChannel} */ _channel;
    /** @type {function|null}    */ _endRead;

    constructor() {
        this._channel = new BroadcastChannel(NetConfig.LOOPBACK_PREFIX + NetLoopbackCodeChannel.NAME);
        this._endRead = null;
    }

    /**
     * @param {Uint8Array} code
     */
    publish(code) {
        this._channel.postMessage(code);
    }

    /**
     * @param {function(Uint8Array): boolean} accept - false ignores a code, a throw ends the read with that error
     * @returns {Promise<Uint8Array|null>} the first code another tab publishes that passes `accept`, null once cancelled
     */
    read(accept) {
        this.cancelRead();
        return new Promise((resolve, reject) => {
            const onPost = (event) => {
                try {
                    if (accept(event.data)) {
                        this._endRead(event.data, null);
                    }
                } catch (error) {
                    this._endRead(null, error);
                }
            };
            this._endRead = (code, error) => {
                this._channel.removeEventListener('message', onPost);
                this._endRead = null;
                if (error !== null) {
                    reject(error);
                    return;
                }
                resolve(code);
            };
            this._channel.addEventListener('message', onPost);
        });
    }

    cancelRead() {
        this._endRead?.(null, null);
    }

    close() {
        this.cancelRead();
        this._channel.close();
    }
}

NetLoopbackCodeChannel.NAME = 'codes';
