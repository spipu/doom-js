class TextureLoader extends AbstractLoader {
    constructor() {
        super();
   }

    _create(id, url, callback) {
        return new Texture(id, url, callback);
    }

    _alreadyLoaded(url) {
        for (let i = 0; i < this._entities.length; i++) {
            if (this._entities[i].getUrl() === url) {
                return i;
            }
        }

        return null;
    }
}
