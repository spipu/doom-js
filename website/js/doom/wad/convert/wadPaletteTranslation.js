/**
 * A palette seen through a colour translation (vanilla R_InitTranslationTables,
 * zscript Player.Colorset): the indexes of one range are moved, one for one,
 * to another range; every other index keeps its colour. Decodes a player
 * sprite in the colour of a slot.
 */
class WadPaletteTranslation {
    /**
     * @param {WadPalette} palette
     * @param {int[]}      range - [first, last] indexes translated
     * @param {int}        from  - first index of the target range
     */
    constructor(palette, range, from) {
        this._palette = palette;
        this._first   = range[0];
        this._last    = range[1];
        this._from    = from;
    }

    /**
     * @param {int} index
     * @returns {number[]} [r, g, b]
     */
    getColor(index) {
        if ((index < this._first) || (index > this._last)) {
            return this._palette.getColor(index);
        }

        return this._palette.getColor(this._from + (index - this._first));
    }
}
