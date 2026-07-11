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

        this._sprites = {};   // name → DataView
        this._cache   = {};   // name → {loaderId, width, height, leftOffset, topOffset}
    }

    init() {
        this._sprites = this._wadFile.getLumpsBetween('S_START', 'S_END');
        if (Object.keys(this._sprites).length === 0) {
            this._sprites = this._wadFile.getLumpsBetween('SS_START', 'SS_END');
        }

        return this;
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
}
