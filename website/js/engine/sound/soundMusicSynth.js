/**
 * Contract of a music synthesizer: everything SoundMusicPlayer needs from a
 * synthesis library — brought up once on the page's audio context, fed an
 * instrument bank and song bytes it alone understands, started and stopped.
 * Swapping the synthesis library is one new adapter implementing this surface;
 * the player and the game wiring never change.
 */
class SoundMusicSynth {
    /**
     * Brings the synthesizer up on the given context, its output wired to the
     * given node (a mixer bus, never the raw destination). Idempotent.
     *
     * @param {AudioContext} context
     * @param {AudioNode} destination
     * @returns {Promise<void>}
     */
    async init(context, destination) {
        throw new Error('SoundMusicSynth.init must be implemented');
    }

    isReady() {
        throw new Error('SoundMusicSynth.isReady must be implemented');
    }

    /**
     * @param {ArrayBuffer} bytes instrument bank in a format the synth understands
     * @returns {Promise<void>}
     */
    async loadBank(bytes) {
        throw new Error('SoundMusicSynth.loadBank must be implemented');
    }

    /**
     * @param {ArrayBuffer} bytes song data in a format the synth understands
     * @returns {Promise<void>}
     */
    async loadTrack(bytes) {
        throw new Error('SoundMusicSynth.loadTrack must be implemented');
    }

    /**
     * @param {boolean} loop
     */
    play(loop) {
        throw new Error('SoundMusicSynth.play must be implemented');
    }

    stop() {
        throw new Error('SoundMusicSynth.stop must be implemented');
    }
}
