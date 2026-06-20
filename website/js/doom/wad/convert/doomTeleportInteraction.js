/**
 * Teleport interaction: when the player enters a teleport pad's proximity, it
 * moves them to the landing (thing type 14) of the same tag. Reuses the spawn
 * override pattern (set position + yaw, resync tracking, snap to floor). A short
 * cooldown prevents an immediate re-trigger after arrival.
 */
class DoomTeleportInteraction extends AbstractInteraction {
    /**
     * @param {string} code        - unique interaction code, shared with the Instance
     * @param {object} destination - {x, y, z, yaw} in world coordinates
     */
    constructor(code, destination) {
        super();
        this._code        = code;
        this._destination = destination;
        this._cooldown    = 0;
    }

    get code() {
        return this._code;
    }

    triggered(instance) {
        if (this._cooldown > 0) {
            return;
        }
        const world = loader.world().get();
        const user  = world.getUser();
        const dest  = this._destination;

        user.x   = dest.x;
        user.y   = dest.y;
        user.z   = dest.z;
        user.yaw = dest.yaw;
        user.syncPositionTracking();

        // Snap onto the landing sector floor (dest.y is the search ceiling),
        // exactly like DoomGame._applySpawnOverride.
        const floorY = world.getCollision().getFloor(user.x, user.z, user.getRadius(), user.y);
        if (floorY !== -Infinity) {
            user.y = floorY;
        }

        this._cooldown = WadConstants.TELEPORT_COOLDOWN_MS;
    }

    update(dt) {
        if (this._cooldown > 0) {
            this._cooldown -= dt;
        }
    }
}
