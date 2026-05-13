class Object3dFactory {
    constructor() {
        this._registry = {};
    }

    create(code) {
        if (this._registry[code]) {
            throw new Error('Object3d "' + code + '" already exists in registry');
        }
        const obj = new Object3d();
        this._registry[code] = obj;
        return obj;
    }

    get(code) {
        const obj = this._registry[code];
        if (!obj || !obj.isReady()) return null;
        return obj;
    }
}

var object3dFactory = new Object3dFactory();
