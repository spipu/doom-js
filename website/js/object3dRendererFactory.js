class Object3dRendererFactory {
    getRenderer(code) {
        const map = {
            'webgl': () => new Object3dRendererWebGL(),
            'full':  () => new Object3dRendererFull(),
            'flat':  () => new Object3dRendererFlat(),
            'fast':  () => new Object3dRendererFast(),
        };
        if (!map[code]) throw new Error('Unknown renderer: "' + code + '"');
        const r = map[code]();
        if (r.isAvailable()) return r;
        console.warn('Renderer "' + code + '" is not available, falling back to "full"');
        return map['full']();
    }
}
