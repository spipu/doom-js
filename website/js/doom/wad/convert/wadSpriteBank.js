/**
 * Sprite registry of the converter: decodes Doom sprite lumps (those between
 * the S_START / S_END markers, same patch format as wall patches) and registers
 * each produced ImageData directly in the engine TextureLoader (in-memory).
 *
 * A sprite lump is named <prefix><frame><rotation>, e.g. 'MEDIA0' (medikit,
 * frame A, rotation 0). Decorations and pickups are non-rotating, so their
 * world sprite is the rotation-0 lump (…A0); that full lump name is what a Doom
 * definition stores in its `sprite` field. Results are cached by name.
 *
 * The patch header is: width@0, height@2, leftOffset@4, topOffset@6 (both signed),
 * then the column offset table @8. The offsets are read here for anchoring.
 */
class WadSpriteBank {
    /**
     * @param {WadFile}    wadFile
     * @param {WadPalette} palette
     */
    constructor(wadFile, palette) {
        this._wadFile = wadFile;
        this._palette = palette;

        this._sprites  = {};    // name → DataView
        this._cache    = {};    // name → {loaderId, width, height, leftOffset, topOffset}
        this._rotIndex = null;  // 'PREFXFR' (prefix+frame+rotation) → {lump, mirrored}
        this._warned   = new Set();
    }

    init() {
        this._sprites = this._wadFile.getLumpsBetween('S_START', 'S_END');
        if (Object.keys(this._sprites).length === 0) {
            this._sprites = this._wadFile.getLumpsBetween('SS_START', 'SS_END');
        }

        return this;
    }

    // True if the lump exists in the WAD, without decoding or warning — used to
    // probe whether a weapon is present before deciding to decode its frames.
    has(name) {
        return (this._sprites[name] !== undefined);
    }

    /**
     * Decode a sprite lump and register its texture (cached). Returns its loader
     * id + pixel dimensions + Doom offsets, or null if the lump is absent.
     *
     * @param {string} name full sprite lump name (e.g. 'MEDIA0')
     * @returns {object|null}
     */
    get(name) {
        if (this._cache[name] !== undefined) {
            return this._cache[name];
        }

        const dv = this._sprites[name];
        if (dv === undefined) {
            console.warn('WadSpriteBank - sprite "' + name + '" not found');
            return null;
        }

        const entry = {
            loaderId:   loader.textures().loadFromData(null, WadPicture.patchToImageData(dv, this._palette)),
            width:      dv.getUint16(0, true),
            height:     dv.getUint16(2, true),
            leftOffset: dv.getInt16(4, true),
            topOffset:  dv.getInt16(6, true)
        };
        this._cache[name] = entry;

        return entry;
    }

    /**
     * The 8 rotation views of a frame, for monsters (rotation 1 = facing the
     * viewer). A rotation lump can be shared by two views: an 8-char name like
     * 'TROOA2A8' carries the normal view at chars 4-5 and the mirrored one at
     * chars 6-7 (either order exists in the wild, both are indexed). Returns
     * 8 entries (rotations 1..8, format of get()), or 1 entry (the rotation-0
     * lump) when the rotation set is incomplete, or null when nothing exists.
     *
     * @param {string} base  4-char sprite prefix (e.g. 'TROO')
     * @param {string} letter frame letter (e.g. 'A')
     * @returns {object[]|null}
     */
    getFrameRotations(base, letter) {
        if (this._rotIndex === null) {
            this._buildRotationIndex();
        }

        const views = [];
        for (let rot = 1; rot <= 8; rot++) {
            const ref = this._rotIndex[base + letter + rot];
            if (ref === undefined) {
                break;
            }
            const entry = ((ref.mirrored) ? this._getMirrored(ref.lump) : this.get(ref.lump));
            if (entry === null) {
                break;
            }
            views.push(entry);
        }
        if (views.length === 8) {
            return views;
        }

        if (this.has(base + letter + '0')) {
            return [this.get(base + letter + '0')];
        }

        const key = base + letter;
        if (!this._warned.has(key)) {
            this._warned.add(key);
            console.warn('WadSpriteBank - no usable rotation set for "' + key + '"');
        }
        return null;
    }

    // One pass over the lump names: a 6-char name holds one (frame, rotation)
    // pair at chars 4-5, an 8-char name holds a second, mirrored pair at 6-7.
    _buildRotationIndex() {
        this._rotIndex = {};
        for (const name of Object.keys(this._sprites)) {
            if (name.length >= 6) {
                this._rotIndex[name.slice(0, 4) + name[4] + name[5]] = {lump: name, mirrored: false};
            }
            if (name.length === 8) {
                this._rotIndex[name.slice(0, 4) + name[6] + name[7]] = {lump: name, mirrored: true};
            }
        }
    }

    // Mirrored variant of a rotation lump: horizontally flipped pixels in a new
    // texture, and the anchor mirrored with them (leftOffset' = width − leftOffset).
    _getMirrored(name) {
        const key = name + '|M';
        if (this._cache[key] !== undefined) {
            return this._cache[key];
        }

        const dv = this._sprites[name];
        if (dv === undefined) {
            console.warn('WadSpriteBank - sprite "' + name + '" not found');
            return null;
        }

        const src     = WadPicture.patchToImageData(dv, this._palette);
        const flipped = new ImageData(src.width, src.height);
        for (let y = 0; y < src.height; y++) {
            const row = y * src.width * 4;
            for (let x = 0; x < src.width; x++) {
                const from = row + x * 4;
                const to   = row + (src.width - 1 - x) * 4;
                flipped.data[to]     = src.data[from];
                flipped.data[to + 1] = src.data[from + 1];
                flipped.data[to + 2] = src.data[from + 2];
                flipped.data[to + 3] = src.data[from + 3];
            }
        }

        const entry = {
            loaderId:   loader.textures().loadFromData(null, flipped),
            width:      dv.getUint16(0, true),
            height:     dv.getUint16(2, true),
            leftOffset: dv.getUint16(0, true) - dv.getInt16(4, true),
            topOffset:  dv.getInt16(6, true)
        };
        this._cache[key] = entry;

        return entry;
    }
}
