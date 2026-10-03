/**
 * The ImageData the texture and sprite banks build, without a browser: the
 * same two constructor forms, backed by a plain Uint8ClampedArray.
 */
class BenchImageData {
    constructor(dataOrWidth, width, height) {
        if (dataOrWidth instanceof Uint8ClampedArray) {
            this.data   = dataOrWidth;
            this.width  = width;
            this.height = ((height !== undefined) ? height : (dataOrWidth.length / BenchImageData.CHANNELS / width));

            return;
        }
        this.width  = dataOrWidth;
        this.height = width;
        this.data   = new Uint8ClampedArray(dataOrWidth * width * BenchImageData.CHANNELS);
    }
}

BenchImageData.CHANNELS = 4;

module.exports = {BenchImageData};
