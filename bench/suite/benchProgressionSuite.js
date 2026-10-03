/**
 * Golden master of the progression: for every level of every WAD, the next
 * level after a normal and a secret exit, the story text each exit brings,
 * the music candidates and the level name as the game resolves it (UMAPINFO,
 * then the WAD's DEHACKED strings, then the profile's table) — the vanilla
 * routing rules, the per-game slots and the lump overlays, which no scenario
 * walks through.
 */
const {BenchLevelBuild}  = require('../lib/benchLevelBuild');
const {BenchFingerprint} = require('../lib/benchFingerprint');

class BenchProgressionSuite {
    static get name() {
        return 'progression';
    }

    /**
     * @param {BenchContext} app
     * @param {{name: string, path: string}[]} wads
     * @param {function(string)} progress
     * @returns {Promise<object>} key "wad/level" → {next, nextSecret, finale, finaleSecret, music, name}
     */
    static async run(app, wads, progress) {
        const builds = new BenchLevelBuild(app);
        const table  = app.run(BenchProgressionSuite.TABLE_SCRIPT);
        const result = {};
        for (const wad of wads) {
            progress(wad.name);
            const wadFile = app.readWad(wad.path);
            try {
                for (const row of table(wadFile, builds.resolveGame(wadFile).profile)) {
                    result[wad.name + '/' + row.code] = BenchProgressionSuite._entry(row);
                }
            } catch (error) {
                result[wad.name] = {error: String(error.message).split('\n')[0]};
            }
            app.takeLogs();
        }

        return result;
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

    // A UMAPINFO text is kept by its fingerprint, a catalog text by its code.
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
