class Texture extends AbstractLoadedEntity {
    constructor(id, url, callback) {
        super(id, url, callback);

        this._imageData    = null;
        this._alpha        = false;
        this._averageColor = null;
    }

    /**
     * Pixels of the texture, handed over by the loader once the image is
     * decoded (or built in memory). finalizeInit derives the alpha flag from
     * them afterwards.
     *
     * @param {ImageData} imageData
     */
    setImageData(imageData) {
        this._imageData = imageData;
        return this;
    }

    finalizeInit() {
        const d = this._imageData.data;
        for (let i = 3; i < d.length; i += 4) {
            if (d[i] !== 255) {
                this._alpha = true;
                break;
            }
        }
    }

    isAlpha() {
        return this._alpha;
    }

    /**
     * Average colour of the texture, computed on first use and kept. Only the
     * opaque texels count, so the transparent border of a sprite does not wash
     * it out; a texture with no opaque texel at all answers white.
     *
     * @returns {number[]} [r, g, b], each 0-255
     */
    getAverageColor() {
        if (this._averageColor !== null) {
            return this._averageColor;
        }
        const data = this._imageData.data;
        let r = 0, g = 0, b = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] === 0) {
                continue;
            }
            r += data[i];
            g += data[i + 1];
            b += data[i + 2];
            count++;
        }
        this._averageColor = ((count === 0) ? [255, 255, 255] : [r / count, g / count, b / count]);

        return this._averageColor;
    }

    get data() {
        return this._imageData.data;
    }

    get width() {
        return this._imageData.width;
    }

    get height() {
        return this._imageData.height;
    }
}
