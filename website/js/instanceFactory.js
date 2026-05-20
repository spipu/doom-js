class InstanceFactory {
    constructor() {
        this._registry = {};
    }

    reset() {
        this._registry = {};
    }

    isReady() {
        const entries = Object.values(this._registry);
        if (entries.length === 0) return false;
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

    load(code, url) {
        this._registry[code] = { data: null, instance: null };
        fetch(url)
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
