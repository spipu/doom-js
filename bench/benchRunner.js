/**
 * Runs the bench suites on the WADs of .source/wad/ and compares their
 * fingerprints to the golden files, or rewrites those files on --update.
 * Exit code 1 on any difference.
 */
const fs   = require('fs');
const path = require('path');
const {BenchContext}         = require('./lib/benchContext');
const {BenchWads}            = require('./lib/benchWads');
const {BenchBuildSuite}      = require('./suite/benchBuildSuite');
const {BenchSimulationSuite} = require('./suite/benchSimulationSuite');
const {BenchCodecsSuite}     = require('./suite/benchCodecsSuite');

class BenchRunner {
    /**
     * @param {string[]} argv - --suite <name>, --wad <name> (repeatable), --update, --verbose
     */
    constructor(argv) {
        this._update  = argv.includes('--update');
        this._verbose = argv.includes('--verbose');
        this._suites  = BenchRunner._values(argv, '--suite');
        this._wads    = BenchRunner._values(argv, '--wad');
    }

    /**
     * @returns {Promise<int>} the number of differences
     */
    async run() {
        const app  = new BenchContext({verbose: this._verbose});
        const wads = BenchWads.list(((this._wads.length > 0) ? this._wads : null));
        let failures = 0;
        for (const suite of BenchRunner.SUITES) {
            if ((this._suites.length > 0) && (!this._suites.includes(suite.name))) {
                continue;
            }
            const started = Date.now();
            const result  = await suite.run(app, wads, (label) => this._progress(suite.name, label));
            this._clearProgress();
            failures += this._compare(suite.name, result, (Date.now() - started) / BenchRunner.MS_PER_S);
        }
        if (failures > 0) {
            process.stdout.write('\n' + failures + ' difference(s). Wanted? node bench/run.js --update\n');
        }

        return failures;
    }

    _progress(suite, label) {
        if (process.stdout.isTTY === true) {
            process.stdout.write('\r' + ' '.repeat(BenchRunner.PROGRESS_WIDTH) + '\r[' + suite + '] ' + label);
        }
    }

    _clearProgress() {
        if (process.stdout.isTTY === true) {
            process.stdout.write('\r' + ' '.repeat(BenchRunner.PROGRESS_WIDTH) + '\r');
        }
    }

    _compare(suiteName, result, seconds) {
        const file    = path.join(BenchRunner.GOLDEN_DIR, suiteName + '.json');
        const golden  = ((fs.existsSync(file)) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null);
        const partial = (this._wads.length > 0);
        if (this._update === true) {
            const merged = (((partial === true) && (golden !== null)) ? Object.assign(golden, result) : result);
            fs.writeFileSync(file, JSON.stringify(merged, null, 2) + '\n');
            process.stdout.write('[' + suiteName + '] golden written: ' + Object.keys(result).length + ' entries (' + seconds.toFixed(0) + ' s)\n');

            return 0;
        }
        if (golden === null) {
            process.stdout.write('[' + suiteName + '] no golden file, run with --update first\n');

            return 1;
        }
        let failures = 0;
        for (const key of Object.keys(result)) {
            const expected = golden[key];
            if (expected === undefined) {
                process.stdout.write('[' + suiteName + '] ' + key + ': NEW (not in golden)\n');
                failures++;
                continue;
            }
            if (JSON.stringify(expected) === JSON.stringify(result[key])) {
                continue;
            }
            failures++;
            process.stdout.write('[' + suiteName + '] ' + key + ': CHANGED' + BenchRunner._describe(expected, result[key]) + '\n');
        }
        if (partial === false) {
            for (const key of Object.keys(golden)) {
                if (result[key] === undefined) {
                    process.stdout.write('[' + suiteName + '] ' + key + ': MISSING (in golden, not built)\n');
                    failures++;
                }
            }
        }
        const total = Object.keys(result).length;
        process.stdout.write('[' + suiteName + '] ' + (total - failures) + '/' + total + ' identical (' + seconds.toFixed(0) + ' s)\n');

        return failures;
    }

    // The readable counts that differ; the shas alone say nothing to a reader.
    static _describe(expected, actual) {
        const parts = [];
        for (const field of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
            if ((!field.toLowerCase().endsWith('sha')) && (JSON.stringify(expected[field]) !== JSON.stringify(actual[field]))) {
                parts.push(field + ' ' + JSON.stringify(expected[field]) + ' → ' + JSON.stringify(actual[field]));
            }
        }

        return ((parts.length > 0) ? (' (' + parts.join(', ') + ')') : ' (same counts, different content)');
    }

    static _values(argv, flag) {
        const values = [];
        argv.forEach((arg, i) => {
            if ((arg === flag) && (argv[i + 1] !== undefined)) {
                values.push(argv[i + 1]);
            }
        });

        return values;
    }
}

BenchRunner.GOLDEN_DIR     = path.join(__dirname, 'golden');
BenchRunner.SUITES         = [BenchBuildSuite, BenchSimulationSuite, BenchCodecsSuite];
BenchRunner.PROGRESS_WIDTH = 100;
BenchRunner.MS_PER_S       = 1000;

module.exports = {BenchRunner};
