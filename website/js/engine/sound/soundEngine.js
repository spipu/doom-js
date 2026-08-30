/**
 * Owner of the page's single AudioContext and of the two volume buses (music,
 * effects) every sound of the application goes through.
 *
 * The context is created once and never recreated (browsers cap their number).
 * It is born 'suspended', which only blocks playback: building buffers works in
 * that state, so decoding can happen before any user gesture. The resume must
 * come from a DIRECT event handler (a deferred callback may have lost the
 * browser's transient activation), hence the one-shot document-level unlock
 * listeners.
 */
class SoundEngine {
    constructor() {
        this._context    = new AudioContext();
        this._musicBus   = this._context.createGain();
        this._effectsBus = this._context.createGain();

        this._musicBus.connect(this._context.destination);
        this._effectsBus.connect(this._context.destination);
    }

    getContext() {
        return this._context;
    }

    getMusicBus() {
        return this._musicBus;
    }

    getEffectsBus() {
        return this._effectsBus;
    }

    isRunning() {
        return (this._context.state === 'running');
    }

    /**
     * One-shot capture listeners on the document: the first pointer or key
     * gesture resumes the context, whatever screen the app is on — menus, or
     * a dev boot dropping straight into a level.
     */
    installUnlockListeners() {
        const unlock = () => {
            document.removeEventListener('pointerdown', unlock, true);
            document.removeEventListener('keydown', unlock, true);
            this.unlock();
        };
        document.addEventListener('pointerdown', unlock, true);
        document.addEventListener('keydown', unlock, true);
        return this;
    }

    unlock() {
        if (this._context.state === 'suspended') {
            this._context.resume();
        }
        return this;
    }

    suspendAll() {
        if (this._context.state === 'running') {
            this._context.suspend();
        }
        return this;
    }

    resumeAll() {
        return this.unlock();
    }

    /**
     * Volume settings as 0..1 fractions.
     *
     * @param {number} fraction
     */
    setMusicVolume(fraction) {
        this._musicBus.gain.value = SoundEngine._volumeCurve(fraction);
        return this;
    }

    setEffectsVolume(fraction) {
        this._effectsBus.gain.value = SoundEngine._volumeCurve(fraction);
        return this;
    }

    // Hearing is logarithmic: a linear 0.5 sounds far louder than "half".
    // Squared, the mid setting lands near -12 dB — about half the perceived
    // loudness — and the whole 0..100% range stays usable. The single place
    // the curve lives.
    static _volumeCurve(fraction) {
        const clamped = Math.min(Math.max(fraction, 0), 1);
        return (clamped * clamped);
    }
}
