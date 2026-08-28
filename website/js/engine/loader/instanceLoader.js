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
        if ((code !== null) && (this._codeRegistry[code] !== undefined)) {
            delete this._codeRegistry[code];
        }
        delete this._entities[id];
    }

    _create(id, url, callback) {
        return new Instance(id, url, callback);
    }

    // The instance reads its own descriptor (Instance.populate); the loader
    // only owns the code registry it maintains for getByCode.
    _populateFromData(entity, data) {
        entity.populate(data);
        if (entity.getCode() !== null) {
            this._codeRegistry[entity.getCode()] = entity.getId();
        }
    }
}

