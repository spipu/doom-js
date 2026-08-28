/**
 * Decodes weapon view sprites and muzzle-flash frames (S_START/S_END) into
 * engine textures, ready for the WebGL view-sprite pass. Built per level (the
 * loader is reset each level); a missing lump (e.g. the SSG in Doom 1) yields
 * null and the caller simply draws nothing.
 */
class DoomWeaponSpriteBank {
    constructor(wadFile) {
        this._bank  = new WadSpriteBank(wadFile, new WadPalette(wadFile)).init();
        this._cache = {};
    }

    // True if the lump exists in the WAD (no decode, no warning).
    has(lump) {
        return this._bank.has(lump);
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

        return this._store(lump, this._bank.get(lump));
    }

    /**
     * One rotation view of a frame (a flying projectile's single billboard),
     * resolved through the rotation index so a mirrored lump is found too.
     *
     * @param {string[]} preference rotations to try, best first
     * @returns {object|null}
     */
    getFrameView(base, letter, preference) {
        const key = base + letter + '|' + preference.join('');
        if (this._cache[key] !== undefined) {
            return this._cache[key];
        }

        return this._store(key, this._bank.getFrameView(base, letter, preference));
    }

    // Cache one decoded sprite under `key`, in the shape the view pass wants.
    _store(key, spr) {
        const entry = ((spr === null) ? null : {
            texId:      spr.loaderId,
            width:      spr.width,
            height:     spr.height,
            leftOffset: spr.leftOffset,
            topOffset:  spr.topOffset,
        });
        this._cache[key] = entry;

        return entry;
    }
}
