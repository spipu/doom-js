/**
 * Base of the two sessions: the application version every pairing code is checked against,
 * the factory of the links (WebRTC in production, loopback in tests), and the wiring of a
 * new peer to the session's handlers.
 */
class NetSession {
    /** @type {string}   */ _version;
    /** @type {function} */ _linkFactory;

    /**
     * @param {string}             version     - application version, checked against every pairing code
     * @param {function():NetLink} linkFactory
     */
    constructor(version, linkFactory) {
        this._version     = version;
        this._linkFactory = linkFactory;
    }

    getVersion() {
        return this._version;
    }

    /**
     * @returns {NetPeer} a peer over a new link, its events routed to the _peer* handlers
     */
    _newPeer(id, link, payload) {
        return new NetPeer(id, link, payload)
            .setOnOpen((peer) => this._peerOpened(peer))
            .setOnControl((peer, message) => this._peerControl(peer, message))
            .setOnBinary((peer, buffer) => this._peerBinary(peer, buffer))
            .setOnLost((peer, reason, error) => this._peerLost(peer, reason, error));
    }

    _peerOpened(peer) {
        throw new Error('NetSession._peerOpened is abstract');
    }

    _peerControl(peer, message) {
        throw new Error('NetSession._peerControl is abstract');
    }

    _peerBinary(peer, buffer) {
        throw new Error('NetSession._peerBinary is abstract');
    }

    _peerLost(peer, reason, error) {
        throw new Error('NetSession._peerLost is abstract');
    }
}
