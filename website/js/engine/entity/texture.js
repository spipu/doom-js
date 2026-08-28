class Texture extends AbstractLoadedEntity {
    constructor(id, url, callback) {
        super(id, url, callback);

        this._imageData = null;
        this._alpha     = false;
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
