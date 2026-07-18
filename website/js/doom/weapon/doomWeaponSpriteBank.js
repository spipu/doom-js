// Decodes weapon view sprites and muzzle-flash frames (S_START/S_END) into
// engine textures, ready for the WebGL view-sprite pass. Built per level (the
// loader is reset each level); a missing lump (e.g. the SSG in Doom 1) yields
// null and the caller simply draws nothing.
class DoomWeaponSpriteBank {
    constructor(wadFile) {
        this._bank  = new WadSpriteBank(wadFile, new WadPalette(wadFile)).init();
        this._cache = {};
    }

    // Decode a set of lumps eagerly (called inside the level load batch so no
    // texture is registered mid-render, which would re-trigger the loader).
    decode(lumps) {
        for (const lump of lumps) {
            this.get(lump);
        }
        return this;
    }

    get(lump) {
        if (this._cache[lump] !== undefined) {
            return this._cache[lump];
        }
        const spr   = this._bank.get(lump);
        const entry = ((spr === null) ? null : {
            texId:      spr.loaderId,
            width:      spr.width,
            height:     spr.height,
            leftOffset: spr.leftOffset,
            topOffset:  spr.topOffset,
        });
        this._cache[lump] = entry;
        return entry;
    }
}
