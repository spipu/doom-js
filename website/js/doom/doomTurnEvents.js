/**
 * Every one-shot event of a turn — a sound, an effect, a decal, a player's
 * teleport — as plain data, with the random values the simulation drew for it.
 * The simulation emits, the listeners receive each event as it is emitted: the
 * presentation plays it at once, so sounds and effect instances come in the
 * order the turn made them, and a session can listen too to send it with the
 * turn.
 */
class DoomTurnEvents {
    constructor() {
        this._listeners = [];
    }

    /**
     * @param {function(object)} listener - receives every event as it is emitted
     */
    addListener(listener) {
        this._listeners.push(listener);

        return this;
    }

    removeListener(listener) {
        this._listeners = this._listeners.filter((other) => (other !== listener));

        return this;
    }

    /**
     * @param {number[]|null} point   - world origin, null for a sound heard everywhere
     * @param {object}        options - {attenuation?, replaceKey?}
     */
    soundAt(name, point, options = {}) {
        this._emit({type: DoomTurnEvents.SOUND_AT, name: name, point: point, options: options});
    }

    /**
     * Heard from a body, and following it while it plays.
     *
     * @param {DoomBodyView} body
     */
    soundFromBody(name, body, options = {}) {
        this._emit({type: DoomTurnEvents.SOUND_FROM_BODY, name: name, body: body, options: options});
    }

    /**
     * @param {DoomUser}    user
     * @param {string|null} channel - DoomSoundSystem.CHANNEL_*, null = replaces nothing
     */
    soundFromPlayer(name, user, channel) {
        this._emit({type: DoomTurnEvents.SOUND_FROM_PLAYER, name: name, user: user, channel: channel});
    }

    // Heard by that player alone (a secret found, a pickup).
    soundToPlayer(name, user) {
        this._emit({type: DoomTurnEvents.SOUND_TO_PLAYER, name: name, user: user});
    }

    /**
     * @param {object} effect {name, x, y, z, startFrame, elapsed (tics already run),
     *                         jitterY, velocity, mirror, roll,
     *                         follow: {target (DoomUser or DoomBodyView), ahead}|null}
     */
    effect(effect) {
        effect.type = DoomTurnEvents.EFFECT;
        this._emit(effect);
    }

    /**
     * @param {object} decal {key, variant, position, rotation, owner (Instance|null), fade}
     */
    decal(decal) {
        decal.type = DoomTurnEvents.DECAL;
        this._emit(decal);
    }

    playerTeleported(user) {
        this._emit({type: DoomTurnEvents.PLAYER_TELEPORTED, user: user});
    }

    _emit(event) {
        for (const listener of this._listeners) {
            listener(event);
        }
    }
}

DoomTurnEvents.SOUND_AT          = 'soundAt';
DoomTurnEvents.SOUND_FROM_BODY   = 'soundFromBody';
DoomTurnEvents.SOUND_FROM_PLAYER = 'soundFromPlayer';
DoomTurnEvents.SOUND_TO_PLAYER   = 'soundToPlayer';
DoomTurnEvents.EFFECT            = 'effect';
DoomTurnEvents.DECAL             = 'decal';
DoomTurnEvents.PLAYER_TELEPORTED = 'playerTeleported';
