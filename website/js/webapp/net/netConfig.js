/**
 * Constants of the network layer.
 */
class NetConfig {
}

// Two recognised public operators at most: each extra server slows address discovery.
NetConfig.STUN_SERVERS              = ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'];
NetConfig.GATHER_TIMEOUT_MS         = 2000;
// The link opens within a second once both sides hold each other's addresses; a sub's wait
// also covers the time the inviting side takes to scan its answer.
NetConfig.CONNECT_TIMEOUT_MS        = 5000;
NetConfig.ANSWER_CONNECT_TIMEOUT_MS = 30000;
NetConfig.CHANNEL_NAME              = 'net';
NetConfig.LOOPBACK_PREFIX           = 'spipu-net-';
NetConfig.PING_PERIOD_MS            = 1000;
NetConfig.PING_AVERAGE_COUNT        = 10;
NetConfig.LIVENESS_TIMEOUT_MS       = 5000;
// Well under the 64 KiB message size every browser accepts when none is negotiated (RFC 8841).
NetConfig.CHUNK_SIZE                = 16384;
