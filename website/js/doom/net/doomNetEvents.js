/**
 * The one-shot events of a turn as the turn message carries them: a listener
 * of DoomTurnEvents that keeps each event with its references turned into
 * network ids — a body by its id, a player by its player id, the mover a decal
 * rides by its instance's id. An event says what happens and where, never how
 * a device perceives it.
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
        const converter = DoomNetEvents.CONVERTERS[event.type];
        this._events.push(Object.assign({type: event.type}, converter.call(this, event)));
    }

    _sound(event) {
        return {
            name:        event.name,
            attenuation: (event.options.attenuation ?? null),
            replaceKey:  (event.options.replaceKey ?? null)
        };
    }

    _playerId(user) {
        return this._roster.getByUser(user).getId();
    }

    _follow(follow) {
        if (follow === null) {
            return null;
        }
        const isBody = (follow.target instanceof DoomBodyView);

        return {
            player: ((isBody) ? null : this._playerId(follow.target)),
            body:   ((isBody) ? this._ids.idOfView(follow.target) : null),
            ahead:  follow.ahead
        };
    }
}

DoomNetEvents.CONVERTERS = {
    [DoomTurnEvents.SOUND_AT]: function (event) {
        return Object.assign({point: event.point}, this._sound(event));
    },
    [DoomTurnEvents.SOUND_FROM_BODY]: function (event) {
        return Object.assign({body: this._ids.idOfView(event.body)}, this._sound(event));
    },
    [DoomTurnEvents.SOUND_FROM_PLAYER]: function (event) {
        return {name: event.name, player: this._playerId(event.user), channel: event.channel};
    },
    [DoomTurnEvents.SOUND_TO_PLAYER]: function (event) {
        return {name: event.name, player: this._playerId(event.user)};
    },
    [DoomTurnEvents.EFFECT]: function (event) {
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
    },
    [DoomTurnEvents.DECAL]: function (event) {
        return {
            key:      event.key,
            variant:  event.variant,
            position: event.position,
            rotation: event.rotation,
            owner:    ((event.owner !== null) ? this._ids.idOfInstance(event.owner) : null),
            fade:     event.fade
        };
    },
    [DoomTurnEvents.PLAYER_TELEPORTED]: function (event) {
        return {player: this._playerId(event.user)};
    }
};
