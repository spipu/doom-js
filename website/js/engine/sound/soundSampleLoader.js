/**
 * Registry of the decoded sound effects, OUTSIDE the global loader coordinator:
 * sounds are WAD-lifetime data, not level data — loader.reset() fires on every
 * level while the samples must live as long as the WAD stays selected.
 * Standalone lifecycle: synchronous in-memory loads, reset when leaving the WAD.
 */
class SoundSampleLoader extends AbstractLoader {
    /**
     * @param {SoundEngine} soundEngine
     */
    constructor(soundEngine) {
        super('soundSample', () => {});

        this._soundEngine = soundEngine;
    }

    /**
     * @param {string} code
     * @param {{rate: number, samples: Float32Array}} data
     * @returns {number} loader id (the existing one when the code is already registered)
     */
    loadFromData(code, data) {
        const existingId = this.idByCode(code);
        if (existingId !== null) {
            return existingId;
        }

        const id = super.loadFromData(code, data);
        this.get(id).finalizeInit();
        return id;
    }

    _create(id, url, callback) {
        return new SoundSample(id, url, callback);
    }

    _populateFromData(entity, data) {
        entity
            .setContext(this._soundEngine.getContext())
            .setPcm(data.rate, data.samples)
        ;
    }
}
