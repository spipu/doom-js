// Source pixels of the UZDoom impact-decal graphics, decoded ONCE at app startup
// and kept across level changes. loader.reset() wipes engine textures at every
// level, but these graphics are level-independent, so their raw ImageData is
// cached here and re-registered per level (in the load batch) by DoomDecals.
//
// The PNGs are grayscale intensity masks (fully opaque, black background): the
// luminance IS the coverage. DoomDecals colourises them with the decaldef
// `shade` at registration time (luminance → alpha, shade → RGB).
//
// These are third-party GPL v3 assets (see website/assets/uzdoom/) — the only
// non-MIT files in the project; the rest of the engine stays asset-free.
class DoomDecalTextures {
    constructor() {
        this._data  = {};      // key → raw ImageData
        this._ready = false;
    }

    isReady() {
        return this._ready;
    }

    // Raw grayscale ImageData for a decal key, or null if not decoded.
    get(key) {
        return ((this._data[key] !== undefined) ? this._data[key] : null);
    }

    // Fetch + decode every decal PNG; the optional callback fires once all are
    // ready. Cheap (12 tiny images) and kicked off at startup, so the textures
    // are decoded long before the first level is built.
    load(callback = null) {
        let pending = DoomDecalTextures.FILES.length;
        for (const key of DoomDecalTextures.FILES) {
            const img = new Image();
            img.onload = () => {
                const canvas  = document.createElement('canvas');
                canvas.width  = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                this._data[key] = ctx.getImageData(0, 0, img.width, img.height);
                pending -= 1;
                if (pending === 0) {
                    this._ready = true;
                    if (callback !== null) {
                        callback();
                    }
                }
            };
            img.src = appBootstrap.buildUrl('/assets/uzdoom/sprite/' + key + '.png');
        }
    }
}

DoomDecalTextures.FILES = [
    'chip1', 'chip2', 'chip3', 'chip4', 'chip5',
    'scorch1', 'plasma1', 'plasma2',
    'bfglite1', 'bfglite2', 'bfgscrc1', 'bfgscrc2',
];

// Global instance (loaded once from doom/main.js), mirroring the engine's other
// singletons (loader, appBootstrap).
const doomDecalTextures = new DoomDecalTextures();
