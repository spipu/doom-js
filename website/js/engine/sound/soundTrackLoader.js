/**
 * Registry of the music tracks, OUTSIDE the global loader coordinator like the
 * sound samples: tracks are WAD-lifetime data — any song can play under any
 * level — while loader.reset() fires on every level. Standalone lifecycle:
 * synchronous in-memory loads, reset when leaving the WAD.
 */
class SoundTrackLoader extends AbstractLoader {
    constructor() {
        super('soundTrack', () => {});
    }

    /**
     * @param {string} code
     * @param {{format: string, bytes: ArrayBuffer}} data
     * @returns {number} loader id (the existing one when the code is already registered)
     */
    loadFromData(code, data) {
        const existingId = this.idByCode(code);
        if (existingId !== null) {
            return existingId;
        }

        return super.loadFromData(code, data);
    }

    _create(id, url, callback) {
        return new SoundTrack(id, url, callback);
    }

    _populateFromData(entity, data) {
        entity.setTrackData(data.format, data.bytes);
    }
}
