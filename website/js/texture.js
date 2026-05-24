class Texture extends AbstractLoader {
    constructor(url) {
        super();
        this._imageData = null;
        this._alpha     = false;
        const img = new Image();
        img.onload = () => {
            const canvas  = document.createElement('canvas');
            const ctx     = canvas.getContext('2d');
            canvas.width  = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            this._imageData = ctx.getImageData(0, 0, img.width, img.height);
            const d = this._imageData.data;
            for (let i = 3; i < d.length; i += 4) {
                if (d[i] !== 255) { this._alpha = true; break; }
            }
            this._executeLoadedCallback();
        };
        img.src = loader.buildUrl(url);
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
