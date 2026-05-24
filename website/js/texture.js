class Texture {
    constructor(url) {
        this._imageData = null;
        const img = new Image();
        img.onload = () => {
            const canvas  = document.createElement('canvas');
            const ctx     = canvas.getContext('2d');
            canvas.width  = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            this._imageData = ctx.getImageData(0, 0, img.width, img.height);
        };
        img.src = loader.buildUrl(url);
    }

    isLoaded() {
        return this._imageData !== null;
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
