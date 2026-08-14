/**
 * Texture registry of the converter: composes the wall textures (TEXTURE1/2 +
 * patches), decodes the flats, and registers each produced ImageData directly
 * in the engine TextureLoader (in-memory, no file ever written).
 *
 * Indices are 0-based and shared between walls and flats (like the Python
 * tex_paths list); the name registry prefixes flats with 'FLAT_' to avoid
 * collisions with wall textures of the same name.
 */
class WadTextureBank {
    /**
     * @param {WadFile}             wadFile
     * @param {WadPalette}          palette
     * @param {AbstractGameProfile} profile
     */
    constructor(wadFile, palette, profile) {
        this._wadFile = wadFile;
        this._palette = palette;
        this._profile = profile;

        this._pnames      = [];
        this._patches     = {};   // name → DataView
        this._flats       = {};   // name → DataView (insertion order = WAD order)
        this._wallTexDir  = {};   // name → {dv, offset} (pre-indexed TEXTURE1/2)
        this._wallNames   = [];   // ordered wall texture names (for ANIMATED)
        this._switchPairs = {};   // SW1 name ↔ SW2 name

        this._texList  = [];      // index → {name, loaderId, width, height}
        this._texIndex = {};      // name (or 'FLAT_'+name) → index
    }

    init() {
        this._initPnames();
        this._initPatches();
        this._flats = this._wadFile.getLumpsBetween('F_START', 'F_END');
        this._initWallTexDir();
        this._initSwitchPairs();

        return this;
    }

    // --- Texture registry ---

    /**
     * @param {string} name
     * @returns {int} 0-based texture index, or -1 if absent
     */
    ensureWallTex(name) {
        if (!name || name === '-') {
            return -1;
        }
        if (this._texIndex[name] !== undefined) {
            return this._texIndex[name];
        }

        const image = this._buildWallTexture(name);
        if (image === null) {
            console.warn('WadTextureBank - wall texture "' + name + '" not found');
            return -1;
        }

        return this._register(name, name, image);
    }

    /**
     * @param {string} name
     * @returns {int} 0-based texture index, or -1 if absent
     */
    ensureFlatTex(name) {
        if (!name || name === '-') {
            return -1;
        }
        const key = 'FLAT_' + name;
        if (this._texIndex[key] !== undefined) {
            return this._texIndex[key];
        }

        const dv = this._flats[name];
        if (dv === undefined) {
            console.warn('WadTextureBank - flat "' + name + '" not found');
            return -1;
        }

        return this._register(key, name, WadPicture.flatToImageData(dv, this._palette));
    }

    /**
     * Sky texture: composed like a wall, then prepared by _prepareSky — the dead
     * bottom rows (Doom sky textures pad the bottom with transparent or pure-black
     * rows, e.g. doom1 SKY1 = 8 empty rows) are cropped so the texture stops at
     * its real content, and any stray transparent pixels are filled horizontally
     * so it is fully OPAQUE. Otherwise Texture.isAlpha() flags it → the WebGL
     * renderer falls back to NEAREST (pixelated) and the dead area shows as black
     * streaks. Cached under a dedicated 'SKY_' key so a same-named wall texture
     * keeps its own (alpha-preserving) entry.
     *
     * @param {string} name
     * @returns {int} 0-based texture index, or -1 if absent
     */
    ensureSkyTex(name) {
        if (!name || name === '-') {
            return -1;
        }
        const key = 'SKY_' + name;
        if (this._texIndex[key] !== undefined) {
            return this._texIndex[key];
        }

        const raw = this._buildWallTexture(name);
        if (raw === null) {
            console.warn('WadTextureBank - sky texture "' + name + '" not found');
            return -1;
        }

        return this._register(key, name, WadTextureBank._prepareSky(raw));
    }

    count() {
        return this._texList.length;
    }

    getName(index) {
        return this._texList[index].name;
    }

    getLoaderId(index) {
        return this._texList[index].loaderId;
    }

    getDims(index) {
        return {width: this._texList[index].width, height: this._texList[index].height};
    }

    /**
     * @param {string} name
     * @returns {int|null} wall texture height in Doom units, null if absent
     */
    wallTextureHeight(name) {
        const index = this.ensureWallTex(name);
        return ((index >= 0) ? this._texList[index].height : null);
    }

    /**
     * SW1 ↔ SW2 partner of a switch texture (SWITCHES lump, or name substitution).
     *
     * @param {string} name
     * @returns {string|null}
     */
    getSwitchPartner(name) {
        if (this._switchPairs[name] !== undefined) {
            return this._switchPairs[name];
        }
        if (name.startsWith('SW1')) {
            return 'SW2' + name.substring(3);
        }
        if (name.startsWith('SW2')) {
            return 'SW1' + name.substring(3);
        }

        return null;
    }

    getOrderedFlatNames() {
        return Object.keys(this._flats);
    }

    getOrderedWallNames() {
        return this._wallNames;
    }

    // --- Internal ---

    _register(key, name, image) {
        const index = this._texList.length;
        const loaderId = loader.textures().loadFromData(null, image);
        this._texList.push({name: name, loaderId: loaderId, width: image.width, height: image.height});
        this._texIndex[key] = index;

        return index;
    }

    /**
     * Compose a wall texture from its patch list (equiv. build_wall_texture).
     *
     * @returns {ImageData|null}
     */
    _buildWallTexture(name) {
        const entry = this._wallTexDir[name];
        if (entry === undefined) {
            return null;
        }

        const dv = entry.dv;
        const o  = entry.offset;
        const w  = dv.getUint16(o + 12, true);
        const h  = dv.getUint16(o + 14, true);
        const pc = dv.getUint16(o + 20, true);

        const image = new ImageData(w, h);
        for (let p = 0; p < pc; p++) {
            const po = o + 22 + p * 10;
            const ox = dv.getInt16(po, true);
            const oy = dv.getInt16(po + 2, true);
            const pi = dv.getUint16(po + 4, true);
            if (pi >= this._pnames.length) {
                continue;
            }
            const patchData = this._patches[this._pnames[pi]];
            if (patchData === undefined) {
                continue;
            }
            const patch = WadPicture.patchToImageData(patchData, this._palette);
            WadPicture.pastePatch(image, patch, ox, oy);
        }

        return image;
    }

    _initPnames() {
        const dv = this._wadFile.getLump('PNAMES');
        if (dv === null) {
            return;
        }
        const count = dv.getUint32(0, true);
        for (let i = 0; i < count; i++) {
            this._pnames.push(this._readName(dv, 4 + i * 8, 8));
        }
    }

    _initPatches() {
        this._patches = this._wadFile.getLumpsBetween('P_START', 'P_END');
        if (Object.keys(this._patches).length === 0) {
            this._patches = this._wadFile.getLumpsBetween('PP_START', 'PP_END');
        }
        if (Object.keys(this._patches).length === 0) {
            // Last resort: collect patch lumps by name from PNAMES
            for (const pn of this._pnames) {
                const dv = this._wadFile.getLump(pn);
                if (dv !== null && dv.byteLength > 8) {
                    this._patches[pn] = dv;
                }
            }
        }
    }

    _initWallTexDir() {
        for (const lumpName of ['TEXTURE1', 'TEXTURE2']) {
            const dv = this._wadFile.getLump(lumpName);
            if (dv === null) {
                continue;
            }
            const count = dv.getUint32(0, true);
            for (let i = 0; i < count; i++) {
                const offset = dv.getUint32(4 + i * 4, true);
                const name = this._readName(dv, offset, 8);
                if (this._wallTexDir[name] === undefined) {
                    this._wallTexDir[name] = {dv: dv, offset: offset};
                    this._wallNames.push(name);
                }
            }
        }
    }

    _initSwitchPairs() {
        // Engine-hardcoded pairs of the game profile first (e.g. Heretic's
        // SW1OFF ↔ SW1ON), then the SWITCHES lump overrides when present —
        // the WAD data always wins over the profile fallback.
        for (const pair of this._profile.switchPairs()) {
            this._switchPairs[pair[0]] = pair[1];
            this._switchPairs[pair[1]] = pair[0];
        }

        const dv = this._wadFile.getLump('SWITCHES');
        if (dv === null) {
            return;
        }
        let i = 0;
        while (i + 20 <= dv.byteLength) {
            const n1 = this._readName(dv, i, 9);
            const n2 = this._readName(dv, i + 9, 9);
            if (n1 === '') {
                break;
            }
            this._switchPairs[n1] = n2;
            this._switchPairs[n2] = n1;
            i += 20;
        }
    }

    /**
     * Prepare a sky texture: crop the contiguous dead bottom rows (every pixel
     * transparent or near-black — the padding Doom adds below the sky image) so
     * the texture stops exactly at its real content, then fill any stray
     * transparent pixels horizontally so it is fully opaque (→ LINEAR filtering).
     * Never stretches vertically: the texture ends sharp, the background shows
     * below the horizon (the sky shader does the cut).
     *
     * @returns {ImageData}
     */
    static _prepareSky(image) {
        const w = image.width;
        const d = image.data;
        let h = image.height;
        while (h > 1 && WadTextureBank._isDeadRow(d, w, h - 1)) {
            h--;
        }
        const out = new ImageData(w, h);
        out.data.set(d.subarray(0, w * h * 4));   // dead rows are at the bottom → keep the top h rows
        WadTextureBank._fillTransparentHorizontally(out);

        return out;
    }

    /**
     * A row is "dead" when no pixel is real (each is transparent or near-black).
     */
    static _isDeadRow(d, w, y) {
        const row = y * w * 4;
        for (let x = 0; x < w; x++) {
            const p = row + x * 4;
            if (d[p + 3] >= 255 && (d[p] + d[p + 1] + d[p + 2]) > 6) {
                return false;
            }
        }

        return true;
    }

    /**
     * Fill transparent pixels from the nearest opaque pixel on the same row
     * (forward then backward pass) — closes any column gaps without ever
     * stretching vertically. Leaves a fully-transparent row untouched.
     */
    static _fillTransparentHorizontally(image) {
        const w = image.width;
        const h = image.height;
        const d = image.data;
        for (let y = 0; y < h; y++) {
            const row = y * w * 4;
            let lr = 0;
            let lg = 0;
            let lb = 0;
            let have = false;
            for (let x = 0; x < w; x++) {
                const p = row + x * 4;
                if (d[p + 3] >= 255) {
                    lr = d[p];
                    lg = d[p + 1];
                    lb = d[p + 2];
                    have = true;
                } else if (have) {
                    d[p]     = lr;
                    d[p + 1] = lg;
                    d[p + 2] = lb;
                    d[p + 3] = 255;
                }
            }
            have = false;
            for (let x = w - 1; x >= 0; x--) {
                const p = row + x * 4;
                if (d[p + 3] >= 255) {
                    lr = d[p];
                    lg = d[p + 1];
                    lb = d[p + 2];
                    have = true;
                } else if (have) {
                    d[p]     = lr;
                    d[p + 1] = lg;
                    d[p + 2] = lb;
                    d[p + 3] = 255;
                }
            }
        }
    }

    _readName(dv, offset, length) {
        let name = '';
        for (let i = 0; i < length; i++) {
            const charCode = dv.getUint8(offset + i);
            if (charCode === 0) {
                break;
            }
            name += String.fromCharCode(charCode);
        }

        return name.toUpperCase();
    }
}
