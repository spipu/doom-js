/**
 * The IWADs the bench runs on, read from .source/wad/ in a fixed order.
 */
const fs   = require('fs');
const path = require('path');

class BenchWads {
    /**
     * @param {string[]|null} only - WAD names to keep, null for all
     * @returns {{name: string, path: string}[]}
     */
    static list(only = null) {
        return BenchWads.ORDER
            .filter((name) => fs.existsSync(BenchWads._pathOf(name)))
            .filter((name) => ((only === null) || (only.some((o) => (o.toLowerCase() === name.toLowerCase())))))
            .map((name) => ({name: name, path: BenchWads._pathOf(name)}));
    }

    static _pathOf(name) {
        return path.join(BenchWads.WAD_DIR, name + '.wad');
    }
}

BenchWads.WAD_DIR = path.resolve(__dirname, '..', '..', '.source', 'wad');
BenchWads.ORDER   = ['freedoom1', 'freedoom2', 'Doom1', 'Doom2', 'heretic', 'hexen'];

module.exports = {BenchWads};
