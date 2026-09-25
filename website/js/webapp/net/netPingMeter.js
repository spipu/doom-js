/**
 * Ping / pong control messages every second on one link, rolling average of the round
 * trip, and the liveness timeout: a side that receives nothing at all for the timeout
 * treats the link as lost. The timeout can be suspended (a level build keeps the thread
 * busy for longer than it), the pings keep going meanwhile.
 */
class NetPingMeter {
    /** @type {NetMessageCodec} */ _codec;
    /** @type {function|null}   */ _onLost;
    /** @type {number[]}        */ _samples;
    /** @type {number}          */ _lastReceived;
    /** @type {boolean}         */ _suspended;
    /** @type {int|null}        */ _timer;

    /**
     * @param {NetMessageCodec} codec
     */
    constructor(codec) {
        this._codec        = codec;
        this._onLost       = null;
        this._samples      = [];
        this._lastReceived = performance.now();
        this._suspended    = false;
        this._timer        = null;
    }

    start() {
        this.stop();
        this._lastReceived = performance.now();
        this._timer        = setInterval(() => this._tick(), NetConfig.PING_PERIOD_MS);
        return this;
    }

    stop() {
        if (this._timer !== null) {
            clearInterval(this._timer);
            this._timer = null;
        }
    }

    /**
     * Every message received, whatever its kind, proves the link alive.
     */
    noteReceived() {
        this._lastReceived = performance.now();
    }

    /**
     * @param {{type: string}} message
     * @returns {boolean} true when the message was a ping or a pong, consumed here
     */
    handle(message) {
        if (message.type === NetPingMeter.PING) {
            this._codec.sendControl({type: NetPingMeter.PONG, sent: message.sent});
            return true;
        }
        if (message.type === NetPingMeter.PONG) {
            this._samples.push(performance.now() - message.sent);
            if (this._samples.length > NetConfig.PING_AVERAGE_COUNT) {
                this._samples.shift();
            }
            return true;
        }
        return false;
    }

    /**
     * @returns {number|null} rolling average round trip in ms, null before the first pong
     */
    getPing() {
        if (this._samples.length === 0) {
            return null;
        }
        return this._samples.reduce((sum, sample) => sum + sample, 0) / this._samples.length;
    }

    setSuspended(suspended) {
        this._suspended    = suspended;
        this._lastReceived = performance.now();
        return this;
    }

    setOnLost(callback) {
        this._onLost = callback;
        return this;
    }

    _tick() {
        if (this._codec.getLink().isOpen()) {
            this._codec.sendControl({type: NetPingMeter.PING, sent: performance.now()});
        }
        if (this._suspended) {
            return;
        }
        if ((performance.now() - this._lastReceived) <= NetConfig.LIVENESS_TIMEOUT_MS) {
            return;
        }
        this.stop();
        this._onLost?.();
    }
}

NetPingMeter.PING = 'ping';
NetPingMeter.PONG = 'pong';
