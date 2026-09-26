class InstanceLoader extends AbstractLoader {
    constructor(loadedCallback) {
        super('instance', loadedCallback);
    }

    reset() {
        super.reset();
        this._pendingRemoval = [];
    }

    // Applied by flushRemovals() after the frame loops. The slot becomes a hole,
    // which forEach/every/map skip; until then the instance triggers no more.
    scheduleRemoval(instance) {
        this._pendingRemoval.push(instance.getId());
        instance.markForRemoval();
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

    _populateFromData(entity, data) {
        entity.populate(data);
        if (entity.getCode() !== null) {
            this._codeRegistry[entity.getCode()] = entity.getId();
        }
    }
}

