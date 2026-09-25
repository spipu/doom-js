/**
 * Texture registry of the converter: composes the wall textures (TEXTURE1/2 +
 * patches), decodes the flats, and registers each produced ImageData directly
 * in the engine TextureLoader (in-memory, no file ever written).
 *
 * Indices are 0-based and shared between walls and flats; flats are keyed
 * 'FLAT_' + name so a same-named wall texture does not collide.
 */
class WadTextureBank {
    /**
     * @param {WadFile}             wadFile
     * @param {WadPalette}          palette
     * @param {AbstractGameProfile} profile
     * @param {WadTerrainBank}      terrainBank
     */
    constructor(wadFile, palette, profile, terrainBank) {
        this._wadFile = wadFile;
        this._palette = palette;
        this._profile = profile;
        this._terrainBank = terrainBank;

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
        if (WadTextureBank.isBlank(name)) {
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
        if (WadTextureBank.isBlank(name)) {
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
     * Sky texture: composed like a wall, then made opaque by _prepareSky. Keyed
     * 'SKY_' + name so a same-named wall texture keeps its alpha.
     *
     * @param {string} name
     * @returns {int} 0-based texture index, or -1 if absent
     */
    ensureSkyTex(name) {
        if (WadTextureBank.isBlank(name)) {
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
     * Metrics probe (P_FindShortestTextureAround) read from the TEXTURE1/2
     * header, without composing the texture. A blank name is texture 0 in
     * vanilla (R_TextureNumForName): that quirk keeps the raiseToTexture
     * blocks at their original height.
     *
     * @param {string} name
     * @returns {int|null} wall texture height in Doom units, null if absent
     */
    wallTextureHeight(name) {
        const entry = this._wallTexDir[((WadTextureBank.isBlank(name)) ? this._wallNames[0] : name)];
        return ((entry !== undefined) ? WadTextureBank._headerDims(entry).height : null);
    }

    /**
     * @param {string|null|undefined} name
     * @returns {boolean} true for the '-' placeholder or no name at all
     */
    static isBlank(name) {
        return (!name || (name === WadTextureBank.BLANK_NAME));
    }

    // TEXTURE1/2 header metrics of a directory entry (width at +12, height at +14).
    static _headerDims(entry) {
        return {
            width:  entry.dv.getUint16(entry.offset + 12, true),
            height: entry.dv.getUint16(entry.offset + 14, true)
        };
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

        const dv     = entry.dv;
        const offset = entry.offset;
        const {width: w, height: h} = WadTextureBank._headerDims(entry);
        const patchCount = dv.getUint16(offset + 20, true);

        const image = new ImageData(w, h);
        for (let p = 0; p < patchCount; p++) {
            const patchOffset = offset + 22 + p * 10;
            const ox = dv.getInt16(patchOffset, true);
            const oy = dv.getInt16(patchOffset + 2, true);
            const pnameIndex = dv.getUint16(patchOffset + 4, true);
            if (pnameIndex >= this._pnames.length) {
                continue;
            }
            const patchLump = this._patches[this._pnames[pnameIndex]];
            if (patchLump === undefined) {
                continue;
            }
            const patch = WadPicture.patchToImageData(patchLump, this._palette);
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
            this._pnames.push(WadFile.readName(dv, 4 + i * 8, 8).toUpperCase());
        }
    }

    _initPatches() {
        this._patches = this._wadFile.getLumpsBetween('P_START', 'P_END');
        if (Object.keys(this._patches).length === 0) {
            this._patches = this._wadFile.getLumpsBetween('PP_START', 'PP_END');
        }
        if (Object.keys(this._patches).length === 0) {
            // No patch markers: look the PNAMES entries up by name.
            for (const pn of this._pnames) {
                const dv = this._wadFile.getLump(pn);
                if ((dv !== null) && (dv.byteLength > 8)) {
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
                const name = WadFile.readName(dv, offset, 8).toUpperCase();
                if (this._wallTexDir[name] === undefined) {
                    this._wallTexDir[name] = {dv: dv, offset: offset};
                    this._wallNames.push(name);
                }
            }
        }
    }

    isLiquidFlat(name) {
        return this._terrainBank.isLiquid(name);
    }

    _initSwitchPairs() {
        // Profile pairs (Heretic's SW1OFF ↔ SW1ON), overridden by the SWITCHES lump.
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
            const sw1Name = WadFile.readName(dv, i, 9).toUpperCase();
            const sw2Name = WadFile.readName(dv, i + 9, 9).toUpperCase();
            if (sw1Name === '') {
                break;
            }
            this._switchPairs[sw1Name] = sw2Name;
            this._switchPairs[sw2Name] = sw1Name;
            i += 20;
        }
    }

    /**
     * Crops the dead bottom rows Doom pads its skies with (doom1 SKY1: 8), then
     * fills stray transparent pixels: an alpha texture would get NEAREST
     * filtering in WebGL and show the dead rows as black streaks.
     *
     * @returns {ImageData}
     */
    static _prepareSky(image) {
        const w = image.width;
        const pixels = image.data;
        let h = image.height;
        while ((h > 1) && WadTextureBank._isDeadRow(pixels, w, h - 1)) {
            h--;
        }
        const cropped = new ImageData(w, h);
        cropped.data.set(pixels.subarray(0, w * h * 4));
        WadTextureBank._fillTransparentHorizontally(cropped);

        return cropped;
    }

    // Dead: every pixel transparent or near-black.
    static _isDeadRow(pixels, w, y) {
        const row = y * w * 4;
        for (let x = 0; x < w; x++) {
            const p = row + x * 4;
            if ((pixels[p + 3] >= 255) && ((pixels[p] + pixels[p + 1] + pixels[p + 2]) > 6)) {
                return false;
            }
        }

        return true;
    }

    // Forward then backward pass copying the last opaque pixel of the row.
    static _fillTransparentHorizontally(image) {
        const w = image.width;
        const h = image.height;
        const pixels = image.data;
        for (let y = 0; y < h; y++) {
            const row = y * w * 4;
            let lastR = 0;
            let lastG = 0;
            let lastB = 0;
            let hasOpaque = false;
            for (let x = 0; x < w; x++) {
                const p = row + x * 4;
                if (pixels[p + 3] >= 255) {
                    lastR = pixels[p];
                    lastG = pixels[p + 1];
                    lastB = pixels[p + 2];
                    hasOpaque = true;
                } else if (hasOpaque) {
                    pixels[p]     = lastR;
                    pixels[p + 1] = lastG;
                    pixels[p + 2] = lastB;
                    pixels[p + 3] = 255;
                }
            }
            hasOpaque = false;
            for (let x = w - 1; x >= 0; x--) {
                const p = row + x * 4;
                if (pixels[p + 3] >= 255) {
                    lastR = pixels[p];
                    lastG = pixels[p + 1];
                    lastB = pixels[p + 2];
                    hasOpaque = true;
                } else if (hasOpaque) {
                    pixels[p]     = lastR;
                    pixels[p + 1] = lastG;
                    pixels[p + 2] = lastB;
                    pixels[p + 3] = 255;
                }
            }
        }
    }

}

WadTextureBank.BLANK_NAME = '-';
