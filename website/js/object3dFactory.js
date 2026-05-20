class Object3dFactory {
    constructor() {
        this._registry = {};
    }

    reset() {
        this._registry = {};
    }

    isReady() {
        const entries = Object.values(this._registry);
        if (entries.length === 0) return false;
        return entries.every(obj => obj.isReady());
    }

    get(code) {
        const obj = this._registry[code];
        if (!obj || !obj.isReady()) return null;
        return obj;
    }

    create(code) {
        if (this._registry[code]) {
            throw new Error('Object3d "' + code + '" already exists in registry');
        }
        const obj = new Object3d();
        this._registry[code] = obj;
        return obj;
    }

    load(code, url) {
        const obj = this.create(code);
        fetch(url)
            .then(r => r.json())
            .then(data => {
                (data.textures || []).forEach(t => obj.textureAdd(t));
                data.points.forEach(p => obj.ptAdd(p[0], p[1], p[2]));
                data.faces.forEach(f => obj.fcAdd(
                    f.pts[0], f.pts[1], f.pts[2],
                    f.color   !== undefined ? f.color   : null,
                    f.texture !== undefined ? f.texture : null,
                    f.map     !== undefined ? f.map     : null
                ));
                obj.ready();
            })
            .catch(e => console.error('Failed to load "' + code + '": ' + e));
        return obj;
    }
}

var object3dFactory = new Object3dFactory();
