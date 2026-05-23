class InstanceFactory extends AbstractLoader {
    constructor() {
        super();
        this._registry     = {};
        this._order        = [];
        this._pendingFetches = 0;
        this._loaded = true;
    }

    reset() {
        this._registry     = {};
        this._order        = [];
        this._pendingFetches = 0;
        this._loaded = true;
    }

    get(code) {
        if (!this._loaded) throw new Error('InstanceFactory is not loaded');
        const entry = this._registry[code];
        if (!entry || !entry.instance) throw new Error('Instance "' + code + '" not found in registry');
        return entry.instance;
    }

    getAll() {
        if (!this._loaded) throw new Error('InstanceFactory is not loaded');
        return this._order.map(code => this._registry[code].instance);
    }

    load(code, url) {
        this._resetIsLoaded();
        this._pendingFetches++;
        this._order.push(code);
        this._registry[code] = { data: null, instance: null };
        this._fetchJson(url, data => {
            object3dFactory.load('_inst_' + code, data.object);
            this._registry[code].data = data;
            this._pendingFetches--;
            this._checkAllDataReady();
        });
        return this;
    }

    _checkAllDataReady() {
        if (this._pendingFetches > 0) return;
        object3dFactory.setLoadedCallback(() => this._createInstances());
    }

    _createInstances() {
        for (const code in this._registry) {
            const entry = this._registry[code];
            if (!entry.instance) {
                const inst = new Instance();
                inst._load(entry.data, object3dFactory.get('_inst_' + code));
                entry.instance = inst;
            }
        }
        this._executeLoadedCallback();
    }
}

var instanceFactory = new InstanceFactory();
