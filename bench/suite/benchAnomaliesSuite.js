/**
 * Every level of every WAD converted as the game does, then searched for what
 * the converter left out: faces drawn without a texture, animated textures
 * left still, textures and sprites the WAD lacks, switch images that cannot
 * toggle, specials no table handles, inexact flat triangulations. Each count
 * comes with the names behind it, to look them up in game. Reads private
 * fields of the engine and converter on purpose: a diagnostic tool.
 */
const {BenchLevelBuild} = require('../lib/benchLevelBuild');
const {BenchGolden}     = require('../lib/benchGolden');
const {BenchBuildSuite} = require('./benchBuildSuite');

class BenchAnomaliesSuite {
    static get name() {
        return 'anomalies';
    }

    /**
     * @param {BenchContext} app
     * @param {{name: string, path: string}[]} wads
     * @param {function(string)} progress
     * @returns {Promise<object>} key "wad/level" → {untextured, staticAnimated…}
     */
    static async run(app, wads, progress) {
        const builds = new BenchLevelBuild(app);
        const result = {};
        app.run(BenchAnomaliesSuite.CAPTURE_SCRIPT);
        for (const wad of wads.filter((w) => !BenchBuildSuite.UNBUILT_WADS.includes(w.name))) {
            const wadFile = app.readWad(wad.path);
            const game    = builds.resolveGame(wadFile);
            for (const code of app.run('__wad.getLevelNames()', {__wad: wadFile})) {
                const key = wad.name + '/' + code;
                progress(key);
                app.seedRandom(BenchAnomaliesSuite.SEED);
                app.takeLogs();
                app.run('globalThis.__anomalyCapture.reset()');
                try {
                    await builds.build(wadFile, game, code);
                    const found = app.run(BenchAnomaliesSuite.SEARCH_SCRIPT)();
                    result[key] = Object.assign(found, BenchAnomaliesSuite._fromLogs(app.takeLogs()));
                } catch (error) {
                    result[key] = BenchGolden.errorEntry(error);
                }
                app.takeLogs();
            }
        }

        return result;
    }

    // The converter warns about what it cannot find, once per request: the
    // names are collected, each once.
    static _fromLogs(lines) {
        const found = {missingTextures: new Set(), missingSprites: new Set(), inexactFlats: 0, otherWarnings: new Set()};
        for (const line of lines) {
            const texture = line.match(BenchAnomaliesSuite.MISSING_TEXTURE);
            const sprite  = line.match(BenchAnomaliesSuite.MISSING_SPRITE);
            if (texture !== null) {
                found.missingTextures.add(texture[1] + ' ' + texture[2]);
            } else if (sprite !== null) {
                found.missingSprites.add(sprite[1]);
            } else if (BenchAnomaliesSuite.INEXACT_FLAT.test(line)) {
                found.inexactFlats++;
            } else if (line.startsWith('WARN') || line.startsWith('ERROR')) {
                found.otherWarnings.add(line);
            }
        }

        return {
            missingTextures: [...found.missingTextures].sort(),
            missingSprites:  [...found.missingSprites].sort(),
            inexactFlats:    found.inexactFlats,
            otherWarnings:   [...found.otherWarnings].sort()
        };
    }
}

BenchAnomaliesSuite.SEED            = 1;
BenchAnomaliesSuite.MISSING_TEXTURE = /WadTextureBank - (wall texture|flat|sky texture) "([^"]*)" not found/;
BenchAnomaliesSuite.MISSING_SPRITE  = /WadSpriteBank - (?:sprite|no usable rotation set for) "([^"]*)"/;
BenchAnomaliesSuite.INEXACT_FLAT    = /WadMeshBuilder - inexact flat triangulation/;

// Notes, while a level builds, the name behind every texture the converter
// registers, its animation sequences and its specials once translated.
BenchAnomaliesSuite.CAPTURE_SCRIPT = `(() => {
    if (globalThis.__anomalyCapture !== undefined) {
        return;
    }
    const capture = {
        reset: () => {
            capture.textures = new Map();
            capture.bank     = null;
            capture.anim     = null;
            capture.level    = null;
        }
    };
    capture.reset();
    const after = (prototype, method, record) => {
        const original    = prototype[method];
        prototype[method] = function (...args) {
            const returned = original.apply(this, args);
            record(this, args, returned);
            return returned;
        };
    };
    after(WadTextureBank.prototype, '_register', (bank, [key, name], index) => {
        capture.bank = bank;
        capture.textures.set(bank.getLoaderId(index), {key: key, name: name});
    });
    after(WadAnimationBank.prototype, 'init', (anim) => {
        capture.anim = anim;
    });
    after(WadSpecialTranslator.prototype, 'translate', (translator, [level]) => {
        capture.level = level;
    });
    globalThis.__anomalyCapture = capture;
})()`;

BenchAnomaliesSuite.SEARCH_SCRIPT = `(() => {
    const capture = globalThis.__anomalyCapture;
    const bank    = capture.bank;
    const level   = capture.level;
    const sorted  = (set) => [...set].sort();
    const counted = (map) => Object.fromEntries([...map.entries()].sort((a, b) => (a[0] - b[0])));
    const exists  = (name, isFlat) => ((isFlat) ? (bank._flats[name] !== undefined) : (bank._wallTexDir[name] !== undefined));

    // Every frame name of a sequence the WAD can draw at least twice: a face
    // painted with one of them must animate.
    const animated = new Map();
    for (const sequence of capture.anim._sequences) {
        if (sequence.frames.filter((frame) => exists(frame, sequence.isFlat)).length < 2) {
            continue;
        }
        for (const frame of sequence.frames) {
            animated.set(((sequence.isFlat) ? 'FLAT_' : '') + frame, true);
        }
    }

    const untextured     = new Map();
    const staticAnimated = new Set();
    for (const object of loader.objects().getAll().filter(Boolean)) {
        for (const fc of object.faceList) {
            if (fc.collisionOnly === true) {
                continue;
            }
            if ((fc.textureId === null) || (fc.textureId === undefined)) {
                const code = (object._code ?? '?');
                untextured.set(code, (untextured.get(code) ?? 0) + 1);
                continue;
            }
            const texture = capture.textures.get(fc.textureId);
            if ((texture !== undefined) && animated.has(texture.key) && (fc.animTextures === null)) {
                staticAnimated.add(texture.key);
            }
        }
    }

    // A use line on a plain wall, or a manual door painted as a switch, is
    // vanilla: only the switch image a shot line flips is looked for
    // (P_ShootSpecialLine calls P_ChangeSwitchTexture).
    const switchNoPair = new Set();
    const gunSwitches  = new Set();
    level.linedefs.forEach((ld, index) => {
        const side = level.sidedefs[ld.right];
        if ((ld.special === 0) || (side === undefined)) {
            return;
        }
        const switchTextures = [side.upper, side.middle, side.lower].filter((name) => ((bank.getSwitchPartner(name) !== null) && exists(name, false)));
        for (const name of switchTextures) {
            if (!exists(bank.getSwitchPartner(name), false)) {
                switchNoPair.add(name);
            }
            if (WadConstants.GUN_SPECIALS.has(ld.special)) {
                gunSwitches.add('line ' + index + ' special ' + ld.special + ' ' + name);
            }
        }
    });

    // Line and sector specials are told apart by table name: the sector ones
    // all start with SECTOR_ or are the light effects.
    const lineHandled   = new Set();
    const sectorHandled = new Set();
    for (const name of Object.getOwnPropertyNames(WadConstants)) {
        if (!name.includes('SPECIAL')) {
            continue;
        }
        const table   = WadConstants[name];
        const handled = ((name.startsWith('SECTOR_') || name.startsWith('LIGHT_')) ? sectorHandled : lineHandled);
        if (typeof table === 'number') {
            handled.add(table);
        } else if ((table !== null) && (typeof table.has === 'function')) {
            table.forEach((special) => handled.add(Number(special)));
        } else if ((table !== null) && (typeof table === 'object')) {
            Object.keys(table).forEach((special) => handled.add(Number(special)));
        }
    }
    const unhandled = (entries, handled) => {
        const counts = new Map();
        for (const entry of entries) {
            if ((entry.special !== 0) && !handled.has(entry.special)) {
                counts.set(entry.special, (counts.get(entry.special) ?? 0) + 1);
            }
        }
        return counted(counts);
    };

    return {
        untextured:              Object.fromEntries([...untextured.entries()].sort()),
        staticAnimated:          sorted(staticAnimated),
        switchWithoutPartner:    sorted(switchNoPair),
        gunLineSwitches:         sorted(gunSwitches),
        unhandledLineSpecials:   unhandled(level.linedefs, lineHandled),
        unhandledSectorSpecials: unhandled(level.sectors, sectorHandled)
    };
})`;

module.exports = {BenchAnomaliesSuite};
