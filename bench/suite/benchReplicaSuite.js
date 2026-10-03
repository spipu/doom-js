/**
 * Golden master of the replication: a main and a sub run a scenario through
 * the synchronous turn cycle, wired directly in two app contexts (see
 * BenchReplicaRun), in screen sharing, cooperative and deathmatch. The state the sub
 * re-captures after applying each turn must equal the one it received, and
 * what it played — sounds, effects — and the course of both players are
 * fingerprinted.
 */
const {BenchContext}     = require('../lib/benchContext');
const {BenchReplicaRun}  = require('../lib/benchReplicaRun');
const {BenchScenario}    = require('../lib/benchScenario');
const {BenchFingerprint} = require('../lib/benchFingerprint');

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
                    result[key] = {error: String(error.message).split('\n')[0]};
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

// 600 frames: the cheat, the shooting sweep, the walk in and the use presses — enough for shots,
// drops and movers to travel, and for a killed deathmatch player to respawn.
BenchReplicaSuite.FRAMES = 600;

module.exports = {BenchReplicaSuite};
