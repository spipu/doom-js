class Object3dRendererList {
    getRenderer(code) {
        const factories = {
            'webgl': () => new Object3dRendererWebGL(),
            'full':  () => new Object3dRendererFull(),
            'flat':  () => new Object3dRendererFlat(),
            'fast':  () => new Object3dRendererFast(),
        };
        if (!factories[code]) {
            throw new Error('Unknown renderer: "' + code + '"');
        }
        const renderer = factories[code]();
        if (renderer.isAvailable()) {
            return renderer;
        }
        console.warn('Renderer "' + code + '" is not available, falling back to "full"');
        return factories['full']();
    }
}
