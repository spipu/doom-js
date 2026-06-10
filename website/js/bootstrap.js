const DEG_TO_RAD = Math.PI / 180;

class Bootstrap {
    constructor() {
        this._version = '1.363';
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

    loadJs(url) {
        document.write('<script src="' + this.buildUrl(url) + '"><\/script>');
    }

    init() {
        [
            '/js/engine/entity/abstractLoadedEntity.js',
            '/js/engine/entity/instance.js',
            '/js/engine/entity/interaction.js',
            '/js/engine/entity/face.js',
            '/js/engine/entity/light.js',
            '/js/engine/entity/object3d.js',
            '/js/engine/entity/texture.js',
            '/js/engine/entity/user.js',
            '/js/engine/entity/world.js',
            '/js/engine/interaction/abstractInteraction.js',
            '/js/engine/interaction/switchInteraction.js',
            '/js/engine/loader/abstractLoader.js',
            '/js/engine/loader/instanceLoader.js',
            '/js/engine/loader/interactionLoader.js',
            '/js/engine/loader/object3dLoader.js',
            '/js/engine/loader/textureLoader.js',
            '/js/engine/loader/worldLoader.js',
            '/js/engine/loader.js',
            '/js/engine/matrix.js',
            '/js/engine/zBuffer.js',
            '/js/engine/renderer/object3dRendererBase.js',
            '/js/engine/renderer/object3dRendererFast.js',
            '/js/engine/renderer/object3dRendererFull.js',
            '/js/engine/renderer/object3dRendererFlat.js',
            '/js/engine/renderer/object3dRendererWebGL.js',
            '/js/engine/renderer/object3dRendererList.js',
            '/js/engine/engine3d.js',
            '/js/engine/collision.js',
            '/js/engine/inputKeyboard.js',
            '/js/engine/inputMouse.js',
            '/js/engine/hud/abstractHud.js',
            '/js/engine/hud/hudDebug.js',
            '/js/engine/screenManager.js',
        ].forEach(url => this.loadJs(url));
    }
}

var bootstrap = new Bootstrap();
bootstrap.init();
