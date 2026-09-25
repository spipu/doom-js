class Texture extends AbstractLoadedEntity {
    constructor(id, url, callback) {
        super(id, url, callback);

        this._imageData    = null;
        this._alpha        = false;
        this._averageColor = null;
    }

    setImageData(imageData) {
        this._imageData = imageData;
        return this;
    }

    finalizeInit() {
        const pixels = this._imageData.data;
        for (let i = 3; i < pixels.length; i += 4) {
            if (pixels[i] !== 255) {
                this._alpha = true;
                break;
            }
        }
    }

    isAlpha() {
        return this._alpha;
    }

    /**
     * Average of the opaque texels, computed once; white when there is none.
     *
     * @returns {number[]} [r, g, b], each 0-255
     */
    getAverageColor() {
        if (this._averageColor !== null) {
            return this._averageColor;
        }
        const pixels = this._imageData.data;
        let r = 0, g = 0, b = 0, count = 0;
        for (let i = 0; i < pixels.length; i += 4) {
            if (pixels[i + 3] === 0) {
                continue;
            }
            r += pixels[i];
            g += pixels[i + 1];
            b += pixels[i + 2];
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
