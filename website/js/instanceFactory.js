class InstanceFactory {
    constructor() {
        this._registry = {};
        this._order    = [];
    }

    reset() {
        this._registry = {};
        this._order    = [];
    }

    isReady() {
        if (Object.keys(this._registry).length === 0) return false;
        if (!object3dFactory.isReady()) return false;

        for (const code in this._registry) {
            const entry = this._registry[code];
            if (!entry.data) return false;
            if (!entry.instance) {
                const inst = new Instance();
                inst._load(entry.data, object3dFactory.get('_inst_' + code));
                entry.instance = inst;
            }
        }
        return true;
    }

    get(code) {
        const entry = this._registry[code];
        if (!entry || !entry.instance) return null;
        return entry.instance;
    }

    getAll() {
        return this._order.map(code => this._registry[code].instance).filter(i => i !== null);
    }

    load(code, url) {
        this._order.push(code);
        this._registry[code] = { data: null, instance: null };
        fetch(loader.buildUrl(url))
            .then(r => r.json())
            .then(data => {
                object3dFactory.load('_inst_' + code, data.object);
                this._registry[code].data = data;
            })
            .catch(e => console.error('Failed to load instance "' + code + '": ' + e));
        return this;
    }
}

var instanceFactory = new InstanceFactory();
