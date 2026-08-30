/**
 * A decoded sound effect: raw PCM handed over by the game layer, turned into an
 * AudioBuffer at finalize time. Twin of Texture (pixels in, alpha flag out):
 * the entity knows nothing about where the PCM comes from.
 */
class SoundSample extends AbstractLoadedEntity {
    constructor(id, url, callback) {
        super(id, url, callback);

        this._context = null;
        this._rate    = 0;
        this._samples = null;
        this._buffer  = null;
    }

    /**
     * @param {AudioContext} context
     */
    setContext(context) {
        this._context = context;
        return this;
    }

    /**
     * @param {number} rate samples per second
     * @param {Float32Array} samples mono PCM in -1..1
     */
    setPcm(rate, samples) {
        this._rate    = rate;
        this._samples = samples;
        return this;
    }

    // createBuffer keeps the sample rate as-is (the browser resamples at play
    // time) and works on a suspended context — no user gesture needed here.
    finalizeInit() {
        if (this._buffer !== null) {
            return;
        }
        this._buffer = this._context.createBuffer(1, this._samples.length, this._rate);
        this._buffer.copyToChannel(this._samples, 0);
        this._samples = null;
    }

    getBuffer() {
        return this._buffer;
    }

    getDuration() {
        return ((this._buffer !== null) ? this._buffer.duration : 0);
    }
}
