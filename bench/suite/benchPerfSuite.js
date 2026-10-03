/**
 * Call counts of the simulation's hot paths along the standard scenarios,
 * deterministic; the wall time per frame rides along as an informative field.
 */
const {BenchSimulationRun} = require('../lib/benchSimulationRun');
const {BenchScenario}      = require('../lib/benchScenario');
const {BenchGolden}        = require('../lib/benchGolden');

class BenchPerfSuite {
    static get name() {
        return 'perf';
    }

    /**
     * @param {BenchContext} app
     * @param {{name: string, path: string}[]} wads
     * @param {function(string)} progress
     * @returns {Promise<object>} key "wad/level@skill" → {frames, counters…, ~msPerFrame}
     */
    static async run(app, wads, progress) {
        const runs     = new BenchSimulationRun(app);
        const result   = {};
        const files    = new Map(wads.map((w) => [w.name, w.path]));
        const counters = app.run(BenchPerfSuite.countersScript());
        for (const scenario of BenchScenario.standard()) {
            if (!files.has(scenario.wad)) {
                continue;
            }
            progress(scenario.key);
            const wadFile = app.readWad(files.get(scenario.wad));
            try {
                result[scenario.key] = await BenchPerfSuite._measure(runs, counters, wadFile, scenario);
            } catch (error) {
                result[scenario.key] = BenchGolden.errorEntry(error);
            }
            app.takeLogs();
        }

        return result;
    }

    static async _measure(runs, counters, wadFile, scenario) {
        counters.reset();
        const started = process.hrtime.bigint();
        await runs.run(wadFile, scenario);
        const elapsedMs = Number(process.hrtime.bigint() - started) / BenchPerfSuite.NS_PER_MS;
        const entry     = {frames: scenario.frames};
        for (const [name, count] of Object.entries(counters.counts)) {
            entry[name] = count;
        }
        entry[BenchGolden.informative('msPerFrame')] = Math.round(elapsedMs / scenario.frames * BenchPerfSuite.MS_PRECISION) / BenchPerfSuite.MS_PRECISION;

        return entry;
    }

    static countersScript() {
        const wraps = Object.entries(BenchPerfSuite.COUNTED)
            .map(([name, [className, method]]) => ("wrap('" + name + "', " + className + ".prototype, '" + method + "');"))
            .join('\n        ');

        return `(() => {
            if (globalThis.__benchCounters !== undefined) {
                return globalThis.__benchCounters;
            }
            const counts = {};
            const wrap   = (name, prototype, method) => {
                const original    = prototype[method];
                counts[name]      = 0;
                prototype[method] = function (...args) {
                    counts[name]++;
                    return original.apply(this, args);
                };
            };
            ${wraps}
            globalThis.__benchCounters = {
                counts: counts,
                reset:  () => Object.keys(counts).forEach((name) => { counts[name] = 0; })
            };

            return globalThis.__benchCounters;
        })()`;
    }
}

BenchPerfSuite.NS_PER_MS    = 1e6;
BenchPerfSuite.MS_PRECISION = 100;

BenchPerfSuite.COUNTED = {
    worldUpdates:      ['World',                'update'],
    simulationTicks:   ['DoomSimulation',       'tickWorld'],
    monsterUpdates:    ['DoomMonsterSystem',    'update'],
    projectileUpdates: ['DoomProjectileSystem', 'update'],
    instanceAdvances:  ['Instance',             'advance'],
    wallResolutions:   ['Collision',            'resolveWall'],
    floorLookups:      ['Collision',            'getFloorInfo'],
    ceilingLookups:    ['Collision',            'getCeiling'],
    raycasts:          ['Collision',            'raycast'],
    gridCircles:       ['SpatialGrid',          'queryCircle'],
    gridSegments:      ['SpatialGrid',          'querySegment'],
    gridRays:          ['SpatialGrid',          'queryRay']
};

module.exports = {BenchPerfSuite};
