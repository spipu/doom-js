/**
 * Per-game translation of the level specials (GZDoom xlat approach), applied
 * once on the parsed level so every later pass only sees the internal codes
 * of the WadConstants tables. Identity for Doom.
 */
class WadSpecialTranslator {
    /**
     * @param {AbstractGameProfile} profile
     */
    constructor(profile) {
        this._profile = profile;
    }

    /**
     * @param {{linedefs: object[], sectors: object[]}} level remapped in place
     */
    translate(level) {
        this._remapSpecials(level.linedefs, this._profile.linedefSpecialMap());
        this._remapSpecials(level.sectors, this._profile.sectorSpecialMap());
    }

    _remapSpecials(entries, specialMap) {
        for (const entry of entries) {
            const mapped = specialMap[entry.special];
            if (mapped !== undefined) {
                entry.special = mapped;
            }
        }
    }
}
