/**
 * Procedural PCM synthesis: short parametric tones built in memory, in the
 * SoundSampleLoader input format. The engine exposes the primitive; the game
 * layer supplies frequencies, durations and gains.
 */
class SoundSynth {
    static DEFAULT_RATE      = 44100;
    static ATTACK_MS_DEFAULT = 2;
    static RELEASE_MS        = 4;

    /**
     * A struck-bar tone: a fundamental plus optional partials, each with its
     * own gain and decay factor (fast-dying partials give the bright attack /
     * mellow tail of a real percussion, where a lone sine sounds like a beep),
     * an optional slight downward pitch glide, a short attack ramp and an
     * exponential decay. The mix is normalized to its measured peak so the
     * master gain IS the output peak (no clipping, whatever the partials), and
     * the final samples always fade linearly over the last RELEASE_MS so a cut
     * tail can never click.
     *
     * @param {{frequency: number, durationMs: number, decayMs: number, gain?: number,
     *          attackMs?: number, rate?: number, pitchDrop?: number,
     *          harmonics?: {ratio: number, gain: number, decayMul?: number}[]}} params
     *        pitchDrop = frequency multiplier reached at the end (1 = none)
     * @returns {{rate: number, samples: Float32Array}}
     */
    static tone(params) {
        const rate      = (params.rate ?? SoundSynth.DEFAULT_RATE);
        const gain      = (params.gain ?? 1);
        const attackS   = ((params.attackMs ?? SoundSynth.ATTACK_MS_DEFAULT) / 1000);
        const decayS    = (params.decayMs / 1000);
        const durationS = (params.durationMs / 1000);
        const drop      = (params.pitchDrop ?? 1);
        const partials  = (params.harmonics ?? [{ratio: 1, gain: 1}]);
        const length    = Math.round(durationS * rate);
        const release   = Math.min(Math.round((SoundSynth.RELEASE_MS / 1000) * rate), length);
        const samples   = new Float32Array(length);
        let peak = 0;
        for (let i = 0; i < length; i++) {
            const t       = (i / rate);
            // Linear glide from frequency to frequency×drop: the phase is the
            // integral of the instantaneous frequency, not frequency×t.
            const phase   = (2 * Math.PI * params.frequency * (t - ((1 - drop) * t * t / (2 * durationS))));
            const attack  = ((attackS > 0) ? Math.min(t / attackS, 1) : 1);
            const fadeOut = ((release > 0) ? Math.min((length - 1 - i) / release, 1) : 1);
            let value = 0;
            for (const partial of partials) {
                value += partial.gain * Math.sin(phase * partial.ratio) * Math.exp(-t / (decayS * (partial.decayMul ?? 1)));
            }
            samples[i] = (value * attack * fadeOut);
            peak       = Math.max(peak, Math.abs(samples[i]));
        }
        if (peak > 0) {
            const scale = (gain / peak);
            for (let i = 0; i < length; i++) {
                samples[i] *= scale;
            }
        }

        return {rate: rate, samples: samples};
    }
}
