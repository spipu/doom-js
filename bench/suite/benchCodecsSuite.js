/**
 * Golden master of the network codecs: along a short scenario, the turn
 * state is captured and encoded as the main does, decoded as a sub does,
 * and re-encoded — the bytes must match and their fingerprint is kept; every
 * scripted command goes through the command codec the same way.
 */
const {BenchSimulationRun} = require('../lib/benchSimulationRun');
const {BenchScenario}      = require('../lib/benchScenario');
const {BenchFingerprint}   = require('../lib/benchFingerprint');

class BenchCodecsSuite {
    static get name() {
        return 'codecs';
    }

    /**
     * @param {BenchContext} app
     * @param {{name: string, path: string}[]} wads
     * @param {function(string)} progress
     * @returns {Promise<object>} one entry for the scenario
     */
    static async run(app, wads, progress) {
        const result   = {};
        const files    = new Map(wads.map((w) => [w.name, w.path]));
        const scenario = new BenchScenario(BenchCodecsSuite.WAD, BenchCodecsSuite.LEVEL, BenchScenario.SKILL, BenchCodecsSuite.FRAMES, BenchScenario.standardPlan());
        if (!files.has(scenario.wad)) {
            return result;
        }
        progress(scenario.key);
        const wadFile = app.readWad(files.get(scenario.wad));
        const hooks   = app.run(BenchCodecsSuite.HOOKS_SCRIPT, {__sampleEvery: BenchCodecsSuite.SAMPLE_EVERY});
        try {
            await new BenchSimulationRun(app).run(wadFile, scenario, hooks);
            result[scenario.key] = BenchCodecsSuite._digest(hooks.samples);
        } catch (error) {
            result[scenario.key] = {error: String(error.message).split('\n')[0]};
        }
        app.takeLogs();

        return result;
    }

    static _digest(samples) {
        return {
            statesSha:   BenchFingerprint.shaOfBytes(samples.states),
            commandsSha: BenchFingerprint.shaOfBytes(samples.commands),
            states:      samples.states.length,
            stateBytes:  samples.states.reduce((n, a) => (n + a.length), 0),
            commands:    samples.commands.length,
            mismatches:  samples.mismatches
        };
    }
}

BenchCodecsSuite.WAD          = 'Doom2';
BenchCodecsSuite.LEVEL        = 'MAP01';
BenchCodecsSuite.FRAMES       = 400;
BenchCodecsSuite.SAMPLE_EVERY = 20;

BenchCodecsSuite.HOOKS_SCRIPT = `(() => {
    const samples = {states: [], commands: [], mismatches: 0};
    const codec   = new DoomNetCommandCodec(DoomSimulation.COMMAND_BUTTONS, DoomSimulation.COMMAND_IMPULSES);
    const same    = (a, b) => ((a.byteLength === b.byteLength) && (new Uint8Array(a).every((v, i) => (v === new Uint8Array(b)[i]))));
    let capture = null;

    return {
        samples: samples,
        afterEnter: ({role, roster, built, events}) => {
            const recorder = new DoomNetEvents(built.getEntityIds(), roster);
            events.addListener(recorder.getListener());
            capture = new DoomNetStateCapture(roster, built, role.getLevelStats(), recorder);
        },
        afterFrame: (frame, {command}) => {
            const encoded = codec.encode(frame, command);
            const decoded = codec.decode(encoded);
            if (!same(encoded, codec.encode(decoded.turn, decoded.command))) {
                samples.mismatches++;
            }
            samples.commands.push(new Uint8Array(encoded));
            if (frame % __sampleEvery !== 0) {
                return;
            }
            const bytes = DoomNetStateCodec.encode(capture.capture(frame));
            if (!same(bytes, DoomNetStateCodec.encode(DoomNetStateCodec.decode(bytes)))) {
                samples.mismatches++;
            }
            samples.states.push(new Uint8Array(bytes));
        }
    };
})()`;

module.exports = {BenchCodecsSuite};
