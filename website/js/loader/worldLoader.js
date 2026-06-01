class TextureLoader extends AbstractLoader {
    constructor(loadedCallback) {
        super(loadedCallback);
   }

    _alreadyLoaded(url) {
        if (url === null) {
            return false;
        }

        for (let i = 0; i < this._entities.length; i++) {
            if (this._entities[i].getUrl() === url) {
                return i;
            }
        }

        return null;
    }

    _create(id, url, callback) {
        const entity = new Texture(id, url, callback);

        if (entity.getUrl()) {
            this._initialiseEntityFromUrl(entity);
        }

        return entity;
    }

    _initialiseEntityFromUrl(entity) {
        const img = new Image();
        img.onload = () => {
            const canvas  = document.createElement('canvas');
            const ctx     = canvas.getContext('2d');
            canvas.width  = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);

            entity._imageData = ctx.getImageData(0, 0, img.width, img.height);
            entity.setLoaded();
        };

        img.src = bootstrap.buildUrl(entity.getUrl());
    }
}
