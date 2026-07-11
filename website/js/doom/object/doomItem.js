/**
 * An inventory item definition: keys and power-ups. type is one of
 * 'key' | 'powerupPermanent' | 'powerupTimed'. duration (ms) only matters for
 * the timed power-ups. Items reset on a new level by default (keys are not
 * carried over); the actual effect application is wired in a later round.
 */
class DoomItem extends AbstractDoomObject {
    constructor(data) {
        super(data, true);
        this._type     = data.type;
        this._effect   = data.effect ?? null;
        this._duration = data.duration ?? 0;
    }

    getType() {
        return this._type;
    }

    getEffect() {
        return this._effect;
    }

    getDuration() {
        return this._duration;
    }
}
