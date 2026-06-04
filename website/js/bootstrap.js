const DEG_TO_RAD = Math.PI / 180;

class Bootstrap {
    constructor() {
        this._version = '1.329';
    }

    getVersion() {
        return this._version;
    }

    buildUrl(asset) {
        return asset + '?v=' + this._version;
    }

    fetchJson(url, callback) {
        fetch(this.buildUrl(url))
            .then(r => {
                if (!r.ok) {
                    throw new Error('HTTP ' + r.status + ' ' + r.statusText);
                }
                return r.json();
            })
            .then(data => callback(data))
            .catch(e => console.error('Failed to load "' + url + '": ' + e));
    }

    init() {
        [
            'js/entity/abstractLoadedEntity.js',
            'js/entity/instance.js',
            'js/entity/face.js',
            'js/entity/light.js',
            'js/entity/object3d.js',
            'js/entity/texture.js',
            'js/entity/user.js',
            'js/entity/world.js',
            'js/loader/abstractLoader.js',
            'js/loader/instanceLoader.js',
            'js/loader/object3dLoader.js',
            'js/loader/textureLoader.js',
            'js/loader/worldLoader.js',
            'js/loader.js',
            'js/matrix.js',
            'js/zBuffer.js',
            'js/renderer/object3dRendererBase.js',
            'js/renderer/object3dRendererFast.js',
            'js/renderer/object3dRendererFull.js',
            'js/renderer/object3dRendererFlat.js',
            'js/renderer/object3dRendererWebGL.js',
            'js/renderer/object3dRendererList.js',
            'js/engine3d.js',
            'js/collision.js',
            'js/inputKeyboard.js',
            'js/inputMouse.js',
            'js/debug.js',
        ].forEach(src => document.write('<script src="' + this.buildUrl(src) + '"><\/script>'));
    }
}

var bootstrap = new Bootstrap();
bootstrap.init();
