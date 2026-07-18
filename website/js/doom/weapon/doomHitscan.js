// Hitscan attacks (bullets, pellets, melee) — P_BulletSlope / P_GunShot /
// P_LineAttack. Free aim (yaw + pitch, gzdoom mouselook): each ray is cast from
// the eye through the world; the first surface it meets gets a puff, pulled a
// little in front of it (vanilla backs the puff off 4 map units). A ray into the
// sky meets no geometry → no hit → no puff, exactly like Doom. Damage rolls are
// computed but only matter once there are things to hit.
class DoomHitscan {
    constructor(collision, effects, rng) {
        this._collision = collision;
        this._effects   = effects;
        this._rng       = rng;
    }

    // A ranged weapon shot: one ray per pellet. accurate (the first pistol /
    // chaingun shot) fires straight; otherwise each pellet spreads.
    fire(def, user, accurate) {
        const spreadH = def.getSpreadH();
        const spreadV = def.getSpreadV();
        const range   = def.getRange();
        for (let i = 0; i < def.getPellets(); i++) {
            let yaw   = user.yaw;
            let pitch = user.pitch;
            if (!accurate) {
                yaw   += spreadH * this._rng.nextDiff();
                pitch += spreadV * this._rng.nextDiff();
            }
            this._shootRay(user, yaw, pitch, range, false);
        }
    }

    // A_Punch / A_Saw: a single short-range ray with horizontal spread; a melee
    // puff starts at frame C (no bright spark).
    fireMelee(def, user) {
        const yaw = user.yaw + def.getSpreadH() * this._rng.nextDiff();
        this._shootRay(user, yaw, user.pitch, def.getRange(), true);
    }

    _shootRay(user, yaw, pitch, range, melee) {
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
        if (hit === null) {
            return;
        }
        // Pull the puff in front of the surface (vanilla: 4 map units back).
        const back = 4 * WadConstants.SCALE;
        this._effects.spawnPuff(
            hit.point[0] - dx * back,
            hit.point[1] - dy * back,
            hit.point[2] - dz * back,
            melee
        );
    }
}
