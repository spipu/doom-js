/**
 * Where the simulation starts a sprite effect — hitscan puffs, explosions,
 * blood, teleport fog. It draws from the game's random sequence what the
 * spawn of the original draws, at the same moment, and hands the effect to
 * the turn events with those values: whoever animates it draws nothing.
 */
class DoomEffectSpawner {
    /**
     * @param {DoomEffectTemplates} templates
     * @param {DoomRandom}          rng
     * @param {DoomTurnEvents}      events
     */
    constructor(templates, rng, events) {
        this._templates = templates;
        this._rng       = rng;
        this._events    = events;
    }

    // A melee hit starts at the template's meleeStart frame.
    spawnPuff(name, x, y, z, melee) {
        const tpl = this._templates.get(name);
        if (tpl === null) {
            return;
        }
        this.spawn(name, x, y, z, {startFrame: ((melee) ? tpl.meleeStart : 0)});
    }

    /**
     * EV_Teleport fog pair: the arrival fog stands TELEPORT_FOG_AHEAD units
     * ahead so the teleported body does not hide it.
     *
     * @param {boolean} silent skips the teleport ring — an actor carrying its
     *                  own teleport voice (D'Sparil's zap) keeps the fogs only
     */
    spawnTeleportFogs(fromX, fromY, fromZ, toX, toY, toZ, doomAngle, silent = false) {
        this.spawn('teleportFog', fromX, fromY, fromZ);
        this._spawnFogAhead(toX, toY, toZ, doomAngle);
        if (silent) {
            return;
        }
        // Departure and arrival each ring (EV_Teleport, both S_StartSound
        // sites of p_telept.c) — players and monsters alike.
        this._events.soundAt('misc/teleport', [fromX, fromY, fromZ]);
        this._events.soundAt('misc/teleport', [toX, toY, toZ]);
    }

    /**
     * The fog of a player respawning in a netgame (G_CheckSpot): the arrival
     * half of a teleport, ringing too.
     */
    spawnArrivalFog(x, y, z, doomAngle) {
        this._spawnFogAhead(x, y, z, doomAngle);
        this._events.soundAt('misc/teleport', [x, y, z]);
    }

    _spawnFogAhead(x, y, z, doomAngle) {
        const ahead = WadConstants.TELEPORT_FOG_AHEAD * WadConstants.SCALE;
        const rad   = doomAngle * DEG_TO_RAD;
        this.spawn('teleportFog', x + Math.cos(rad) * ahead, y, z + Math.sin(rad) * ahead);
    }

    /**
     * A named effect animation on the given point, lifted by the template's
     * spawnHeight.
     *
     * @param {object} opts {startFrame?: frame to enter the animation on (a
     *                       melee puff starts at C), skipTics?: tics already
     *                       elapsed on that frame, so a row of explosions goes
     *                       off raggedly (A_BrainScream), velocity?: [vx, vy,
     *                       vz] in map units per tic, which replaces the
     *                       template's plain upward drift (a splash chunk is
     *                       thrown out of its ripple), mirror?: draw the
     *                       template's mirrored timelines, ignored by a
     *                       template that declares none, roll?: radians of
     *                       spin in the sprite's own plane}
     * @returns {boolean} false when the template does not exist
     */
    spawn(name, x, y, z, opts = {}) {
        return this._launch(name, x, y, z, opts, null);
    }

    /**
     * An effect that rides a body instead of standing where it was born: the
     * archvile's hellfire, replanted `ahead` map units in front of its victim
     * every tic (A_Fire). It dies of its own animation like any other.
     *
     * @param {object} ref   the body it follows (player or monster)
     * @param {number} ahead map units in front of that body
     */
    spawnTracking(name, ref, ahead) {
        const at = DoomActorRef.aheadOf(ref, ahead);
        // The presentation follows what every device holds: a monster's view.
        const target = ((DoomActorRef.isPlayer(ref)) ? ref : ref.view);
        this._launch(name, at[0], at[1], at[2], {}, {target: target, ahead: ahead});
    }

    _launch(name, x, y, z, opts, follow) {
        const tpl = this._templates.get(name);
        if (tpl === null) {
            return false;
        }
        const jitterY = ((tpl.rise > 0) ? (this._rng.next() - this._rng.next()) / 4096 : 0);
        // th->tics -= P_Random()&3: the puff's first frame is a touch shorter,
        // and a caller may start the animation further in still.
        const elapsed = (((tpl.shorten) ? (this._rng.next() & 3) : 0) + (opts.skipTics ?? 0));
        this._events.effect({
            name:       name,
            x:          x,
            y:          y,
            z:          z,
            startFrame: (opts.startFrame ?? 0),
            elapsed:    elapsed,
            jitterY:    jitterY,
            velocity:   (opts.velocity ?? null),
            // Which way this one faces. The choice is the caller's: the
            // splashes draw it from a random stream of their own, so the
            // game's table keeps the vanilla sequence.
            mirror:     (opts.mirror === true),
            roll:       (opts.roll ?? 0),
            follow:     follow
        });

        return true;
    }
}
