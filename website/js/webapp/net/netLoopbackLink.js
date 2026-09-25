/**
 * NetLink over a BroadcastChannel, between two tabs of one browser: development and
 * automated tests without cameras. The signals only carry the channel id. It proves the
 * protocol, never the network: no latency, loss nor fragmentation happens here.
 */
class NetLoopbackLink extends NetLink {
    /** @type {BroadcastChannel|null} */ _channel;

    constructor() {
        super();

        this._channel = null;
    }

    async createOffer() {
        const id = crypto.getRandomValues(new Uint8Array(NetLoopbackLink.ID_BYTES));
        this._listen(id);
        return id;
    }

    async acceptOffer(offer) {
        this._listen(offer);
        return offer;
    }

    async acceptAnswer(answer) {
        this._channel.postMessage({kind: NetLoopbackLink.OPEN});
        this._notifyOpen();
    }

    async describeRoute() {
        return 'loopback';
    }

    _send(message) {
        this._channel.postMessage({kind: NetLoopbackLink.DATA, data: message});
    }

    _closeTransport() {
        if (this._channel === null) {
            return;
        }
        this._channel.postMessage({kind: NetLoopbackLink.CLOSE});
        this._channel.close();
    }

    _listen(id) {
        this._channel = new BroadcastChannel(NetConfig.LOOPBACK_PREFIX + NetHex.fromBytes(id));
        this._channel.addEventListener('message', (event) => this._onPost(event.data));
    }

    _onPost(post) {
        if (post.kind === NetLoopbackLink.OPEN) {
            this._notifyOpen();
            return;
        }
        if (post.kind === NetLoopbackLink.DATA) {
            this._notifyMessage(post.data);
            return;
        }
        if (post.kind === NetLoopbackLink.CLOSE) {
            this._notifyClose(NetLink.CLOSED);
        }
    }
}

NetLoopbackLink.ID_BYTES = 8;
NetLoopbackLink.OPEN     = 'open';
NetLoopbackLink.DATA     = 'data';
NetLoopbackLink.CLOSE    = 'close';
