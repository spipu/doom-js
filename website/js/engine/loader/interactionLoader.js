class InteractionLoader extends AbstractLoader {
    constructor(loadedCallback) {
        super('interaction', loadedCallback);
    }

    reset() {
        super.reset();
        this._pendingEntities = [];
    }

    _alreadyLoaded(url) {
        return (this._loadedFiles[url] !== undefined ? this._loadedFiles[url] : null);
    }

    _create(id, url, callback) {
        return new Interaction(id, url, callback);
    }

    _initialiseEntityFromUrl(entity) {
        this._pendingEntities.push(entity);

        const script   = document.createElement('script');
        script.src     = appBootstrap.buildUrl(entity.getUrl());
        script.onerror = () => { console.error('Failed to load JS: ' + entity.getUrl()); };

        document.head.appendChild(script);
    }

    register(interaction) {
        const entity = this._pendingEntities.shift();
        entity.setInteraction(interaction);
        this._codeRegistry[entity.getCode()] = entity.getId();
    }

    updateAll(dt) {
        for (const entity of this._entities) {
            entity.update(dt);
        }
    }
}
