/**
 * One reading of a body, whoever it is: the player (a DoomUser) or a monster
 * (a DoomMonsterSystem record). Every attack rule of the original is written
 * against `AActor`, which both of them are there — melee reach, missile aim,
 * damage, retargeting. Without this adapter each of those rules would have to
 * be written twice, and the infighting could never share the player's code.
 *
 * A monster record is recognised by its engine instance; anything else is the
 * player. Distances come back in WORLD units, like the collision layer.
 */
class DoomActorRef {
    static isPlayer(ref) {
        return ((ref !== null) && (ref.inst === undefined));
    }

    static isMonster(ref) {
        return ((ref !== null) && (ref.inst !== undefined));
    }

    static x(ref) {
        return ((DoomActorRef.isPlayer(ref)) ? ref.x : ref.inst.getTransform().position[0]);
    }

    static z(ref) {
        return ((DoomActorRef.isPlayer(ref)) ? ref.z : ref.inst.getTransform().position[2]);
    }

    // Feet altitude — the actor origin in both worlds.
    static feetY(ref) {
        return ((DoomActorRef.isPlayer(ref)) ? ref.y : ref.inst.getTransform().position[1]);
    }

    // The ACTOR height, never the drawn one: a monster's billboard pulses with
    // every animation frame, while `thing->height` is what the melee and
    // missile tests read.
    static height(ref) {
        return ((DoomActorRef.isPlayer(ref))
            ? ref.getCurrentHeight()
            : (ref.def.getHeight() * WadConstants.SCALE));
    }

    static radius(ref) {
        return ((DoomActorRef.isPlayer(ref)) ? ref.getRadius() : ref.inst.getCollisionRadius());
    }

    static centerY(ref) {
        return (DoomActorRef.feetY(ref) + DoomActorRef.height(ref) / 2);
    }

    static topY(ref) {
        return (DoomActorRef.feetY(ref) + DoomActorRef.height(ref));
    }

    static isDead(ref) {
        return ((DoomActorRef.isPlayer(ref)) ? ref.isDead() : (ref.dead === true));
    }

    // Heading in DOOM degrees (0 = east), the space every attack angle of the
    // sources is written in — the player's engine yaw is converted, a monster
    // already stores it that way.
    static facing(ref) {
        return ((DoomActorRef.isPlayer(ref)) ? WadGeometry.doomAngleYaw(ref.yaw) : ref.facing);
    }

    /**
     * A point `units` map units in front of a body, at its feet (Vec3Angle):
     * where the archvile plants its hellfire and where a teleport fog appears.
     *
     * @returns {number[]} [x, y, z] world
     */
    static aheadOf(ref, units) {
        return DoomActorRef.pointAt(ref, DoomActorRef.facing(ref), units);
    }

    /**
     * A point `units` map units from a body's origin along an arbitrary Doom
     * heading (Vec3Angle) — the archvile calls its hellfire back along its OWN
     * angle, not the victim's.
     *
     * @returns {number[]} [x, y, z] world
     */
    static pointAt(ref, angleDeg, units) {
        const reach = units * WadConstants.SCALE;
        const angle = angleDeg * DEG_TO_RAD;

        return [
            DoomActorRef.x(ref) + Math.cos(angle) * reach,
            DoomActorRef.feetY(ref),
            DoomActorRef.z(ref) + Math.sin(angle) * reach
        ];
    }

    // Species of a body, the key of the vanilla infighting rule
    // (P_ProjectileImmune): the player belongs to none, so nothing ever spares
    // them. A monster inherits its def's code, so the two spectres of a pair
    // are one species while a spectre and an imp are not.
    static species(ref) {
        return ((DoomActorRef.isPlayer(ref)) ? null : ref.def.getCode());
    }

    // Squared 2D distance between two bodies (world units) — the shape every
    // range test wants, none of them needing the square root.
    static distance2dSq(a, b) {
        const dx = DoomActorRef.x(a) - DoomActorRef.x(b);
        const dz = DoomActorRef.z(a) - DoomActorRef.z(b);

        return ((dx * dx) + (dz * dz));
    }

    static distance2d(a, b) {
        return Math.sqrt(DoomActorRef.distance2dSq(a, b));
    }
}
