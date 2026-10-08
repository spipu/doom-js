/**
 * Where a player's body goes in the running level: its own start, a free one,
 * a deathmatch start drawn at random (G_CheckSpot / G_DeathMatchSpawnPlayer),
 * and the drop onto the floor under the spot.
 */
class DoomPlayerSpawner {
    /**
     * @param {object}            playerStarts     - slot → {x, y, z, yaw}, the map's player starts
     * @param {object[]}          deathmatchStarts - {x, y, z, yaw}, the map's deathmatch starts
     * @param {World}             world
     * @param {DoomMonsterSystem} monsters         - tells whether a spot is taken
     * @param {DoomRandom}        rng              - the game's sequence, drawn for the deathmatch starts
     */
    constructor(playerStarts, deathmatchStarts, world, monsters, rng) {
        this._playerStarts     = playerStarts;
        this._deathmatchStarts = deathmatchStarts;
        this._world            = world;
        this._monsters         = monsters;
        this._rng              = rng;
    }

    /**
     * @param {int}     slot       - the player id until the lobby hands the slots out
     * @param {boolean} deathmatch - the rules spawn at the deathmatch starts
     * @returns {{x: number, y: number, z: number, yaw: number}}
     */
    spawnSpot(slot, deathmatch) {
        return ((deathmatch) ? this._deathmatchStart(slot) : this._freeStart(slot));
    }

    /**
     * Puts a body on a spot: the given Y is the floor-search ceiling, like the
     * initial snap in World.finalizeInit, the body drops onto the floor below it.
     *
     * @param {User}     user
     * @param {number[]} position - [x, y, z]
     * @param {number}   yaw
     * @param {number}   pitch
     */
    placeUser(user, position, yaw, pitch) {
        user.x     = position[0];
        user.y     = position[1];
        user.z     = position[2];
        user.yaw   = yaw;
        user.pitch = pitch;
        user.syncPositionTracking();

        const floorY = this._world.getCollision().getFloor(user.x, user.z, user.getRadius(), user.y);
        if (floorY !== -Infinity) {
            user.y = floorY;
        }
    }

    // G_DeathMatchSpawnPlayer: twenty random draws for a free deathmatch start,
    // then the player's own start (a map without any falls back on it too).
    _deathmatchStart(slot) {
        const radius = this._world.getUser().getRadius();
        if (this._deathmatchStarts.length > 0) {
            for (let tries = 0; tries < DoomPlayerSpawner.DEATHMATCH_SPAWN_TRIES; tries++) {
                const start = this._deathmatchStarts[this._rng.next() % this._deathmatchStarts.length];
                if (!this._monsters.isSpotOccupied(start.x, start.z, radius)) {
                    return start;
                }
            }
        }

        return this._freeStart(slot);
    }

    // G_CheckSpot / G_DoReborn: its own start when free, else another free
    // start, else its own anyway, else the player 1 start of a map placing
    // fewer starts.
    _freeStart(slot) {
        const radius = this._world.getUser().getRadius();
        const own    = (this._playerStarts[slot] ?? null);
        const others = Object.keys(this._playerStarts).map(Number).sort((a, b) => (a - b))
            .filter((other) => (other !== slot)).map((other) => this._playerStarts[other]);
        const free   = [own, ...others].find((start) => ((start !== null) && !this._monsters.isSpotOccupied(start.x, start.z, radius)));

        return (free ?? own ?? this._playerStarts[DoomPlayer.MAIN_ID] ?? WadConstants.FALLBACK_SPAWN);
    }
}

// Random deathmatch starts tried for a free one before the player's own start (G_DeathMatchSpawnPlayer).
DoomPlayerSpawner.DEATHMATCH_SPAWN_TRIES = 20;
