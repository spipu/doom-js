// Hitscan attacks (bullets, pellets, melee) — P_BulletSlope / P_GunShot /
// P_LineAttack. Free aim (yaw + pitch, gzdoom mouselook): each ray is cast from
// the eye through the world; the first surface it meets gets a puff, pulled a
// little in front of it (vanilla backs the puff off 4 map units). A ray into the
// sky meets no geometry → no hit → no puff, exactly like Doom. Damage rolls are
// computed but only matter once there are things to hit.
class DoomHitscan {
    constructor(collision, effects, rng, decals, gunTriggers = null) {
        this._collision   = collision;
        this._effects     = effects;
        this._rng         = rng;
        this._decals      = decals;
        this._gunTriggers = gunTriggers;
    }

    // A ranged weapon shot: one ray per pellet. accurate (the first pistol /
    // chaingun shot) fires straight; otherwise each pellet spreads.
    fire(def, user, accurate) {
        const spreadH = def.getSpreadH();
        const spreadV = def.getSpreadV();
        for (let i = 0; i < def.getPellets(); i++) {
            let yaw   = user.yaw;
            let pitch = user.pitch;
            if (!accurate) {
                yaw   += spreadH * this._rng.nextDiff();
                pitch += spreadV * this._rng.nextDiff();
            }
            this._shootRay(def, user, yaw, pitch, false);
        }
    }

    // Melee swing (A_Punch / A_Saw, Heretic staff/gauntlets): a single
    // short-range ray with horizontal spread; the melee puff skips its bright
    // spark frames (the def's effect template says where it starts).
    fireMelee(def, user) {
        const yaw = user.yaw + def.getSpreadH() * this._rng.nextDiff();
        this._shootRay(def, user, yaw, user.pitch, true);
    }

    _shootRay(def, user, yaw, pitch, melee) {
        const range  = def.getRange();
        const yawR   = yaw * DEG_TO_RAD;
        const pitchR = pitch * DEG_TO_RAD;
        const cp = Math.cos(pitchR);
        const dx = Math.sin(yawR) * cp;
        const dy = Math.sin(pitchR);
        const dz = Math.cos(yawR) * cp;

        const hit = this._collision.raycast(
            user.getCameraX(), user.getCameraY(), user.getCameraZ(),
            dx, dy, dz, range, { floors: true, ceilings: true, dynamic: true }
        );
        // Impact specials (24/46/47) fire on the 2D trace, hit or not — a shot
        // into the sky above a low shootable wall still crosses its line.
        if (this._gunTriggers !== null) {
            const endX = ((hit !== null) ? hit.point[0] : user.getCameraX() + dx * range);
            const endZ = ((hit !== null) ? hit.point[2] : user.getCameraZ() + dz * range);
            this._gunTriggers.onTrace(user.getCameraX(), user.getCameraZ(), endX, endZ);
        }
        if (hit === null) {
            return;
        }
        // Pull the puff in front of the surface (vanilla: 4 map units back).
        // The puff and decal are per-weapon def data (profile catalogs).
        const back = 4 * WadConstants.SCALE;
        this._effects.spawnPuff(
            def.getPuffType(),
            hit.point[0] - dx * back,
            hit.point[1] - dy * back,
            hit.point[2] - dz * back,
            melee
        );
        // Persistent impact mark on the wall (self-filters floors/ceilings);
        // a null decal type leaves no mark (Heretic melee weapons).
        if ((this._decals !== null) && (def.getDecalType() !== null)) {
            this._decals.spawnWallDecal(def.getDecalType(), hit.point, hit.normal, [dx, dy, dz], hit.tri.instance);
        }
    }
}
