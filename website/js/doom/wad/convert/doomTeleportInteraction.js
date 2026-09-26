/**
 * Teleport interaction: when a player crosses a teleport pad, it moves that
 * player to the landing (thing type 14) of the same tag. Reuses the spawn
 * override pattern (set position + yaw, resync tracking, snap to floor). A short
 * cooldown per player prevents an immediate re-trigger after arrival.
 */
class DoomTeleportInteraction extends AbstractInteraction {
    /**
     * @param {string}            code        - unique interaction code, shared with the Instance
     * @param {object}            destination - {x, y, z, yaw} in world coordinates
     * @param {DoomMonsterSystem} monsters    - telefrag pool (a player teleport stomps)
     * @param {DoomSimulation}    simulation  - teleport fog source, told of the arrival
     */
    constructor(code, destination, monsters = null, simulation = null) {
        super();
        this._code        = code;
        this._destination = destination;
        this._monsters    = monsters;
        this._simulation  = simulation;
        this._cooldowns   = new Map();   // user → ms left before this pad takes them again
    }

    get code() {
        return this._code;
    }

    triggered(instance, user) {
        if (this._cooldowns.has(user)) {
            return;
        }
        const world = loader.world().get();
        const dest  = this._destination;
        const fromX = user.x;
        const fromY = user.y;
        const fromZ = user.z;

        user.x   = dest.x;
        user.y   = dest.y;
        user.z   = dest.z;
        user.yaw = dest.yaw;
        user.syncPositionTracking();

        // Land at ONFLOORZ (EV_Teleport): the landing sector may be a mover,
        // so the floor is resolved LIVE, searched from the sector's ceiling —
        // dest.y is only the build-time fallback set above.
        const floorY = world.getCollision().getFloor(user.x, user.z, user.getRadius(), dest.topY);
        if (floorY !== -Infinity) {
            user.y = floorY;
        }
        // P_Teleport thing->vel = 0: no drift through the freeze (airborne or
        // icy arrivals), and no fall billed across the two rooms.
        user.haltMotion();

        // P_TeleportMove: a PLAYER arrival always stomps — any live body
        // overlapping the landing takes the 10000 telefrag (guaranteed gib).
        this._stompMonsters(user);
        this._stompPlayers(user, world);

        if (this._simulation !== null) {
            const effects = this._simulation.getEffects();
            if (effects !== null) {
                effects.spawnTeleportFogs(fromX, fromY, fromZ, user.x, user.y, user.z,
                    WadGeometry.doomAngleYaw(user.yaw));
            }
            this._simulation.notifyPlayerTeleported(user);
        }
        user.freezeControls(WadConstants.TELEPORT_FREEZE_TICS * WadConstants.SECONDS_PER_TIC);

        this._cooldowns.set(user, WadConstants.TELEPORT_COOLDOWN_MS);
    }

    _stompMonsters(user) {
        const damage = ((this._monsters !== null) ? this._monsters.getDamageModule() : null);
        if (damage === null) {
            return;
        }
        for (const m of this._monsters.getMonsters()) {
            if (m.dead) {
                continue;
            }
            const p = m.inst.getTransform().position;
            if (WadGeometry.boxesOverlap2d(p[0], p[2], m.inst.getCollisionRadius(), user.x, user.z, user.getRadius())) {
                damage.damage(m, WadConstants.TELEFRAG_DAMAGE, {});
            }
        }
    }

    _stompPlayers(user, world) {
        for (const other of world.getUsers()) {
            if ((other !== user) && !other.isDead()
                && WadGeometry.boxesOverlap2d(other.x, other.z, other.getRadius(), user.x, user.z, user.getRadius())) {
                other.takeDamage(WadConstants.TELEFRAG_DAMAGE);
            }
        }
    }

    update(dt) {
        for (const [user, ms] of this._cooldowns) {
            if (ms > dt) {
                this._cooldowns.set(user, ms - dt);
            } else {
                this._cooldowns.delete(user);
            }
        }
    }
}
