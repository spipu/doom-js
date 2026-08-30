/**
 * A piece of music: the raw bytes of a song plus an opaque format tag, handed
 * over by the game layer. Nothing is pre-rendered — a synthesizer reads the
 * bytes when the track is actually played.
 */
class SoundTrack extends AbstractLoadedEntity {
    constructor(id, url, callback) {
        super(id, url, callback);

        this._format = null;
        this._bytes  = null;
    }

    /**
     * @param {string} format opaque tag the game layer understands ('mus', 'midi'…)
     * @param {ArrayBuffer} bytes raw song data
     */
    setTrackData(format, bytes) {
        this._format = format;
        this._bytes  = bytes;
        return this;
    }

    getFormat() {
        return this._format;
    }

    getBytes() {
        return this._bytes;
    }
}
