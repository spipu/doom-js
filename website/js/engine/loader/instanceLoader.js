class InstanceLoader extends AbstractLoader {
    constructor(loadedCallback) {
        super('instance', loadedCallback);
    }

    reset() {
        super.reset();
        this._pendingRemoval = [];
    }

    // Runtime despawn (e.g. a picked-up item): queued during World.update and
    // applied by flushRemovals() once the per-frame loops are done, so the
    // entity list is never mutated mid-iteration. The slot is deleted (a hole),
    // which forEach/every/map skip — every per-frame consumer keeps working.
    scheduleRemoval(instance) {
        this._pendingRemoval.push(instance.getId());
        return this;
    }

    flushRemovals() {
        if (this._pendingRemoval.length === 0) {
            return;
        }
        for (const id of this._pendingRemoval) {
            this._removeById(id);
        }
        this._pendingRemoval = [];
    }

    _removeById(id) {
        const entity = this._entities[id];
        if (entity === undefined) {
            return;
        }
        const code = entity.getCode();
        if ((code !== undefined) && (this._codeRegistry[code] !== undefined)) {
            delete this._codeRegistry[code];
        }
        delete this._entities[id];
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
                this._populateFromData(entity, data);
                entity.setLoaded();
            }
        );
    }

    // data.object: url string (loaded via Object3dLoader) or number (already loaded object id)
    _populateFromData(entity, data) {
        entity._code             = data.code;
        entity._objectId         = ((typeof data.object === 'number') ? data.object : loader.objects().load(data.object));
        entity._position         = data.position;
        entity._rotation         = data.rotation;
        entity._trigger          = data.trigger;
        entity._animLoop         = (data.loop === true);
        entity._animOnlyOnce     = (data.onlyOnce === true);
        entity._collisionShape   = (data.collisionShape ?? 'none');
        entity._collisionRadius  = (data.collisionRadius ?? null);
        entity._interactionRadius = (data.interactionRadius ?? null);
        entity._triggerPlanar    = (data.triggerPlanar === true);
        entity._damage           = data.damage || null;
        entity._interaction      = data.interaction || null;
        entity._animKeyframes    = data.keyframes || [];
        entity._animMaxTime      = ((entity._animKeyframes.length > 0) ? entity._animKeyframes[entity._animKeyframes.length - 1].t : 0);
        entity._animTime         = ((entity._animKeyframes.length > 0) ? entity._animKeyframes[0].t : 0);

        this._codeRegistry[entity.getCode()] = entity.getId();
    }
}

