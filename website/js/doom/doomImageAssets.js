/**
 * Raw ImageData of the PNGs drawn from outside the WAD (impact decals, splash
 * masks), decoded once at startup: loader.reset() wipes the engine textures at
 * every level, so the consumers re-register them from here in each load batch.
 *
 * Every profile's imageAssets() manifests ({basePath, keys}) are loaded, since
 * the game is only known once a WAD is chosen. Keys must be unique across all
 * manifests; a profile may reuse another's keys (Heretic reuses Doom's decals).
 *
 * The decals are third-party GPL v3 assets (see website/assets/uzdoom/).
 */
class DoomImageAssets {
    constructor() {
        this._imageData = {};
        this._ready     = false;
    }

    isReady() {
        return this._ready;
    }

    get(key) {
        return ((this._imageData[key] !== undefined) ? this._imageData[key] : null);
    }

    load(callback = null) {
        const files = [];
        const seen  = new Set();
        for (const profile of new GameProfileList().getAll()) {
            for (const manifest of profile.imageAssets()) {
                for (const key of manifest.keys) {
                    if (!seen.has(key)) {
                        seen.add(key);
                        files.push({key: key, url: manifest.basePath + key + '.png'});
                    }
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
                this._imageData[file.key] = ctx.getImageData(0, 0, img.width, img.height);
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

const doomImageAssets = new DoomImageAssets();
