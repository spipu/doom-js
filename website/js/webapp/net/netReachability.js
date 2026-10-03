/**
 * Whether two sides whose addresses travelled in their pairing codes can reach each other,
 * judged before any connection attempt: they share a local network, a route over the
 * internet may exist, none can, or there is no telling (an address hidden behind an mDNS
 * name may be the shared one). Addresses come as ICE candidates: 'host' ones are the
 * side's own addresses, the others ('srflx', 'relay') are public ones seen from outside.
 */
class NetReachability {
    /**
     * @param {{type: string, address: string}[]} local  - one side's candidates
     * @param {{type: string, address: string}[]} remote - the other side's
     * @returns {string} NetReachability.SAME_NETWORK | INTERNET | UNREACHABLE | UNKNOWN
     */
    static verdict(local, remote) {
        if ((local.length === 0) || (remote.length === 0)) {
            return NetReachability.UNKNOWN;
        }
        const here  = local.map(NetReachability._classify);
        const there = remote.map(NetReachability._classify);
        if (NetReachability._shareOne(here, there, 'prefix') || NetReachability._shareOne(here, there, 'key')) {
            return NetReachability.SAME_NETWORK;
        }
        if (here.some(NetReachability._isHidden) || there.some(NetReachability._isHidden)) {
            return NetReachability.UNKNOWN;
        }
        if (NetReachability._familiesOf(here, NetReachability.SCOPE_PUBLIC).some(family => NetReachability._familiesOf(there, NetReachability.SCOPE_PUBLIC).includes(family))) {
            return NetReachability.INTERNET;
        }
        return NetReachability.UNREACHABLE;
    }

    // Two sides on one network: a network prefix in common, or the same public address (one NAT).
    static _shareOne(here, there, field) {
        const values = here.map(entry => entry[field]).filter(value => (value !== null));

        return there.some(entry => (entry[field] !== null) && values.includes(entry[field]));
    }

    static _isHidden(entry) {
        return (entry.scope === NetReachability.SCOPE_HIDDEN);
    }

    static _familiesOf(entries, scope) {
        return entries.filter(entry => (entry.scope === scope)).map(entry => entry.family);
    }

    /**
     * @returns {{scope: string, family: int|null, prefix: string|null, key: string|null}} prefix = the
     *          network of the side's own address (IPv4 /24, IPv6 /64), key = a public address as seen from outside
     */
    static _classify(candidate) {
        const ipv4 = NetReachability._ipv4Of(candidate.address);
        if (ipv4 !== null) {
            return NetReachability._classifyIpv4(candidate, ipv4);
        }
        const ipv6 = NetSignalCodec.ipv6ToBytes(candidate.address);
        if (ipv6 !== null) {
            return NetReachability._classifyIpv6(candidate, ipv6);
        }

        return NetReachability._entry(NetReachability.SCOPE_HIDDEN, null);
    }

    static _classifyIpv4(candidate, octets) {
        if (NetReachability._inAnyIpv4(octets, NetReachability.IPV4_IGNORED)) {
            return NetReachability._entry(NetReachability.SCOPE_IGNORED, null);
        }
        const own    = (candidate.type === 'host');
        const prefix = ((own) ? octets.slice(0, NetReachability.IPV4_PREFIX_OCTETS).join('.') : null);
        if (own && NetReachability._inAnyIpv4(octets, NetReachability.IPV4_LOCAL)) {
            return NetReachability._entry(NetReachability.SCOPE_LOCAL, 4, prefix);
        }

        return NetReachability._entry(NetReachability.SCOPE_PUBLIC, 4, prefix, candidate.address);
    }

    static _classifyIpv6(candidate, bytes) {
        const top = bytes[0];
        if (NetReachability._isIpv6LinkLocal(bytes) || NetReachability._isIpv6Loopback(bytes)) {
            return NetReachability._entry(NetReachability.SCOPE_IGNORED, null);
        }
        const own    = (candidate.type === 'host');
        const prefix = ((own) ? NetHex.fromBytes(bytes.slice(0, NetReachability.IPV6_PREFIX_BYTES)) : null);
        if (own && ((top & NetReachability.IPV6_ULA_MASK) === NetReachability.IPV6_ULA)) {
            return NetReachability._entry(NetReachability.SCOPE_LOCAL, 6, prefix);
        }
        if ((top & NetReachability.IPV6_GLOBAL_MASK) === NetReachability.IPV6_GLOBAL) {
            return NetReachability._entry(NetReachability.SCOPE_PUBLIC, 6, prefix, NetHex.fromBytes(bytes));
        }

        return NetReachability._entry(NetReachability.SCOPE_IGNORED, null);
    }

    static _entry(scope, family, prefix = null, key = null) {
        return {scope, family, prefix, key};
    }

    static _isIpv6LinkLocal(bytes) {
        return ((bytes[0] === NetReachability.IPV6_LINK_LOCAL[0]) && ((bytes[1] & NetReachability.IPV6_LINK_LOCAL[1]) === NetReachability.IPV6_LINK_LOCAL[2]));
    }

    static _isIpv6Loopback(bytes) {
        return bytes.every((byte, index) => (byte === ((index === bytes.length - 1) ? 1 : 0)));
    }

    /**
     * @returns {int[]|null} the four octets of a dotted IPv4 address, null for anything else
     */
    static _ipv4Of(address) {
        if (!NetSignalCodec.IPV4_PATTERN.test(address)) {
            return null;
        }
        const octets = address.split('.').map(Number);

        return (octets.every(octet => (octet <= NetReachability.OCTET_MAX)) ? octets : null);
    }

    static _inAnyIpv4(octets, ranges) {
        return ranges.some(([first, second, mask]) => ((octets[0] === first) && ((octets[1] & mask) === second)));
    }
}

NetReachability.SAME_NETWORK = 'same-network';
NetReachability.INTERNET     = 'internet';
NetReachability.UNREACHABLE  = 'unreachable';
NetReachability.UNKNOWN      = 'unknown';

NetReachability.SCOPE_LOCAL   = 'local';
NetReachability.SCOPE_PUBLIC  = 'public';
NetReachability.SCOPE_HIDDEN  = 'hidden';
NetReachability.SCOPE_IGNORED = 'ignored';

// [first octet, second octet, mask of the second octet]: 10/8, 172.16/12, 192.168/16 (RFC 1918), 100.64/10 (carrier NAT).
NetReachability.IPV4_LOCAL         = [[10, 0, 0x00], [172, 16, 0xF0], [192, 168, 0xFF], [100, 64, 0xC0]];
// 127/8 (loopback), 169.254/16 (link-local).
NetReachability.IPV4_IGNORED       = [[127, 0, 0x00], [169, 254, 0xFF]];
NetReachability.IPV4_PREFIX_OCTETS = 3;
NetReachability.OCTET_MAX          = 255;
NetReachability.IPV6_PREFIX_BYTES  = 8;
// fe80::/10: first byte, then the mask and expected value of the second.
NetReachability.IPV6_LINK_LOCAL    = [0xFE, 0xC0, 0x80];
// fc00::/7
NetReachability.IPV6_ULA_MASK      = 0xFE;
NetReachability.IPV6_ULA           = 0xFC;
// 2000::/3
NetReachability.IPV6_GLOBAL_MASK   = 0xE0;
NetReachability.IPV6_GLOBAL        = 0x20;
