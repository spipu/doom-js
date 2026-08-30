/**
 * One music track at a time, driven through the SoundMusicSynth contract — the
 * player knows nothing of formats or synthesis libraries.
 *
 * Every start is gated on three things: an injected synth, a running audio
 * context (a track asked for before the first user gesture starts by itself
 * once the engine unlocks) and a non-zero music volume — at zero the request
 * is remembered without starting, and raising the volume plays it (the UZDoom
 * rule). The actual loudness lives on the engine's music bus; the gate only
 * decides whether the synth runs at all. A leaving song fades out through a
 * dedicated gain node before the next one starts. All synth work is
 * serialized on one promise chain, so rapid track changes can never
 * interleave.
 */
class SoundMusicPlayer {
    // A leaving song fades out over this window; the next one starts clean.
    static FADE_OUT_MS = 500;

    /**
     * @param {SoundEngine} soundEngine
     */
    constructor(soundEngine) {
        this._engine     = soundEngine;
        this._synth      = null;
        this._bank       = null;
        this._bankLoaded = false;
        this._request    = null;
        this._playing    = null;
        this._audible    = true;
        this._fadeNode   = null;
        this._chain      = Promise.resolve();

        soundEngine.onRunning(() => {
            this._poke();
        });
    }

    /**
     * @param {SoundMusicSynth} synth
     */
    setSynth(synth) {
        this._synth = synth;
        return this._poke();
    }

    /**
     * @param {ArrayBuffer|null} bytes instrument bank for the synth, null to clear
     */
    setBank(bytes) {
        this._bank       = bytes;
        this._bankLoaded = false;
        return this._poke();
    }

    /**
     * Volume gate, NOT a gain (the loudness is the engine's music bus): at 0
     * the current request is silenced but remembered, above 0 it plays.
     *
     * @param {number} fraction 0..1
     */
    setVolumeGate(fraction) {
        this._audible = (fraction > 0);
        return this._poke();
    }

    /**
     * @param {SoundTrack} track
     * @param {boolean} loop
     */
    play(track, loop = true) {
        if ((this._request !== null) && (this._request.track === track)) {
            return this;   // the same song keeps playing (vanilla S_ChangeMusic)
        }
        this._request = {track: track, loop: (loop === true)};
        return this._poke();
    }

    stop() {
        this._request = null;
        return this._poke();
    }

    // Serialized reconciliation of the requested state onto the synth.
    _poke() {
        this._chain = this._chain
            .then(() => this._sync())
            .catch((error) => {
                console.warn('SoundMusicPlayer - ' + error.message);
            });

        return this;
    }

    async _sync() {
        const request = this._request;
        if ((request === null) || !this._audible) {
            await this._stopPlayback();
            return;
        }
        if ((this._synth === null) || (this._bank === null) || !this._engine.isRunning()) {
            return;
        }
        // The synth output goes through a dedicated fade node, NOT straight
        // into the music bus: the bus gain is the volume setting, the fade
        // node belongs to the transitions.
        if (this._fadeNode === null) {
            this._fadeNode = this._engine.getContext().createGain();
            this._fadeNode.connect(this._engine.getMusicBus());
        }
        await this._synth.init(this._engine.getContext(), this._fadeNode);
        if (!this._bankLoaded) {
            await this._synth.loadBank(this._bank);
            this._bankLoaded = true;
        }
        if (this._playing === request) {
            return;
        }
        await this._stopPlayback();
        await this._synth.loadTrack(request.track.getBytes());
        this._synth.play(request.loop);
        this._playing = request;
    }

    // Fades the playing song out before silencing the synth; nothing playing
    // means nothing to fade. The fade gain is restored before the next start.
    async _stopPlayback() {
        if (this._playing === null) {
            return;
        }
        this._playing = null;
        if ((this._synth === null) || !this._synth.isReady()) {
            return;
        }
        const gain = this._fadeNode.gain;
        const now  = this._engine.getContext().currentTime;
        gain.cancelScheduledValues(now);
        gain.setValueAtTime(gain.value, now);
        gain.linearRampToValueAtTime(0, now + (SoundMusicPlayer.FADE_OUT_MS / 1000));
        await new Promise((resolve) => {
            setTimeout(resolve, SoundMusicPlayer.FADE_OUT_MS);
        });
        this._synth.stop();
        const after = this._engine.getContext().currentTime;
        gain.cancelScheduledValues(after);
        gain.setValueAtTime(1, after);
    }
}
