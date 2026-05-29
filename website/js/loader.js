class Loader {
    constructor() {
        this._version = '1.266';
    }

    getVersion() {
        return this._version;
    }

    buildUrl(asset) {
        return asset + '?v=' + this._version;
    }

    init() {
        [
            'js/constants.js',
            'js/matrix.js',
            'js/light.js',
            'js/abstractLoader.js',
            'js/texture.js',
            'js/object3d.js',
            'js/zBuffer.js',
            'js/object3dRendererBase.js',
            'js/object3dRendererFast.js',
            'js/object3dRendererFull.js',
            'js/object3dRendererFlat.js',
            'js/object3dRendererWebGL.js',
            'js/object3dRendererFactory.js',
            'js/engine3d.js',
            'js/object3dFactory.js',
            'js/instance.js',
            'js/instanceFactory.js',
            'js/collision.js',
            'js/inputKeyboard.js',
            'js/inputMouse.js',
            'js/user.js',
            'js/debug.js',
            'js/world.js',
        ].forEach(src => document.write('<script src="' + this.buildUrl(src) + '"><\/script>'));
    }
}

var loader = new Loader();
loader.init();
