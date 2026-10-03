/**
 * Scripted scenarios driven frame by frame through DoomMainRole, fingerprinted
 * on the player's trace and on the save captured at the end.
 */
const {BenchSimulationRun} = require('../lib/benchSimulationRun');
const {BenchScenario}      = require('../lib/benchScenario');
const {BenchFingerprint}   = require('../lib/benchFingerprint');
const {BenchGolden}        = require('../lib/benchGolden');

class BenchSimulationSuite {
    static get name() {
        return 'simulation';
    }

    /**
     * @param {BenchContext} app
     * @param {{name: string, path: string}[]} wads
     * @param {function(string)} progress
     * @returns {Promise<object>} key "wad/level@skill" → {sha, saveSha, counts…}
     */
    static async run(app, wads, progress) {
        const runs   = new BenchSimulationRun(app);
        const result = {};
        const files  = new Map(wads.map((w) => [w.name, w.path]));
        for (const scenario of BenchScenario.standard()) {
            if (!files.has(scenario.wad)) {
                continue;
            }
            progress(scenario.key);
            const wadFile = app.readWad(files.get(scenario.wad));
            try {
                result[scenario.key] = BenchSimulationSuite._digest(await runs.run(wadFile, scenario));
            } catch (error) {
                result[scenario.key] = BenchGolden.errorEntry(error);
            }
            app.takeLogs();
        }

        return result;
    }

    static _digest(outcome) {
        const last   = outcome.trace[outcome.trace.length - 1];
        const counts = last[BenchSimulationRun.TRACE_COUNTS];

        return {
            sha:     BenchFingerprint.sha(outcome.trace),
            saveSha: BenchFingerprint.sha(outcome.snapshot),
            frames:  outcome.trace.length,
            events:  outcome.trace.reduce((n, row) => (n + row[BenchSimulationRun.TRACE_EVENTS].length), 0),
            dead:    outcome.dead,
            energy:  outcome.energy,
            weapon:  last[BenchSimulationRun.TRACE_WEAPON],
            kills:   (counts.kills ?? null),
            items:   (counts.items ?? null),
            exits:   outcome.exits.length
        };
    }
}

module.exports = {BenchSimulationSuite};
