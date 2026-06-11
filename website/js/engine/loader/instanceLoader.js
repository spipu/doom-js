class InstanceLoader extends AbstractLoader {
    constructor(loadedCallback) {
        super('instance', loadedCallback);
    }

    _alreadyLoaded(url) {
        return (this._loadedFiles[url] !== undefined ? this._loadedFiles[url] : null);
    }

    _create(id, url, callback) {
        return new Instance(id, url, callback);
    }

    _initialiseEntityFromUrl(entity) {
        appBootstrap.fetchJson(
            entity.getUrl(),
            data => {
                entity._code        = data.code;
                entity._objectId    = loader.objects().load(data.object);
                entity._position    = data.position;
                entity._rotation    = data.rotation;
                entity._trigger     = data.trigger;
                entity._loop        = (data.loop === true);
                entity._onlyOnce    = (data.onlyOnce === true);
                entity._collidable  = (data.collidable === true);
                entity._radius      = data.radius;
                entity._damage      = data.damage || null;
                entity._interaction = data.interaction || null;
                entity._keyframes   = data.keyframes || [];
                entity._maxTime     = ((entity._keyframes.length > 0) ? entity._keyframes[entity._keyframes.length - 1].t : 0);
                entity._time        = ((entity._keyframes.length > 0) ? entity._keyframes[0].t : 0);

                this._codeRegistry[entity.getCode()] = entity.getId();

                entity.setLoaded();
            }
        );
    }
}

