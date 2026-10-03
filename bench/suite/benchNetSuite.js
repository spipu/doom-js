/**
 * The pure network layer the replica suite never reaches: compact signal,
 * pairing envelope, chunked messages, reachability verdicts and lobby seats.
 */
const {BenchFingerprint} = require('../lib/benchFingerprint');

class BenchNetSuite {
    static get name() {
        return 'net';
    }

    /**
     * @param {BenchContext} app
     * @param {{name: string, path: string}[]} wads - unused, nothing here reads a WAD
     * @param {function(string)} progress
     * @returns {Promise<object>} key "check" → readable outcome, fingerprints of the bytes
     */
    static async run(app, wads, progress) {
        const result = {};
        for (const [key, script] of Object.entries(BenchNetSuite.CHECKS)) {
            progress(key);
            try {
                result[key] = BenchNetSuite._digest(app.run(script)());
            } catch (error) {
                result[key] = {error: String(error.message).split('\n')[0]};
            }
            app.takeLogs();
        }

        return result;
    }

    // Every `…Bytes` field is kept by its fingerprint, the rest as it is.
    static _digest(outcome) {
        const digest = {};
        for (const [field, value] of Object.entries(outcome)) {
            digest[field] = ((field.endsWith('Bytes')) ? BenchFingerprint.shaOfBytes([value]) : value);
        }

        return digest;
    }
}

BenchNetSuite.ATTEMPT_SCRIPT = `
    const codeOf  = (error) => ((error instanceof NetError)
        ? error.getCode() + (((error.getDetail() !== null) && (error.getDetail() !== '')) ? ' (' + error.getDetail() + ')' : '')
        : 'error: ' + error.message);
    const attempt = (call) => {
        try {
            call();
            return 'accepted';
        } catch (error) {
            return codeOf(error);
        }
    };
`;

BenchNetSuite.SDP_SCRIPT = `
    const sdp = (candidates) => [
        'v=0', 'o=- 1 2 IN IP4 127.0.0.1', 's=-', 't=0 0',
        'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
        'a=ice-ufrag:bEnc', 'a=ice-pwd:Pa55w0rdPa55w0rdPa55w0rd',
        'a=fingerprint:sha-256 ' + Array.from({length: 32}, (_, i) => (i * 7 % 256).toString(16).padStart(2, '0').toUpperCase()).join(':'),
        'a=setup:actpass', 'a=mid:0', 'a=sctp-port:5000',
        ...candidates.map((c, i) => 'a=candidate:' + i + ' 1 udp ' + c.priority + ' ' + c.address + ' ' + c.port + ' typ ' + c.type),
        'a=candidate:9 2 udp 1 192.168.1.10 5001 typ host',
        'a=candidate:8 1 tcp 1 192.168.1.10 5002 typ host'
    ].join('\\r\\n') + '\\r\\n';
    const CANDIDATES = [
        {type: 'host',  address: '192.168.1.10',                               port: 50000, priority: 2130706431},
        {type: 'host',  address: '2a01:cb04:1234:5678:abcd:ef01:2345:6789',    port: 50001, priority: 2130706430},
        {type: 'host',  address: '0123abcd-4567-89ef-0123-456789abcdef.local', port: 50002, priority: 2130706429},
        {type: 'srflx', address: '82.64.12.34',                                port: 61234, priority: 1694498815},
        {type: 'relay', address: 'turn.example.net',                           port: 3478,  priority: 16777215}
    ];
`;

BenchNetSuite.CHECKS = {
    signal: `(() => {
        ${BenchNetSuite.ATTEMPT_SCRIPT}
        ${BenchNetSuite.SDP_SCRIPT}
        const offer   = sdp(CANDIDATES);
        const bytes   = NetSignalCodec.encode(offer);
        const decoded = NetSignalCodec.decode(bytes, 'offer');
        const again   = NetSignalCodec.encode(decoded.description.sdp);
        const rejects = {
            mid:      attempt(() => NetSignalCodec.encode(offer.replace('a=mid:0', 'a=mid:1'))),
            hash:     attempt(() => NetSignalCodec.encode(offer.replace('sha-256', 'sha-1'))),
            setup:    attempt(() => NetSignalCodec.encode(offer.replace('actpass', 'holdconn'))),
            trailing: attempt(() => NetSignalCodec.decode(new Uint8Array([...bytes, 0]), 'offer'))
        };

        return {
            signalBytes: bytes,
            length:      bytes.length,
            stable:      (NetHex.fromBytes(bytes) === NetHex.fromBytes(again)),
            candidates:  decoded.candidates,
            sdpLines:    decoded.description.sdp.split('\\r\\n').filter((line) => (line !== '') && !line.startsWith('o=')),
            rejects:     rejects
        };
    })`,

    pairingCode: `(() => {
        ${BenchNetSuite.ATTEMPT_SCRIPT}
        const signal   = new Uint8Array([1, 2, 3, 4, 5]);
        const payload  = DoomNetInvite.encodeInvite('ab'.repeat(32), 2, 'Doom 2 - v1.9');
        const code     = NetPairingCode.encode('v1.0', NetPairingCode.KIND_INVITE, 4242, signal, payload);
        const decoded  = NetPairingCode.decode(code, 'v1.0', NetPairingCode.KIND_INVITE);
        const refused  = (bytes, version, kind) => attempt(() => NetPairingCode.decode(bytes, version, kind));
        const answerOf = (wadSha256, nickname) => {
            try {
                return DoomNetInvite.decodeAnswer(DoomNetInvite.answerFor(decoded.payload, wadSha256, nickname));
            } catch (error) {
                return 'refused: ' + codeOf(error);
            }
        };

        return {
            codeBytes:    code,
            length:       code.length,
            inviteId:     decoded.inviteId,
            signal:       Array.from(decoded.signal),
            invite:       DoomNetInvite.decodeInvite(decoded.payload),
            nickname:     answerOf('ab'.repeat(32), 'Zoe_42'),
            accented:     answerOf('ab'.repeat(32), 'Zoé'),
            otherWad:     answerOf('cd'.repeat(32), 'Zoe_42'),
            otherVersion: refused(code, 'v1.1', NetPairingCode.KIND_INVITE),
            otherKind:    refused(code, 'v1.0', NetPairingCode.KIND_ANSWER),
            truncated:    refused(code.slice(0, code.length - payload.length - 2), 'v1.0', NetPairingCode.KIND_INVITE),
            garbage:      refused(new Uint8Array([200, 1]), 'v1.0', NetPairingCode.KIND_INVITE)
        };
    })`,

    chunks: `(() => {
        class RecordingLink extends NetLink {
            constructor() {
                super();
                this.sent  = [];
                this._open = true;
            }

            _send(message) {
                this.sent.push(message);
                return true;
            }
        }
        const link      = new RecordingLink();
        const codec     = new NetMessageCodec(link);
        const delivered = [];
        const invalid   = [];
        codec.setOnBinary((buffer) => delivered.push(new Uint8Array(buffer)));
        codec.setOnInvalid((error) => invalid.push(error.getCode()));
        const size    = NetConfig.CHUNK_SIZE * 2 + 1234;
        const message = new Uint8Array(size).map((_, i) => ((i * 31 + 7) & 0xFF));
        message[0] = 0x10;
        codec.sendBinary(message.buffer);
        codec.sendBinary(new Uint8Array([0x11, 1, 2, 3]).buffer);
        const chunks = link.sent.slice(0, -1);
        for (const chunk of [chunks[2], chunks[0], chunks[1]]) {
            codec._receive(chunk);
        }
        codec._receive(link.sent[link.sent.length - 1]);
        codec._receive(chunks[1]);
        codec._receive(chunks[1]);
        codec._receive(new ArrayBuffer(0));
        codec._receive('{"type": "ok"}');
        codec._receive('{"notype": 1}');
        codec.discardPartials();
        codec._receive(chunks[0]);
        codec._receive(chunks[2]);

        return {
            chunks:      chunks.length,
            chunkSizes:  chunks.map((chunk) => chunk.byteLength),
            rebuilt:     ((delivered[0].length === size) && delivered[0].every((byte, i) => (byte === message[i]))),
            small:       Array.from(delivered[1]),
            delivered:   delivered.length,
            invalid:     invalid
        };
    })`,

    reachability: `(() => {
        const host  = (address) => ({type: 'host', address});
        const srflx = (address) => ({type: 'srflx', address});
        const table = {
            'wifi-wifi':          [[host('192.168.1.10'), srflx('82.64.12.34')],  [host('192.168.1.20'), srflx('82.64.12.34')]],
            'wifi-4g':            [[host('192.168.1.10'), srflx('82.64.12.34')],  [host('10.120.3.4'), srflx('176.140.1.2')]],
            'wifi-4g-no-public':  [[host('192.168.1.10')],                        [host('10.120.3.4'), srflx('176.140.1.2')]],
            'same-nat':           [[host('192.168.1.10'), srflx('82.64.12.34')],  [host('172.16.5.5'), srflx('82.64.12.34')]],
            'ipv6-same-prefix':   [[host('2a01:cb04:1234:5678::1')],              [host('2a01:cb04:1234:5678::2')]],
            'ipv6-other-prefix':  [[host('2a01:cb04:1234:5678::1')],              [host('2a01:cb04:9999:5678::2')]],
            'ipv6-link-local':    [[host('fe80::1')],                             [host('fe80::2')]],
            'mdns':               [[host('0123abcd-4567-89ef-0123-456789abcdef.local')], [host('192.168.1.20')]],
            'empty':              [[],                                            [host('192.168.1.20')]],
            'loopback':           [[host('127.0.0.1')],                           [host('127.0.0.1')]],
            'cgnat-shared':       [[host('100.64.1.2')],                          [host('100.64.1.3')]],
            'ipv6-ula':           [[host('fd12:3456:789a:1::1')],                 [host('fd12:3456:789a:1::2')]]
        };
        const verdicts = {};
        for (const [name, [local, remote]] of Object.entries(table)) {
            verdicts[name] = NetReachability.verdict(local, remote) + ((NetReachability.verdict(remote, local) === NetReachability.verdict(local, remote)) ? '' : ' (asymmetric)');
        }

        return verdicts;
    })`,

    lobby: `(() => {
        const lobby = new DoomNetLobby(4);
        const steps = [];
        const note  = (what) => steps.push(what + ': ' + lobby.getPlayers().map((p) => p.slot + '=' + p.nickname).join(' ') + ((lobby.hasReservations()) ? ' | reserved ' + lobby.getReserved().map((s) => s.slot + '=' + s.nickname).join(' ') : ''));
        lobby.addMain('Host');
        lobby.addPlayer(1, 'Ann');
        lobby.addPlayer(2, 'Bob');
        note('three in');
        lobby.remove(1);
        lobby.addPlayer(3, 'Cid', lobby.claimSeat('Cid').slot);
        note('Ann left, Cid takes her slot');
        lobby.reserve(2);
        note('Bob lost');
        lobby.addPlayer(4, 'Dee', lobby.claimSeat('Dee').slot);
        note('Dee skips the reserved seat');
        const back = lobby.claimSeat('Bob');
        lobby.addPlayer(5, 'Bob', back.slot);
        note('Bob back in his seat');
        lobby.reserve(5);
        lobby.reserve(4);
        const eve  = lobby.claimSeat('Eve');
        lobby.addPlayer(6, 'Eve', eve.slot);
        const fay  = lobby.claimSeat('Fay');
        lobby.addPlayer(7, 'Fay', fay.slot);
        const none = lobby.claimSeat('Gus');
        note('seats evicted in slot order');
        const released = lobby.releaseSeats();
        const mirror   = new DoomNetLobby(1).load(JSON.parse(JSON.stringify(lobby.toData())));

        return {
            steps:     steps,
            back:      back,
            eve:       eve,
            fay:       fay,
            none:      none,
            released:  released,
            full:      lobby.isFull(),
            mirrored:  (JSON.stringify(mirror.toData()) === JSON.stringify(lobby.toData()))
        };
    })`
};

module.exports = {BenchNetSuite};
