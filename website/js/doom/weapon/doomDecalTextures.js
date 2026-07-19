// Source pixels of the impact-decal graphics, decoded ONCE at app startup and
// kept across level changes. loader.reset() wipes engine textures at every
// level, but these graphics are level-independent, so their raw ImageData is
// cached here and re-registered per level (in the load batch) by DoomDecals.
//
// WHICH graphics exist is per-game data: every registered game profile
// contributes its decalAssets() manifest ({basePath, keys}), all loaded at
// startup since the WAD (hence the game) is only known later. Keys must be
// unique across games — each profile's decalTemplates() only ever references
// its own keys.
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

    // Fetch + decode every profile's decal PNGs; the optional callback fires
    // once all are ready. Cheap (a few tiny images per game) and kicked off at
    // startup, so the textures are decoded long before the first level build.
    load(callback = null) {
        const files = [];
        const seen  = new Set();
        for (const profile of new GameProfileList().getAll()) {
            const assets = profile.decalAssets();
            for (const key of assets.keys) {
                if (!seen.has(key)) {
                    seen.add(key);
                    files.push({key: key, url: assets.basePath + key + '.png'});
                }
            }
        }
        if (files.length === 0) {
            this._ready = true;
            if (callback !== null) {
                callback();
            }
            return;
        }

        let pending = files.length;
        for (const file of files) {
            const img = new Image();
            img.onload = () => {
                const canvas  = document.createElement('canvas');
                canvas.width  = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                this._data[file.key] = ctx.getImageData(0, 0, img.width, img.height);
                pending -= 1;
                if (pending === 0) {
                    this._ready = true;
                    if (callback !== null) {
                        callback();
                    }
                }
            };
            img.src = appBootstrap.buildUrl(file.url);
        }
    }
}

// Global instance (loaded once from doom/main.js), mirroring the engine's other
// singletons (loader, appBootstrap).
const doomDecalTextures = new DoomDecalTextures();
