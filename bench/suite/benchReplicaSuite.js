/**
 * A main and a sub through the turn cycle (BenchReplicaRun) in every mode:
 * the state the sub re-captures must equal the one it received.
 */
const {BenchContext}     = require('../lib/benchContext');
const {BenchReplicaRun}  = require('../lib/benchReplicaRun');
const {BenchScenario}    = require('../lib/benchScenario');
const {BenchFingerprint} = require('../lib/benchFingerprint');
const {BenchGolden}      = require('../lib/benchGolden');

class BenchReplicaSuite {
    static get name() {
        return 'replica';
    }

    /**
     * @param {BenchContext} app   - the main's context
     * @param {{name: string, path: string}[]} wads
     * @param {function(string)} progress
     * @returns {Promise<object>} key "wad/level@skill/mode" → {turns, mismatches, shas, counts…}
     */
    static async run(app, wads, progress) {
        const result = {};
        const files  = new Map(wads.map((w) => [w.name, w.path]));
        let subApp = null;
        for (const scenario of BenchReplicaSuite.scenarios()) {
            if (!files.has(scenario.wad)) {
                continue;
            }
            subApp = (subApp ?? new BenchContext());
            for (const mode of [BenchReplicaRun.SCREEN_SHARING, BenchReplicaRun.COOPERATIVE, BenchReplicaRun.DEATHMATCH]) {
                const key = scenario.key + '/' + mode;
                progress(key);
                try {
                    result[key] = BenchReplicaSuite._digest(await new BenchReplicaRun(app, subApp).run(files.get(scenario.wad), scenario, mode));
                } catch (error) {
                    result[key] = BenchGolden.errorEntry(error);
                }
                app.takeLogs();
                subApp.takeLogs();
            }
        }

        return result;
    }

    static scenarios() {
        return [
            new BenchScenario('Doom2',   'MAP01', BenchScenario.SKILL, BenchReplicaSuite.FRAMES, BenchScenario.standardPlan()),
            new BenchScenario('heretic', 'E1M1',  BenchScenario.SKILL, BenchReplicaSuite.FRAMES, BenchScenario.standardPlan())
        ];
    }

    static _digest(outcome) {
        return {
            turns:        outcome.sub.turns,
            mismatches:   outcome.sub.mismatches,
            subTraceSha:  BenchFingerprint.sha(outcome.sub.trace),
            subEventsSha: BenchFingerprint.sha(outcome.sub.played),
            subEvents:    outcome.sub.played.length,
            mainTraceSha: BenchFingerprint.sha(outcome.main.trace),
            mainPlayers:  outcome.main.players,
            mainStats:    outcome.main.stats,
            heldFrames:   outcome.main.trace.filter((row) => (row === 'held')).length,
            removed:      outcome.main.removed,
            invalid:      outcome.sub.flags.invalid
        };
    }
}

// Enough for shots, drops and movers to travel, and for a killed deathmatch player to respawn.
BenchReplicaSuite.FRAMES = 600;

module.exports = {BenchReplicaSuite};
