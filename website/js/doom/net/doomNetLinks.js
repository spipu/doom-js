/**
 * The single launch point of the network links: every session takes its link
 * factory and its code channel from here, so that nothing else knows how a
 * link is made.
 */
class DoomNetLinks {
    /**
     * @returns {function(): NetLink}
     */
    linkFactory() {
        return () => new NetPeerLink();
    }

    // Codes travel as QR codes read by the camera.
    codeChannel() {
        return null;
    }

    needsCamera() {
        return true;
    }
}
