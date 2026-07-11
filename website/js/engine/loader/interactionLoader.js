class InteractionLoader extends AbstractLoader {
    constructor(loadedCallback) {
        super('interaction', loadedCallback);
    }

    reset() {
        super.reset();
        this._pendingEntities = [];
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

    // Register an already instantiated AbstractInteraction, without any script tag
    loadFromData(interaction) {
        this._loaded = false;
        const entity = this._create(
            this._entities.length,
            null,
            () => this._checkFullyLoaded()
        );

        this._entities[entity.getId()] = entity;
        entity.setInteraction(interaction);
        this._codeRegistry[entity.getCode()] = entity.getId();

        return entity.getId();
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
