/**
 * SoundMusicSynth adapter over the vendored libADLMIDI-JS wrapper (OPL3 FM
 * synthesis in an AudioWorklet, WOPL banks, native MUS/MIDI reading).
 *
 * The AdlMidi global is only referenced inside init(): the wrapper is declared
 * in the bootstrap of the application that uses music, so a page loading the
 * engine alone still loads this file without error.
 */
class SoundMusicSynthAdlMidi extends SoundMusicSynth {
    /**
     * @param {string} processorUrl URL of the AudioWorklet processor script
     * @param {string} wasmUrl URL of the synthesis wasm core
     */
    constructor(processorUrl, wasmUrl) {
        super();

        this._processorUrl = processorUrl;
        this._wasmUrl      = wasmUrl;
        this._synth        = null;
    }

    async init(context, destination) {
        if (this._synth !== null) {
            return;
        }
        if (typeof AdlMidi === 'undefined') {
            throw new Error('SoundMusicSynthAdlMidi - the libadlmidi wrapper is not loaded');
        }
        const synth = new AdlMidi(context);
        await synth.init(this._processorUrl, this._wasmUrl);
        // The wrapper wires its node straight to the context destination; the
        // application mixes everything through buses, music included.
        synth.node.disconnect();
        synth.node.connect(destination);
        this._synth = synth;
    }

    isReady() {
        return (this._synth !== null);
    }

    async loadBank(bytes) {
        await this._synth.loadBankData(bytes);
    }

    async loadTrack(bytes) {
        await this._synth.loadMidi(bytes);
    }

    play(loop) {
        this._synth.setLoopEnabled(loop === true);
        this._synth.play();
    }

    stop() {
        if (this._synth !== null) {
            this._synth.stop();
        }
    }
}
