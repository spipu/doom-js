/**
 * Compacts a WebRTC session description to what a data channel link needs — setup role,
 * ICE credentials, DTLS fingerprint, UDP candidates — and rebuilds a valid one from it,
 * so that a whole description fits a small QR code (about 150 bytes instead of 1–2 KB).
 */
class NetSignalCodec {
    /**
     * @param {string} sdp
     * @returns {Uint8Array}
     */
    static encode(sdp) {
        if (NetSignalCodec._value(sdp, 'mid') !== NetSignalCodec.MEDIA_ID) {
            throw new NetError(NetError.INVALID_SIGNAL, 'Unexpected media id ' + NetSignalCodec._value(sdp, 'mid'));
        }
        const fingerprint = NetSignalCodec._value(sdp, 'fingerprint').split(' ');
        if (fingerprint[0].toLowerCase() !== NetSignalCodec.FINGERPRINT_HASH) {
            throw new NetError(NetError.INVALID_SIGNAL, 'Unsupported fingerprint ' + fingerprint[0]);
        }
        const candidates = NetSignalCodec.candidatesOf(sdp);
        const writer     = new NetByteWriter()
            .u8(NetSignalCodec._indexIn(NetSignalCodec.SETUP_ROLES, NetSignalCodec._value(sdp, 'setup'), 'setup role'))
            .ascii(NetSignalCodec._value(sdp, 'ice-ufrag'))
            .ascii(NetSignalCodec._value(sdp, 'ice-pwd'))
            .bytes(NetHex.toBytes(fingerprint[1].replace(/:/g, '')))
            .u8(candidates.length);
        for (const candidate of candidates) {
            writer.u8(NetSignalCodec._indexIn(NetSignalCodec.CANDIDATE_TYPES, candidate.type, 'candidate type'));
            NetSignalCodec._writeAddress(writer, candidate.address);
            writer.u16(candidate.port).u32(candidate.priority);
        }
        return writer.toBytes();
    }

    /**
     * @param {Uint8Array} bytes
     * @param {string}     type  - 'offer' | 'answer'
     * @returns {RTCSessionDescriptionInit}
     */
    static decode(bytes, type) {
        const reader = new NetByteReader(bytes);
        const signal = {
            setup:       NetSignalCodec._entryOf(NetSignalCodec.SETUP_ROLES, reader.u8(), 'setup role'),
            ufrag:       reader.ascii(),
            pwd:         reader.ascii(),
            fingerprint: NetHex.fromBytes(reader.bytes(NetSignalCodec.FINGERPRINT_BYTES)).toUpperCase().match(/../g).join(':'),
            candidates:  []
        };
        const count = reader.u8();
        for (let i = 0; i < count; i++) {
            const candidateType = NetSignalCodec._entryOf(NetSignalCodec.CANDIDATE_TYPES, reader.u8(), 'candidate type');
            const address       = NetSignalCodec._readAddress(reader);
            signal.candidates.push({type: candidateType, address, port: reader.u16(), priority: reader.u32()});
        }
        if (!reader.isAtEnd()) {
            throw new NetError(NetError.INVALID_SIGNAL, 'Trailing bytes in the signal');
        }
        return {type, sdp: NetSignalCodec._buildSdp(signal)};
    }

    /**
     * UDP candidates of the first component, duplicates dropped.
     *
     * @param {string} sdp
     * @returns {{type: string, address: string, port: int, priority: int}[]}
     */
    static candidatesOf(sdp) {
        const fields     = NetSignalCodec.CANDIDATE_FIELDS;
        const candidates = [];
        for (const line of sdp.split(/\r?\n/)) {
            if (!line.startsWith(NetSignalCodec.CANDIDATE_PREFIX)) {
                continue;
            }
            const parts     = line.substring(NetSignalCodec.CANDIDATE_PREFIX.length).split(' ');
            const candidate = {
                type:     parts[fields.type],
                address:  parts[fields.address],
                port:     Number(parts[fields.port]),
                priority: Number(parts[fields.priority])
            };
            if ((parts[fields.component] !== NetSignalCodec.RTP_COMPONENT) || (parts[fields.protocol].toLowerCase() !== 'udp')) {
                continue;
            }
            if (candidates.some(c => (c.type === candidate.type) && (c.address === candidate.address) && (c.port === candidate.port))) {
                continue;
            }
            candidates.push(candidate);
        }
        return candidates;
    }

    static _indexIn(table, entry, what) {
        const index = table.indexOf(entry);
        if (index < 0) {
            throw new NetError(NetError.INVALID_SIGNAL, 'Unknown ' + what + ' ' + entry);
        }
        return index;
    }

    static _entryOf(table, index, what) {
        if (index >= table.length) {
            throw new NetError(NetError.INVALID_SIGNAL, 'Unknown ' + what + ' ' + index);
        }
        return table[index];
    }

    static _value(sdp, key) {
        const prefix = 'a=' + key + ':';
        const line   = sdp.split(/\r?\n/).find(l => l.startsWith(prefix));
        if (line === undefined) {
            throw new NetError(NetError.INVALID_SIGNAL, 'Session description without ' + prefix);
        }
        return line.substring(prefix.length).trim();
    }

    static _buildSdp(signal) {
        const lines = [
            'v=0',
            'o=- ' + Date.now() + ' 2 IN IP4 127.0.0.1',
            's=-',
            't=0 0',
            'a=group:BUNDLE ' + NetSignalCodec.MEDIA_ID,
            'a=msid-semantic: WMS',
            'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
            'c=IN IP4 0.0.0.0',
            'a=ice-ufrag:' + signal.ufrag,
            'a=ice-pwd:' + signal.pwd,
            'a=fingerprint:' + NetSignalCodec.FINGERPRINT_HASH + ' ' + signal.fingerprint,
            'a=setup:' + signal.setup,
            'a=mid:' + NetSignalCodec.MEDIA_ID,
            'a=sctp-port:' + NetSignalCodec.SCTP_PORT
        ];
        signal.candidates.forEach((candidate, index) => {
            const related = ((candidate.type === 'host') ? '' : ' raddr 0.0.0.0 rport 0');
            lines.push(NetSignalCodec.CANDIDATE_PREFIX + index + ' ' + NetSignalCodec.RTP_COMPONENT + ' udp ' + candidate.priority
                + ' ' + candidate.address + ' ' + candidate.port + ' typ ' + candidate.type + related);
        });
        lines.push('a=end-of-candidates');
        return lines.join('\r\n') + '\r\n';
    }

    static _writeAddress(writer, address) {
        const mdns = NetSignalCodec.MDNS_PATTERN.exec(address);
        if (mdns !== null) {
            writer.u8(NetSignalCodec.ADDRESS_MDNS).bytes(NetHex.toBytes(mdns.slice(1).join('')));
            return;
        }
        if (NetSignalCodec.IPV4_PATTERN.test(address)) {
            writer.u8(NetSignalCodec.ADDRESS_IPV4).bytes(address.split('.').map(Number));
            return;
        }
        const ipv6 = NetSignalCodec._ipv6ToBytes(address);
        if (ipv6 !== null) {
            writer.u8(NetSignalCodec.ADDRESS_IPV6).bytes(ipv6);
            return;
        }
        writer.u8(NetSignalCodec.ADDRESS_NAME).ascii(address);
    }

    static _readAddress(reader) {
        const kind = reader.u8();
        if (kind === NetSignalCodec.ADDRESS_IPV4) {
            return Array.from(reader.bytes(NetSignalCodec.IPV4_BYTES)).join('.');
        }
        if (kind === NetSignalCodec.ADDRESS_IPV6) {
            return NetSignalCodec._ipv6FromBytes(reader.bytes(NetSignalCodec.IPV6_BYTES));
        }
        if (kind === NetSignalCodec.ADDRESS_MDNS) {
            return NetSignalCodec._uuidFromHex(NetHex.fromBytes(reader.bytes(NetSignalCodec.UUID_BYTES))) + '.local';
        }
        if (kind === NetSignalCodec.ADDRESS_NAME) {
            return reader.ascii();
        }
        throw new NetError(NetError.INVALID_SIGNAL, 'Unknown address kind ' + kind);
    }

    static _uuidFromHex(hex) {
        const groups = [];
        let offset   = 0;
        for (const length of NetSignalCodec.UUID_GROUPS) {
            groups.push(hex.substring(offset, offset + length));
            offset += length;
        }
        return groups.join('-');
    }

    // A zone id or a mapped IPv4 would be silently corrupted: null sends them as names.
    static _ipv6ToBytes(address) {
        const halves = address.split('::');
        if ((halves.length > 2) || !address.includes(':')) {
            return null;
        }
        const head    = ((halves[0] === '') ? [] : halves[0].split(':'));
        const tail    = (((halves.length < 2) || (halves[1] === '')) ? [] : halves[1].split(':'));
        const missing = NetSignalCodec.IPV6_WORDS - head.length - tail.length;
        if ((missing < 0) || ((halves.length < 2) && (missing !== 0))) {
            return null;
        }
        const words = [...head, ...new Array(missing).fill('0'), ...tail];
        if (!words.every(word => NetSignalCodec.IPV6_WORD_PATTERN.test(word))) {
            return null;
        }
        return NetHex.toBytes(words.map(word => word.padStart(NetSignalCodec.IPV6_WORD_DIGITS, '0')).join(''));
    }

    static _ipv6FromBytes(bytes) {
        const hex   = NetHex.fromBytes(bytes);
        const words = [];
        for (let i = 0; i < hex.length; i += NetSignalCodec.IPV6_WORD_DIGITS) {
            words.push(parseInt(hex.substring(i, i + NetSignalCodec.IPV6_WORD_DIGITS), NetHex.RADIX).toString(NetHex.RADIX));
        }
        return words.join(':');
    }
}

NetSignalCodec.MEDIA_ID          = '0';
NetSignalCodec.SCTP_PORT         = 5000;
NetSignalCodec.RTP_COMPONENT     = '1';
NetSignalCodec.FINGERPRINT_HASH  = 'sha-256';
NetSignalCodec.FINGERPRINT_BYTES = 32;
NetSignalCodec.SETUP_ROLES       = ['actpass', 'active', 'passive'];
NetSignalCodec.CANDIDATE_TYPES   = ['host', 'srflx', 'prflx', 'relay'];
NetSignalCodec.CANDIDATE_PREFIX  = 'a=candidate:';
// Positions in 'foundation component protocol priority address port typ type' (RFC 8839).
NetSignalCodec.CANDIDATE_FIELDS  = {component: 1, protocol: 2, priority: 3, address: 4, port: 5, type: 7};
NetSignalCodec.ADDRESS_MDNS      = 1;
NetSignalCodec.ADDRESS_NAME      = 2;
NetSignalCodec.ADDRESS_IPV4      = 4;
NetSignalCodec.ADDRESS_IPV6      = 6;
NetSignalCodec.IPV4_BYTES        = 4;
NetSignalCodec.IPV6_BYTES        = 16;
NetSignalCodec.IPV6_WORDS        = 8;
NetSignalCodec.IPV6_WORD_DIGITS  = 4;
NetSignalCodec.IPV6_WORD_PATTERN = /^[0-9a-f]{1,4}$/i;
NetSignalCodec.UUID_BYTES        = 16;
NetSignalCodec.UUID_GROUPS       = [8, 4, 4, 4, 12];
NetSignalCodec.IPV4_PATTERN      = /^\d+\.\d+\.\d+\.\d+$/;
NetSignalCodec.MDNS_PATTERN      = /^([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})\.local$/i;
