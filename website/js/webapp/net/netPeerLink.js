/**
 * NetLink over one RTCPeerConnection with a single reliable, ordered data channel: control
 * and stream messages share it, so none can overtake another. Candidates are gathered in
 * full (with a short timeout for public address discovery) and travel inside the signal.
 */
class NetPeerLink extends NetLink {
    /** @type {RTCPeerConnection}   */ _peer;
    /** @type {RTCDataChannel|null} */ _channel;

    /**
     * @param {string[]} stunServers
     */
    constructor(stunServers = NetConfig.STUN_SERVERS) {
        super();

        this._channel = null;
        this._peer    = new RTCPeerConnection({iceServers: [{urls: stunServers}]});
        this._peer.addEventListener('connectionstatechange', () => this._onConnectionState());
        this._peer.addEventListener('datachannel', (event) => this._bindChannel(event.channel));
    }

    async createOffer() {
        this._bindChannel(this._peer.createDataChannel(NetConfig.CHANNEL_NAME, {ordered: true}));
        await this._peer.setLocalDescription(await this._peer.createOffer());
        return NetSignalCodec.encode(await this._gather());
    }

    async acceptOffer(offer) {
        await this._peer.setRemoteDescription(NetSignalCodec.decode(offer, 'offer'));
        await this._peer.setLocalDescription(NetPeerLink._passive(await this._peer.createAnswer()));
        return NetSignalCodec.encode(await this._gather());
    }

    async acceptAnswer(answer) {
        await this._peer.setRemoteDescription(NetSignalCodec.decode(answer, 'answer'));
    }

    /**
     * @returns {string[]} 'type address:port' of every local candidate put in the signal
     */
    getLocalCandidates() {
        const description = this._peer.localDescription;
        if (description === null) {
            return [];
        }
        return NetSignalCodec.candidatesOf(description.sdp).map(c => c.type + ' ' + c.address + ':' + c.port);
    }

    async describeRoute() {
        if (this.isClosed()) {
            return '';
        }
        const stats = await this._peer.getStats();
        const pair  = NetPeerLink._selectedPair(stats);
        if (pair === null) {
            return '';
        }
        const local  = stats.get(pair.localCandidateId);
        const remote = stats.get(pair.remoteCandidateId);
        return NetPeerLink._describeCandidate(local) + ' → ' + NetPeerLink._describeCandidate(remote) + ' (' + local.protocol + ')';
    }

    _send(message) {
        this._channel.send(message);
    }

    _closeTransport() {
        this._channel?.close();
        this._peer.close();
    }

    // The joining side's ICE checks succeed before the inviting side has read its answer: as
    // DTLS client it would send its first handshake to a peer that drops it, then wait for
    // the retransmission (3.3 s measured, against 50 to 200 ms as server).
    static _passive(answer) {
        return {type: answer.type, sdp: answer.sdp.replace(/a=setup:active/g, 'a=setup:passive')};
    }

    // Safari leaves the address out of its candidate stats.
    static _describeCandidate(candidate) {
        const address = candidate.address ?? candidate.ip ?? null;
        return candidate.candidateType + ((address !== null) ? ' ' + address + ':' + candidate.port : '');
    }

    // Chrome points to the pair from the transport report, Firefox flags the pair itself.
    static _selectedPair(stats) {
        let pair = null;
        stats.forEach((report) => {
            if ((report.type === 'transport') && report.selectedCandidatePairId) {
                pair = stats.get(report.selectedCandidatePairId);
            }
            if ((pair === null) && (report.type === 'candidate-pair') && (report.selected === true)) {
                pair = report;
            }
        });
        return pair;
    }

    _gather() {
        return new Promise((resolve, reject) => {
            const done = () => {
                clearTimeout(timer);
                this._peer.removeEventListener('icegatheringstatechange', onChange);
                this._peer.removeEventListener('signalingstatechange', onChange);
                if (this.isClosed() || (this._peer.localDescription === null)) {
                    reject(new NetError(NetError.LINK_LOST, 'Link closed while gathering its addresses'));
                    return;
                }
                resolve(this._peer.localDescription.sdp);
            };
            const onChange = () => {
                if ((this._peer.iceGatheringState === 'complete') || (this._peer.signalingState === 'closed')) {
                    done();
                }
            };
            const timer = setTimeout(done, NetConfig.GATHER_TIMEOUT_MS);
            this._peer.addEventListener('icegatheringstatechange', onChange);
            this._peer.addEventListener('signalingstatechange', onChange);
            onChange();
        });
    }

    _bindChannel(channel) {
        this._channel            = channel;
        this._channel.binaryType = 'arraybuffer';
        this._channel.addEventListener('open', () => this._notifyOpen());
        this._channel.addEventListener('message', (event) => this._notifyMessage(event.data));
        this._channel.addEventListener('close', () => this._notifyClose(NetLink.CLOSED));
    }

    _onConnectionState() {
        if (this._peer.connectionState === 'failed') {
            this._notifyClose(NetLink.FAILED);
        }
        if (this._peer.connectionState === 'closed') {
            this._notifyClose(NetLink.CLOSED);
        }
    }
}
