/**
 * Per level: exits, finales, music and the name as the game resolves them;
 * per WAD: its title and version.
 */
const crypto             = require('crypto');
const fs                 = require('fs');
const {BenchLevelBuild}  = require('../lib/benchLevelBuild');
const {BenchFingerprint} = require('../lib/benchFingerprint');
const {BenchGolden}      = require('../lib/benchGolden');

class BenchProgressionSuite {
    static get name() {
        return 'progression';
    }

    /**
     * @param {BenchContext} app
     * @param {{name: string, path: string}[]} wads
     * @param {function(string)} progress
     * @returns {Promise<object>} key "wad/level" → {next, nextSecret, finale, finaleSecret, music, name},
     *                            key "wad/identity" → {name, version}
     */
    static async run(app, wads, progress) {
        const builds = new BenchLevelBuild(app);
        const table  = app.run(BenchProgressionSuite.TABLE_SCRIPT);
        const result = {};
        for (const wad of wads) {
            progress(wad.name);
            const wadFile = app.readWad(wad.path);
            try {
                result[wad.name + '/identity'] = BenchProgressionSuite._identity(app, wad.path);
                for (const row of table(wadFile, builds.resolveGame(wadFile).profile)) {
                    result[wad.name + '/' + row.code] = BenchProgressionSuite._entry(row);
                }
            } catch (error) {
                result[wad.name] = BenchGolden.errorEntry(error);
            }
            app.takeLogs();
        }

        return result;
    }

    static _identity(app, wadPath) {
        const sha1 = crypto.createHash('sha1').update(fs.readFileSync(wadPath)).digest('hex');

        return (app.run('DoomWadEditions').describe(sha1) ?? {name: null, version: null});
    }

    static _entry(row) {
        return {
            next:         row.next,
            nextSecret:   row.nextSecret,
            finale:       BenchProgressionSuite._finale(row.finale),
            finaleSecret: BenchProgressionSuite._finale(row.finaleSecret),
            music:        row.music,
            name:         row.name
        };
    }

    static _finale(finale) {
        if (finale === null) {
            return null;
        }
        if (finale.text === undefined) {
            return finale.code;
        }

        return 'text:' + BenchFingerprint.sha(finale.text).substring(0, BenchProgressionSuite.TEXT_SHA_LENGTH);
    }
}

BenchProgressionSuite.TEXT_SHA_LENGTH = 12;
BenchProgressionSuite.TABLE_SCRIPT    = `((wadFile, profile) => {
    const info     = new WadMapInfo(wadFile, profile);
    const dehacked = new WadDehackedStrings(wadFile);

    return wadFile.getLevelNames().map((code) => ({
        code:         code,
        next:         info.nextLevelCode(code, false),
        nextSecret:   info.nextLevelCode(code, true),
        finale:       info.finaleFor(code, false),
        finaleSecret: info.finaleFor(code, true),
        music:        info.musicLumpsFor(code),
        name:         (info.levelNameFor(code) ?? dehacked.levelName(code, profile.levelNameStringPrefix()) ?? profile.levelNames()[code] ?? null)
    }));
})`;

module.exports = {BenchProgressionSuite};
