/**
 * Doom palette (PLAYPAL lump): 256 RGB colors.
 * Falls back to a greyscale identity palette if the lump is absent.
 */
class WadPalette {
    /**
     * @param {WadFile} wadFile
     */
    constructor(wadFile) {
        this._colors = [];

        const dv = wadFile.getLump('PLAYPAL');
        for (let i = 0; i < 256; i++) {
            if (dv !== null && dv.byteLength >= (i + 1) * 3) {
                this._colors.push([dv.getUint8(i * 3), dv.getUint8(i * 3 + 1), dv.getUint8(i * 3 + 2)]);
            } else {
                this._colors.push([i, i, i]);
            }
        }
    }

    /**
     * @param {int} index
     * @returns {number[]} [r, g, b]
     */
    getColor(index) {
        return this._colors[index];
    }
}
