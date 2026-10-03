/**
 * Golden master of the save round trip: a scenario runs uninterrupted and its
 * save is captured half-way; the level is then rebuilt, the save restored as a
 * load does, and the remaining frames are played again. Two checks: the save
 * captured right after the restore must equal the one restored (nothing is
 * lost or invented by a load), and the resumed trace is fingerprinted, with
 * how far the player drifts from the uninterrupted run — the save leaves out
 * the player's momentum, the sub-tic accumulators and the transient effects
 * on purpose, so the two runs part by centimetres from the first frame; a
 * drift that grows is a regression.
 */
const {BenchSimulationRun} = require('../lib/benchSimulationRun');
const {BenchScenario}      = require('../lib/benchScenario');
const {BenchFingerprint}   = require('../lib/benchFingerprint');

class BenchSaveSuite {
    static get name() {
        return 'save';
    }

    /**
     * @param {BenchContext} app
     * @param {{name: string, path: string}[]} wads
     * @param {function(string)} progress
     * @returns {Promise<object>} key "wad/level@skill" → {idempotent, drift, shas, counts…}
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
                result[scenario.key] = await BenchSaveSuite._roundTrip(app, runs, wadFile, scenario);
            } catch (error) {
                result[scenario.key] = {error: String(error.message).split('\n')[0]};
            }
            app.takeLogs();
        }

        return result;
    }

    static async _roundTrip(app, runs, wadFile, scenario) {
        const hooks     = app.run(BenchSaveSuite.HOOKS_SCRIPT, {__captureFrame: BenchSaveSuite.CAPTURE_FRAME, __level: scenario.level});
        const reference = await runs.run(wadFile, scenario, hooks);
        const saved     = hooks.saved;
        const resumed   = await runs.run(wadFile, scenario, null, {snapshot: saved, fromFrame: BenchSaveSuite.CAPTURE_FRAME + 1});
        const tail      = reference.trace.slice(BenchSaveSuite.CAPTURE_FRAME + 1);

        return {
            idempotent:          (BenchFingerprint.json(resumed.reloaded) === BenchFingerprint.json(saved)),
            maxDrift:            BenchSaveSuite._drift(tail, resumed.trace, Math.max),
            endDrift:            BenchSaveSuite._drift(tail.slice(-1), resumed.trace.slice(-1), Math.max),
            frames:              resumed.trace.length,
            resumedSha:          BenchFingerprint.sha(resumed.trace),
            saveSha:             BenchFingerprint.sha(saved),
            endSaveSha:          BenchFingerprint.sha(resumed.snapshot),
            dead:                resumed.dead,
            energy:              resumed.energy,
            uninterruptedEnergy: reference.energy
        };
    }

    /**
     * @returns {number} the XZ distance (metres, to the millimetre) between the two runs' player, reduced over the frames
     */
    static _drift(reference, resumed, reduce) {
        let drift = 0;
        for (let i = 0; i < Math.min(reference.length, resumed.length); i++) {
            const dx = (reference[i][BenchSaveSuite.TRACE_X] - resumed[i][BenchSaveSuite.TRACE_X]);
            const dz = (reference[i][BenchSaveSuite.TRACE_Z] - resumed[i][BenchSaveSuite.TRACE_Z]);
            drift = reduce(drift, Math.hypot(dx, dz));
        }

        return (Math.round(drift * BenchSaveSuite.DRIFT_PRECISION) / BenchSaveSuite.DRIFT_PRECISION);
    }
}

// Columns of a trace row, as BenchSimulationRun writes them.
BenchSaveSuite.TRACE_X         = 0;
BenchSaveSuite.TRACE_Z         = 2;
BenchSaveSuite.DRIFT_PRECISION = 1000;

// Half-way through the standard 1200-frame plan, inside the shooting sweep's aftermath.
BenchSaveSuite.CAPTURE_FRAME = 600;

// The save of the uninterrupted run, taken once the capture frame has been played, like a pause would.
BenchSaveSuite.HOOKS_SCRIPT = `(() => {
    const hooks = {saved: null};
    hooks.afterFrame = (frame, {role}) => {
        if (frame === __captureFrame) {
            hooks.saved = role.captureSnapshot('bench', __level);
            delete hooks.saved.savedAt;
        }
    };

    return hooks;
})()`;

module.exports = {BenchSaveSuite};
