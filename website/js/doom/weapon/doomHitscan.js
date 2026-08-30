/**
 * Hitscan attacks (bullets, pellets, melee) — P_BulletSlope / P_GunShot /
 * P_LineAttack. Free aim (yaw + pitch, gzdoom mouselook): each ray is cast from
 * the eye through the world; the first surface it meets gets a puff, pulled a
 * little in front of it (vanilla backs the puff off 4 map units). A ray into the
 * sky meets no geometry → no hit → no puff, exactly like Doom.
 *
 * Monsters shoot through the same rays (fireMonster): only the origin, the aim
 * and the damage table differ — they have no free look, so their pellets share
 * one vertical slope computed once on the target (AimLineAttack), and only the
 * yaw spreads.
 */
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

    // Melee outcome sound (the fist punches only on a hit, the chainsaw roars
    // either way with two different lumps) — the player's own, position-less.
    _playMeleeSound(def, melee, hit) {
        if (!melee) {
            return;
        }
        const sound = ((hit) ? def.getMeleeHitSound() : def.getMeleeMissSound());
        if (sound !== null) {
            doomSound.playAt(sound, null, {replaceKey: 'player:weapon'});
        }
    }

    // Impact ring at the hit point (Heretic blaster crash) — most weapons
    // carry none.
    _playImpactSound(def, point) {
        if (def.getImpactSound() !== null) {
            doomSound.playAt(def.getImpactSound(), [point[0], point[1], point[2]]);
        }
    }

    /**
     * A monster's bullet volley (A_PosAttack / A_SPosAttack / A_CPosAttack).
     * The vertical aim is taken ONCE on the target and shared by every pellet,
     * like the single AimLineAttack call that opens those functions; only the
     * yaw spreads. The shot leaves the body centre plus AttackOffset.
     *
     * @param {object} shooter monster record
     * @param {object} target  the victim it is aiming at (player or monster)
     * @param {object} spec    {rays, damage: {base, dice, flat?}, puff}
     */
    fireMonster(shooter, target, spec) {
        if ((target === null) || (this._damage === null)) {
            return;
        }
        const origin = DoomHitscan.attackOrigin(shooter);
        // The heading is the shooter's own facing, which A_FaceTarget has just
        // set — never a fresh bearing to the target. That is what carries the
        // MF_SHADOW miss into the bullets, exactly like vanilla, where the
        // volley leaves along self.angle. The slope still comes from the
        // target (AimLineAttack), which vanilla never randomises.
        const yaw    = WadGeometry.doomAngleYaw(DoomActorRef.facing(shooter));
        const pitch  = DoomHitscan._aimAt(origin, target).pitch;
        const range  = WadConstants.MONSTER_ATTACK_RANGE * WadConstants.SCALE;
        const rays   = (spec.rays ?? 1);
        for (let i = 0; i < rays; i++) {
            this._shootMonsterRay(shooter, origin, yaw + WadConstants.MONSTER_BULLET_SPREAD * this._rng.nextDiff(),
                pitch, range, spec);
        }
    }

    /**
     * Where a monster's shot leaves its body: the centre plus AttackOffset
     * (actorinlines.h — 8 units for a non-player), never the sprite top.
     *
     * @returns {number[]} [x, y, z] world
     */
    static attackOrigin(shooter) {
        return [
            DoomActorRef.x(shooter),
            DoomActorRef.centerY(shooter) + WadConstants.MONSTER_ATTACK_Z_OFFSET * WadConstants.SCALE,
            DoomActorRef.z(shooter)
        ];
    }

    // Vertical slope from a point onto a body's centre — what AimLineAttack
    // lands on when the target stands in the firing cone. The yaw it also
    // returns is the exact bearing, used only where no facing applies.
    static _aimAt(origin, target) {
        const dx = DoomActorRef.x(target) - origin[0];
        const dz = DoomActorRef.z(target) - origin[2];
        const dy = DoomActorRef.centerY(target) - origin[1];
        const flat = Math.hypot(dx, dz);

        return {
            yaw:   Math.atan2(dx, dz) / DEG_TO_RAD,
            pitch: Math.atan2(dy, ((flat > 1e-6) ? flat : 1e-6)) / DEG_TO_RAD
        };
    }

    _shootMonsterRay(shooter, origin, yaw, pitch, range, spec) {
        const dir = DoomHitscan._direction(yaw, pitch);
        const hit = this._collision.raycast(origin[0], origin[1], origin[2],
            dir[0], dir[1], dir[2], range, {floors: true, ceilings: true, dynamic: true});
        const flesh = ((this._monsters !== null)
            ? this._monsters.traceRay(origin[0], origin[1], origin[2], dir[0], dir[1], dir[2],
                ((hit !== null) ? Math.min(hit.dist, range) : range), {exclude: shooter, includePlayer: true})
            : null);

        if (flesh !== null) {
            // No species filter here: vanilla only spares a relative from a
            // MISSILE (CanAttackHurt is called from PIT_CheckThing alone), which
            // is why a chaingunner's spray tears through its own kin.
            const damage = this._rng.damageRoll(spec.damage);
            const point  = WadGeometry.pullBack(flesh.point, dir, 10);
            this._damage.damage(flesh.ref, damage, {point: point, source: shooter});
            // Vanilla only draws the puff on a bloodless victim; everything
            // else bleeds (P_LineAttack).
            if (DoomActorRef.isMonster(flesh.ref) && (flesh.ref.def.getFlags().noBlood === true)) {
                this._effects.spawnPuff(spec.puff, point[0], point[1], point[2], false);
            }
            return;
        }
        if (hit === null) {
            return;
        }
        const at = WadGeometry.pullBack(hit.point, dir);
        this._effects.spawnPuff(spec.puff, at[0], at[1], at[2], false);
    }

    // Unit ray of a yaw/pitch pair, in the engine's world convention.
    static _direction(yaw, pitch) {
        const yawR   = yaw * DEG_TO_RAD;
        const pitchR = pitch * DEG_TO_RAD;
        const cp = Math.cos(pitchR);

        return [Math.sin(yawR) * cp, Math.sin(pitchR), Math.cos(yawR) * cp];
    }

    _shootRay(def, user, yaw, pitch, melee) {
        const range  = def.getRange();
        const [dx, dy, dz] = DoomHitscan._direction(yaw, pitch);

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
            this._playMeleeSound(def, melee, true);
            this._playImpactSound(def, flesh.point);
            this._hitFlesh(def, user, flesh, [dx, dy, dz], melee);
            return;
        }
        this._playMeleeSound(def, melee, false);
        if (hit === null) {
            return;
        }
        this._playImpactSound(def, hit.point);
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
        let damage = this._rng.damageRoll(spec);
        if ((def.getBerserkItem() !== null) && user.hasItem(def.getBerserkItem())) {
            damage *= def.getBerserkFactor();
        }
        const point = WadGeometry.pullBack(flesh.point, dir, 10);
        this._damage.damage(flesh.ref, damage, {
            point:    point,
            source:   user,
            srcX:     user.getCameraX(),
            srcZ:     user.getCameraZ(),
            kickback: def.getKickback()
        });
        if (def.isPuffOnMonsters() || (flesh.ref.def.getFlags().noBlood === true)) {
            this._effects.spawnPuff(def.getPuffType(), point[0], point[1], point[2], melee);
        }
    }
}
