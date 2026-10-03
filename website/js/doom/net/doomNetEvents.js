/**
 * The one-shot events of a turn as the turn message carries them: a listener
 * of DoomTurnEvents that keeps each event with its references turned into
 * network ids — a body by its id, a player by its player id, the mover a decal
 * rides by its instance's id. An event says what happens and where, never how
 * a device perceives it. An event about a player no longer in the game is
 * dropped: the subs have nothing to play it on.
 */
class DoomNetEvents {
    /**
     * @param {DoomNetEntityIds} ids
     * @param {DoomPlayerRoster} roster
     */
    constructor(ids, roster) {
        this._ids      = ids;
        this._roster   = roster;
        this._events   = [];
        this._listener = (event) => this._record(event);
    }

    // The listener to add to the turn events.
    getListener() {
        return this._listener;
    }

    /**
     * @returns {object[]} the events recorded since the previous drain
     */
    drain() {
        const events = this._events;
        this._events = [];

        return events;
    }

    _record(event) {
        const converted = this[DoomNetEvents.CONVERTERS[event.type]](event);
        if (converted !== null) {
            this._events.push(Object.assign({type: event.type}, converted));
        }
    }

    _convertSoundAt(event) {
        return Object.assign({point: event.point}, this._sound(event));
    }

    _convertSoundFromBody(event) {
        return Object.assign({body: this._ids.idOfView(event.body)}, this._sound(event));
    }

    // Where the player stood: a sub that does not hold that player plays it from there.
    _convertSoundFromPlayer(event) {
        const player = this._playerId(event.user);

        return ((player !== null) ? {name: event.name, player: player, channel: event.channel, point: DoomSoundSystem.playerEarPoint(event.user)} : null);
    }

    _convertSoundToPlayer(event) {
        const player = this._playerId(event.user);

        return ((player !== null) ? {name: event.name, player: player} : null);
    }

    _convertEffect(event) {
        return {
            name:       event.name,
            x:          event.x,
            y:          event.y,
            z:          event.z,
            startFrame: event.startFrame,
            elapsed:    event.elapsed,
            jitterY:    event.jitterY,
            velocity:   event.velocity,
            mirror:     event.mirror,
            roll:       event.roll,
            follow:     this._follow(event.follow)
        };
    }

    _convertDecal(event) {
        return {
            key:      event.key,
            variant:  event.variant,
            position: event.position,
            rotation: event.rotation,
            owner:    ((event.owner !== null) ? this._ids.idOfInstance(event.owner) : null),
            fade:     event.fade
        };
    }

    _convertPlayerTeleported(event) {
        const player = this._playerId(event.user);

        return ((player !== null) ? {player: player} : null);
    }

    _sound(event) {
        return {
            name:        event.name,
            attenuation: (event.options.attenuation ?? null),
            replaceKey:  (event.options.replaceKey ?? null)
        };
    }

    /**
     * @returns {int|null} null once the body's player left the game
     */
    _playerId(user) {
        const player = this._roster.getByUser(user);

        return ((player !== null) ? player.getId() : null);
    }

    // An effect that followed a player gone stands where it was spawned.
    _follow(follow) {
        if (follow === null) {
            return null;
        }
        if (follow.target instanceof DoomBodyView) {
            return {player: null, body: this._ids.idOfView(follow.target), ahead: follow.ahead};
        }
        const player = this._playerId(follow.target);

        return ((player !== null) ? {player: player, body: null, ahead: follow.ahead} : null);
    }
}

// Event type → the method that turns it into its message record.
DoomNetEvents.CONVERTERS = {
    [DoomTurnEvents.SOUND_AT]:          '_convertSoundAt',
    [DoomTurnEvents.SOUND_FROM_BODY]:   '_convertSoundFromBody',
    [DoomTurnEvents.SOUND_FROM_PLAYER]: '_convertSoundFromPlayer',
    [DoomTurnEvents.SOUND_TO_PLAYER]:   '_convertSoundToPlayer',
    [DoomTurnEvents.EFFECT]:            '_convertEffect',
    [DoomTurnEvents.DECAL]:             '_convertDecal',
    [DoomTurnEvents.PLAYER_TELEPORTED]: '_convertPlayerTeleported'
};
