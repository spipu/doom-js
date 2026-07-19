/**
 * Per-game translation of the level specials (GZDoom xlat approach): applied
 * ONCE on the freshly parsed level, before any analyzer/builder consumes it,
 * so the whole pipeline (build + runtime interactions) only ever sees the
 * internal special codes of the WadConstants tables. Identity for Doom —
 * the translation maps are empty, the level data is untouched.
 */
class WadSpecialTranslator {
    /**
     * @param {AbstractGameProfile} profile
     */
    constructor(profile) {
        this._profile = profile;
    }

    /**
     * Remap linedefs[].special and sectors[].special in place.
     *
     * @param {{linedefs: object[], sectors: object[]}} level
     */
    translate(level) {
        this._apply(level.linedefs, this._profile.linedefSpecialMap());
        this._apply(level.sectors, this._profile.sectorSpecialMap());
    }

    _apply(entries, map) {
        for (const entry of entries) {
            const mapped = map[entry.special];
            if (mapped !== undefined) {
                entry.special = mapped;
            }
        }
    }
}
