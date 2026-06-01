class InstanceLoader extends AbstractLoader {
    constructor(loadedCallback) {
        super(loadedCallback);
    }

    _create(id, url, callback) {
        const entity = new Instance(id, url, callback);

        if (entity.getUrl()) {
            this._initialiseEntityFromUrl(entity);
        }

        return entity;
    }

    _alreadyLoaded(url) {
        return null;
    }

    _initialiseEntityFromUrl(entity) {
        this._fetchJson(
            entity.getUrl(),
            data => {
                loader.objects().loadByCode('_inst_' + code, data.object);
            }
        );
    }
}

