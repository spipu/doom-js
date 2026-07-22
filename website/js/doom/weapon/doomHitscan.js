// Hitscan attacks (bullets, pellets, melee) — P_BulletSlope / P_GunShot /
// P_LineAttack. Free aim (yaw + pitch, gzdoom mouselook): each ray is cast from
// the eye through the world; the first surface it meets gets a puff, pulled a
// little in front of it (vanilla backs the puff off 4 map units). A ray into the
// sky meets no geometry → no hit → no puff, exactly like Doom. Damage rolls are
// computed but only matter once there are things to hit.
class DoomHitscan {
    constructor(collision, effects, rng, decals, gunTriggers = null, monsters = null, damageModule = null) {
        this._collision   = collision;
        this._effects     = effects;
        this._rng         = rng;
        this._decals      = decals;
        this._gunTriggers = gunTriggers;
        this._monsters    = monsters;
        this._damage      = damageModule;
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
        // A live body crossing the ray before the wall soaks the shot
        // (PTR_ShootTraverse stops on the first thing).
        const flesh = ((this._monsters !== null)
            ? this._monsters.traceRay(user.getCameraX(), user.getCameraY(), user.getCameraZ(), dx, dy, dz, ((hit !== null) ? Math.min(hit.dist, range) : range))
            : null);
        // Impact specials (24/46/47) fire on the 2D trace, hit or not — a shot
        // into the sky above a low shootable wall still crosses its line; a
        // shot stopped by flesh only reaches the flesh.
        if (this._gunTriggers !== null) {
            const end = ((flesh !== null) ? flesh.point : ((hit !== null) ? hit.point : null));
            const endX = ((end !== null) ? end[0] : user.getCameraX() + dx * range);
            const endZ = ((end !== null) ? end[2] : user.getCameraZ() + dz * range);
            this._gunTriggers.onTrace(user.getCameraX(), user.getCameraZ(), endX, endZ);
        }
        if (flesh !== null) {
            this._hitFlesh(def, user, flesh, [dx, dy, dz], melee);
            return;
        }
        if (hit === null) {
            return;
        }
        // Persistent impact mark on the wall (self-filters floors/ceilings);
        // a null decal type leaves no mark (Heretic melee weapons). Spawned
        // BEFORE the puff: instances draw in id order and an additive puff
        // writes no depth — a decal drawn after it would paint over it even
        // though the puff sits 4 map units in front.
        if ((this._decals !== null) && (def.getDecalType() !== null)) {
            this._decals.spawnWallDecal(def.getDecalType(), hit.point, hit.normal, [dx, dy, dz], hit.tri.instance);
        }
        // Pull the puff in front of the surface (vanilla: 4 map units back).
        // The puff and decal are per-weapon def data (profile catalogs).
        const at = WadGeometry.pullBack(hit.point, [dx, dy, dz]);
        this._effects.spawnPuff(def.getPuffType(), at[0], at[1], at[2], melee);
    }

    // One pellet landing on a body: roll the weapon's damage (the fist is
    // multiplied under the berserk strength), feed the shared damage pipeline
    // (blood/pain/death/thrust). Only the Heretic-style weapons show their
    // puff on flesh — plus every bloodless target (P_ShootThing spawns the
    // puff on MF_NOBLOOD: a shot barrel sparks). Never a wall decal.
    _hitFlesh(def, user, flesh, dir, melee) {
        const spec = def.getDamageSpec();
        if ((spec === null) || (this._damage === null)) {
            return;
        }
        let damage = (spec.flat ?? 0) + spec.base * (1 + this._rng.next() % spec.dice);
        if ((def.getBerserkItem() !== null) && user.hasItem(def.getBerserkItem())) {
            damage *= def.getBerserkFactor();
        }
        const point = WadGeometry.pullBack(flesh.point, dir);
        this._damage.damage(flesh.record, damage, {
            point:    point,
            srcX:     user.getCameraX(),
            srcZ:     user.getCameraZ(),
            kickback: def.getKickback()
        });
        if (def.isPuffOnMonsters() || (flesh.record.def.getFlags().noBlood === true)) {
            this._effects.spawnPuff(def.getPuffType(), point[0], point[1], point[2], melee);
        }
    }
}
