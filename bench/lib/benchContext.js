/**
 * The game's sources loaded in a Node vm context, as the browser bootstrap
 * would stack them: every file of both libBootstrap.json, in order, in one
 * global scope. The few browser objects the build and the simulation touch
 * are stubbed; nothing from the presentation runs here.
 */
const fs   = require('fs');
const path = require('path');
const vm   = require('vm');
const {BenchImageData} = require('./benchImageData');

class BenchContext {
    /**
     * @param {object|null} options - {verbose: bool} echoes the app's console on stderr
     */
    constructor(options = null) {
        this._verbose = (options?.verbose === true);
        this._logs    = [];
        this._ctx     = this._createContext();
        this._loadSources();
        this._loadPatchCatalogs();
    }

    /**
     * Evaluates a source in the context, with extra values exposed as globals.
     *
     * @param {string}      source
     * @param {object|null} extra
     * @returns {*}
     */
    run(source, extra = null) {
        Object.assign(this._ctx, (extra ?? {}));

        return vm.runInContext(source, this._ctx, {filename: 'bench'});
    }

    /**
     * Parses a WAD file inside the context.
     *
     * @param {string} filePath
     * @returns {object} WadFile
     */
    readWad(filePath) {
        const buf = fs.readFileSync(filePath);
        const ab  = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

        return this.run('(() => { const wad = new WadFile(__ab); wad.parse(); return wad; })()', {__ab: ab});
    }

    /**
     * Replaces Math.random by a seeded linear congruential generator: the
     * thinkers that still draw from it (sector lights, sector damage) become
     * reproducible.
     *
     * @param {int} seed
     */
    seedRandom(seed) {
        this.run(`(() => {
            let state = __seed >>> 0;
            Math.random = () => {
                state = (Math.imul(state, __multiplier) + __increment) >>> 0;

                return state / __modulus;
            };
        })()`, {__seed: seed, __multiplier: BenchContext.LCG_MULTIPLIER, __increment: BenchContext.LCG_INCREMENT, __modulus: BenchContext.LCG_MODULUS});
    }

    /**
     * @returns {string[]} the app's console lines since the previous call
     */
    takeLogs() {
        const logs = this._logs;
        this._logs = [];

        return logs;
    }

    _createContext() {
        const log = (level) => (...args) => {
            const line = args.map((a) => ((typeof a === 'string') ? a : JSON.stringify(a))).join(' ');
            this._logs.push(level + ' ' + line);
            if (this._verbose === true) {
                process.stderr.write(level + ' ' + line + '\n');
            }
        };
        const ctx = {
            console:      {log: log('LOG'), warn: log('WARN'), error: log('ERROR'), info: log('INFO'), debug: () => {}},
            ImageData:    BenchImageData,
            document:     {createElement: () => ({}), addEventListener: () => {}, head: {appendChild: () => {}}},
            localStorage: {getItem: () => null, setItem: () => {}, removeItem: () => {}},
            navigator:    {},
            location:     {href: BenchContext.ORIGIN + '/', origin: BenchContext.ORIGIN},
            performance:  performance,
            crypto:       require('crypto').webcrypto,
            Intl:         Intl,
            TextDecoder:  TextDecoder,
            TextEncoder:  TextEncoder,
            setTimeout:   setTimeout,
            clearTimeout: clearTimeout,
            requestAnimationFrame: () => 0
        };
        ctx.window     = ctx;
        ctx.globalThis = ctx;
        vm.createContext(ctx);

        return ctx;
    }

    _loadSources() {
        for (const bootstrap of BenchContext.BOOTSTRAPS) {
            const definition = JSON.parse(fs.readFileSync(path.join(BenchContext.WEBSITE, bootstrap), 'utf8'));
            for (const file of definition.files.js) {
                if ((file.startsWith('/js/lib/')) || (file.endsWith('/main.js'))) {
                    continue;
                }
                const source = fs.readFileSync(path.join(BenchContext.WEBSITE, file), 'utf8');
                try {
                    vm.runInContext(source, this._ctx, {filename: file});
                } catch (error) {
                    // Presentation files may need a DOM the bench does not stub.
                    this._logs.push('SKIP ' + file + ': ' + error.message);
                }
            }
        }
    }

    _loadPatchCatalogs() {
        for (const catalog of BenchContext.PATCH_CATALOGS) {
            const json = fs.readFileSync(path.join(BenchContext.WEBSITE, catalog), 'utf8');
            this.run('doomLevelPatches._merge(' + json + ')');
        }
    }
}

BenchContext.WEBSITE        = path.resolve(__dirname, '..', '..', 'website');
BenchContext.BOOTSTRAPS     = ['js/engine/libBootstrap.json', 'js/doom/libBootstrap.json'];
BenchContext.PATCH_CATALOGS = ['assets/uzdoom/doom/levelPatches.json', 'assets/uzdoom/heretic/levelPatches.json'];
BenchContext.ORIGIN         = 'http://bench.local';
// Numerical Recipes LCG, 32-bit.
BenchContext.LCG_MULTIPLIER = 1664525;
BenchContext.LCG_INCREMENT  = 1013904223;
BenchContext.LCG_MODULUS    = 4294967296;

module.exports = {BenchContext};
