/**
 * Moving projectiles, whoever fires them. A player shot leaves the eye along
 * the free-aim direction (P_SpawnPlayerMissile); a monster shot leaves 32 units
 * above its feet along the feet→feet vector to its victim (P_SpawnMissile —
 * monsters have no free look). From there both live the same life: one tic at a
 * time, raycasting the segment just crossed for a wall/floor/ceiling and for a
 * live body, which soaks the direct hit (impactDamage roll) before the death
 * effect and the A_Explode blast, all through the shared damage pipeline. A
 * missile never hits the body that fired it, and spares the victims that body
 * cannot hurt (same species). The BFG ball fires its vanilla shooter-side spray
 * on detonation. All the data comes from the game profile's projectileDefs().
 */
class DoomProjectileSystem {
    constructor(spriteBank, effects, rng, decals, profile, monsters = null, damageModule = null) {
        this._effects   = effects;
        this._rng       = rng;
        this._decals    = decals;
        this._monsters  = monsters;
        this._damage    = damageModule;
        this._collision = null;
        this._user      = null;
        this._fast      = false;
        this._active    = [];
        this._acc       = 0;
        this._ticCount  = 0;
        this._defs      = this._buildDefs(spriteBank, profile);
    }

    setWorld(collision, user) {
        this._collision = collision;
        this._user      = user;
        return this;
    }

    // Fast-monsters skill: every missile declaring a FastSpeed flies at it
    // (P_SetState reads it on spawn). Set once per level, before any shot.
    setFastMonsters(fast) {
        this._fast = (fast === true);
        return this;
    }

    // Flight speed of a kind under the current skill (world units per tic).
    _speedOf(def) {
        return (((this._fast) && (def.fastSpeed !== null)) ? def.fastSpeed : def.speed);
    }

    _buildDefs(bank, profile) {
        const defs = {};
        for (const spec of profile.projectileDefs()) {
            defs[spec.kind] = this._buildDef(bank, spec);
        }
        return defs;
    }

    // In-flight billboard(s) + kinematics for one projectile kind; null if the
    // WAD lacks the sprites. speed/gravity are in map units per tic (squared
    // for gravity), converted to world units.
    _buildDef(bank, spec) {
        const scale  = WadConstants.SCALE;
        const frames = [];
        for (const letter of spec.letters) {
            const spr = this._pickSprite(bank, spec.sprite, letter);
            if (spr === null) {
                return null;
            }
            const geo = WadGeometry.spriteBillboardData(spr);
            frames.push({
                objId:  loader.objects().loadBillboardFromData(null, {
                    textures:      [spr.texId],
                    halfWidth:     geo.halfWidth,
                    height:        geo.height,
                    anchorOffsetX: geo.anchorOffsetX,
                    anchorOffsetY: 0,
                    light:         255,
                    alpha:         spec.alpha,
                    additive:      spec.additive,
                }),
                height: geo.height,
            });
        }
        return {
            kind:             spec.kind,
            frames,
            speed:            spec.speed * scale,
            // FastSpeed (actor.zs): the nightmare skill swaps it in on spawn.
            fastSpeed:        ((spec.fastSpeed !== undefined) ? spec.fastSpeed * scale : null),
            flightTics:       spec.flightTics,
            explosion:        spec.explosion,
            splashDamage:     spec.splashDamage,
            impactDamage:     spec.impactDamage ?? 0,
            kickback:         spec.kickback ?? null,
            spray:            spec.spray ?? null,
            decalType:        spec.decalType ?? null,
            gravity:          (spec.gravity ?? 0) * scale,
            gravityDelayTics: spec.gravityDelayTics ?? 0,
            dropSpeed:        (spec.dropSpeed ?? 0) * scale,
            lob:              (spec.lob === true),
            trailEffect:      spec.trailEffect ?? null,
            trailEveryTics:   spec.trailEveryTics ?? 0,
            // Floor bounce (Heretic mace family): {damping, minVz (u/tic,
            // pre-damping energy floor), maxBounces, spawnKind (balls spat
            // sideways at each bounce)} — null = explode on any impact.
            bounce:           spec.bounce ?? null,
            // Muzzle height in map units above the FEET (A_FireMacePL1 spawns
            // the lobbed ball at Pos + 28); null = the eye (camera) height.
            spawnHeight:      ((spec.spawnHeight !== undefined) ? spec.spawnHeight * scale : null),
            // Homing (A_SeekerMissile / A_Tracer2): {threshold, turnMax} in
            // degrees, everyTics = the state cadence the vanilla action runs
            // at. null = it flies straight.
            seek:             (spec.seek ?? null),
            // Ripping shot (Heretic Whirlwind): it passes THROUGH bodies and
            // grinds whoever it overlaps every damageEvery tics instead of
            // detonating on the first one. Needs lifeTics to ever end.
            ripper:           (spec.ripper ?? null),
            // Forced lifetime in tics (0 = only an impact ends the flight).
            lifeTics:         (spec.lifeTics ?? 0),
            // Rise per tic while a shot is still growing (A_LichFireGrow).
            growRise:         (spec.growRise ?? 0) * scale,
            // Floor-hugging shot (Heretic MinotaurFX2, +FLOORHUGGER): it never
            // rises, never dives, and its trail is left ON the floor.
            floorHugger:      (spec.floorHugger === true),
            // A_GenWizard: a shot that hatches a body instead of exploding —
            // {kind, afterTics, retryTics}. It keeps flying while the spot is
            // taken, which is exactly what vanilla's spawner does.
            spawnMonster:     (spec.spawnMonster ?? null),
            // A standing shot (MinotaurFX3): it never travels, so no segment
            // ever crosses a body — it goes off on whoever OVERLAPS it, within
            // this radius in map units.
            contactRadius:    (spec.contactRadius ?? 0) * scale,
            // Projectiles sown along the flight instead of a mere effect (the
            // floor fire the maulotaur's crawling flame leaves behind), at
            // trailEveryTics, scattered by trailScatter map units.
            trailKind:        (spec.trailKind ?? null),
            trailScatter:     (spec.trailScatter ?? 0) * scale,
            // +THRUGHOST: the shot passes through Heretic's phantoms.
            thruGhost:        (spec.thruGhost === true),
        };
    }

    // In-flight sprite lookup. Projectiles are directional: the rocket ships only
    // rotation frames (MISLA1/5/6/7/8, no MISLA0), the plasma/BFG balls are
    // non-rotating (…A0). A single camera-facing billboard can't do 8-way
    // rotation, so pick the best available single view — rotation 0 when present,
    // else the rear view (5, seen as the shot flies away), else rotation 1.
    _pickSprite(bank, base, letter) {
        return bank.getFrameView(base, letter, DoomProjectileSystem.VIEW_PREFERENCE);
    }

    // angleOffsetDeg = fixed fan angle (Heretic crossbow side bolts),
    // randomSpreadDeg = degrees per DoomRandom difference unit (Heretic mace).
    spawn(kind, user, angleOffsetDeg = 0, randomSpreadDeg = 0) {
        const def = this._defs[kind];
        if ((def === null) || (def === undefined) || (this._collision === null)) {
            return null;
        }
        let yawDeg = user.yaw + angleOffsetDeg;
        if (randomSpreadDeg !== 0) {
            yawDeg += randomSpreadDeg * this._rng.nextDiff();
        }
        const speed  = this._speedOf(def);
        const yawR   = yawDeg * DEG_TO_RAD;
        const pitchR = user.pitch * DEG_TO_RAD;
        const cp = Math.cos(pitchR);
        const dx = Math.sin(yawR) * cp;
        const dy = Math.sin(pitchR);
        const dz = Math.cos(yawR) * cp;

        let vx = dx * speed;
        let vy = dy * speed;
        let vz = dz * speed;
        if (def.lob) {
            // Lobbed ball (A_FireMacePL1's MaceFX2): full speed FLAT along the
            // yaw (VelFromAngle) and a vertical kick from the aim pitch alone —
            // Vel.Z = 2 - clamp(tan(pitch), -5, 5) with GZDoom's down-positive
            // pitch (ours is up-positive), in map units per tic.
            vx = Math.sin(yawR) * speed;
            vz = Math.cos(yawR) * speed;
            vy = (2 + Math.max(-5, Math.min(5, Math.tan(pitchR)))) * WadConstants.SCALE;
        }

        let originY = user.getCameraY();
        if (def.spawnHeight !== null) {
            // Feet-anchored muzzle, nudged by the initial vertical velocity
            // like vanilla (A_FireMacePL1's ball.AddZ(ball.Vel.Z)).
            originY = user.y + def.spawnHeight + vy;
        }

        return this._spawnRaw(def, user.getCameraX(), originY, user.getCameraZ(), vx, vy, vz, user);
    }

    /**
     * A monster's shot (P_SpawnMissile): it leaves `height` units above the
     * shooter's feet but flies along the vector between the two BODIES' origins
     * — feet to feet — which is why a monster's fireball dips as it crosses the
     * room instead of following an eye line. When the muzzle already sits above
     * the victim's head, vanilla lifts the aim back onto it.
     *
     * @param {string} kind
     * @param {object} shooter monster record
     * @param {object} target  the body it aims at
     * @param {object} opts    {height?: map units above the feet (32),
     *                          angleOffset?: degrees, vz?: forced vertical
     *                          velocity (world units/tic) for a fan sharing one
     *                          slope, seekTarget?: the body a homing shot locks,
     *                          growTics?: tics of upward growth before it flies flat}
     * @returns {object|null} the live projectile, so a fan can copy its slope
     */
    spawnAtTarget(kind, shooter, target, opts = {}) {
        const def = this._defs[kind];
        if ((def === null) || (def === undefined) || (this._collision === null) || (target === null)) {
            return null;
        }
        // A floor-hugger leaves the ground, not the muzzle (A_MntrFloorFire
        // pins the fire to floorz every tic): starting it 32 units up would
        // send the maulotaur's floor fire out at waist height.
        const height  = ((def.floorHugger) ? 0 : (opts.height ?? WadConstants.MISSILE_SPAWN_HEIGHT) * WadConstants.SCALE);
        const originY = DoomActorRef.feetY(shooter) + height;
        const speed   = this._speedOf(def);

        let toX = DoomActorRef.x(target) - DoomActorRef.x(shooter);
        let toZ = DoomActorRef.z(target) - DoomActorRef.z(shooter);
        let toY = DoomActorRef.feetY(target) - DoomActorRef.feetY(shooter);
        if (def.floorHugger) {
            toY = 0;
        } else if (height >= DoomActorRef.height(target)) {
            // The muzzle overshoots the victim's head: aim back down onto it.
            toY += (DoomActorRef.height(target) - height);
        }
        const length = Math.hypot(toX, toY, toZ);
        if (length < 1e-6) {
            return null;
        }

        let vx = (toX / length) * speed;
        let vy = ((opts.vz !== undefined) ? opts.vz : (toY / length) * speed);
        let vz = (toZ / length) * speed;
        // A fan turns the flat velocity and keeps the slope
        // (SpawnMissileAngle); a target nobody can quite see adds a miss of
        // its own (P_SpawnMissileXYZ_ShadowHandling).
        let offset = (opts.angleOffset ?? 0);
        if (DoomActorRef.isShadow(target)) {
            offset += this._rng.nextDiff() * WadConstants.SHADOW_MISSILE_SPREAD;
        }
        if (offset !== 0) {
            const flat = Math.hypot(vx, vz);
            const yaw  = Math.atan2(vx, vz) + offset * DEG_TO_RAD;
            vx = Math.sin(yaw) * flat;
            vz = Math.cos(yaw) * flat;
        }

        const shot = this._spawnRaw(def, DoomActorRef.x(shooter), originY, DoomActorRef.z(shooter), vx, vy, vz, shooter);
        if (shot === null) {
            return null;
        }
        if (def.seek !== null) {
            shot.seekTarget = (opts.seekTarget ?? target);
        }
        shot.growTics = (opts.growTics ?? 0);

        return shot;
    }

    // Register one in-flight projectile from an explicit origin and velocity —
    // shared by the player muzzle, the monster muzzle and the bounce-spawned
    // balls. owner is the body it may never hit and the one its kills go to.
    _spawnRaw(def, x, y, z, vx, vy, vz, owner = null) {
        const p = {
            def,
            owner,
            seekTarget: null,
            x, y, z,
            // The velocity is the single source of truth: the direction is
            // recomputed from it at every tic (_stepTic), never read before.
            dx: 0, dy: 0, dz: 0,
            vx, vy, vz,
            // Launch heading (degrees): A_BFGSpray fans around the BALL's
            // angle, frozen at fire time — not the shooter's current yaw.
            yaw: Math.atan2(vx, vz) / DEG_TO_RAD,
            tics: 0, shown: 0, traveled: 0, dropped: false, bounces: 0, growTics: 0,
            instId: null,
        };
        p.instId = loader.instances().spawnFromData(null, {
            object:         def.frames[0].objId,
            position:       [p.x, p.y - def.frames[0].height / 2, p.z],
            rotation:       [0, 0, 0],
            trigger:        'none',
            loop:           false,
            onlyOnce:       false,
            collisionShape: 'none',
            keyframes:      [],
        });
        this._active.push(p);

        return p;
    }

    // The shots still in the air, as plain data. Bodies are named by their
    // save code so an owner or a homing lock can be found again on the
    // rebuilt level (DoomMonsterSystem.actorByCode).
    exportState() {
        return this._active.map((p) => ({
            kind:      p.def.kind,
            position:  [p.x, p.y, p.z],
            velocity:  [p.vx, p.vy, p.vz],
            tics:      p.tics,
            traveled:  p.traveled,
            dropped:   p.dropped,
            bounces:   p.bounces,
            growTics:  p.growTics,
            ownerCode: DoomMonsterSystem._targetCode(p.owner),
            seekCode:  DoomMonsterSystem._targetCode(p.seekTarget)
        }));
    }

    // Restored AFTER the monsters, so every body a shot points at exists.
    importState(data) {
        if ((data === null) || (data === undefined) || (this._monsters === null)) {
            return;
        }
        for (const rec of data) {
            const def = this._defs[rec.kind];
            if ((def === null) || (def === undefined)) {
                continue;
            }
            const p = this._spawnRaw(def, rec.position[0], rec.position[1], rec.position[2],
                rec.velocity[0], rec.velocity[1], rec.velocity[2], this._monsters.actorByCode(rec.ownerCode));
            p.seekTarget = this._monsters.actorByCode(rec.seekCode);
            p.tics       = rec.tics;
            p.traveled   = rec.traveled;
            p.dropped    = rec.dropped;
            p.bounces    = rec.bounces;
            p.growTics   = rec.growTics;
        }
    }

    update(dtMs) {
        if (this._active.length === 0) {
            return;
        }
        this._acc += dtMs;
        while (this._acc >= DoomProjectileSystem.MS_PER_TIC) {
            this._acc -= DoomProjectileSystem.MS_PER_TIC;
            this._ticCount++;
            this._stepTic();
        }
    }

    _stepTic() {
        const kept = [];
        for (const p of this._active) {
            const inst = loader.instances().get(p.instId);
            if (inst === undefined) {
                continue;
            }
            if ((p.def.lifeTics > 0) && (p.tics >= p.def.lifeTics)) {
                this._effects.spawn(p.def.explosion, p.x, p.y, p.z);
                loader.instances().scheduleRemoval(inst);
                continue;
            }
            this._applyGravity(p);
            this._applySeek(p);
            if (p.growTics > 0) {
                p.growTics--;
                p.y += p.def.growRise;
            }
            // Step and direction follow the CURRENT velocity, so a ballistic
            // projectile's raycast (impact, puff pull-back, decal) tracks the
            // curved path; straight projectiles keep their launch values.
            const step = Math.sqrt(p.vx * p.vx + p.vy * p.vy + p.vz * p.vz);
            if (step > 0) {
                p.dx = p.vx / step;
                p.dy = p.vy / step;
                p.dz = p.vz / step;
            }
            const hit  = this._collision.raycast(
                p.x, p.y, p.z, p.dx, p.dy, p.dz, step,
                { floors: true, ceilings: true, dynamic: true }
            );
            // A live body across this tic's segment soaks the shot before any
            // surface: direct hit roll, then the ball explodes on the flesh.
            // The shooter is transparent to its own missile, and so is anyone
            // it cannot hurt (PIT_CheckThing / CanAttackHurt).
            const flesh = ((this._monsters !== null)
                ? this._monsters.traceRay(p.x, p.y, p.z, p.dx, p.dy, p.dz,
                    ((hit !== null) ? Math.min(hit.dist, step) : step),
                    {exclude: p.owner, includePlayer: !DoomActorRef.isPlayer(p.owner), immuneTo: p.owner,
                        thruGhost: p.def.thruGhost})
                : null);
            if ((p.def.spawnMonster !== null) && this._tryHatch(p)) {
                loader.instances().scheduleRemoval(inst);
                continue;
            }
            // A standing fire goes off on whoever walks into it.
            if (p.def.contactRadius > 0) {
                const trodden = ((this._monsters !== null)
                    ? this._monsters.bodyAt(p.x, p.z, p.def.contactRadius,
                        {exclude: p.owner, includePlayer: true, immuneTo: p.owner})
                    : null);
                if (trodden !== null) {
                    this._hitFlesh(p, trodden);
                    loader.instances().scheduleRemoval(inst);
                    continue;
                }
            }
            if (flesh !== null) {
                if (p.def.ripper === null) {
                    this._hitFlesh(p, flesh);
                    loader.instances().scheduleRemoval(inst);
                    continue;
                }
                this._grind(p, flesh);
            }
            if (hit !== null) {
                if (!this._tryBounce(p, hit)) {
                    this._explode(p, hit);
                    loader.instances().scheduleRemoval(inst);
                    continue;
                }
                // Bounced: repositioned on the floor with the reflected
                // velocity, no move this tic — the flight resumes next tic
                // (vanilla P_FloorBounceMissile cancels the move too).
            } else {
                // In-flight trail (Heretic A_PhoenixPuff), left at the current
                // position before the move so it lags behind the shot — never on
                // tic 0 (that would drop a puff in the player's eye; vanilla state
                // actions only run from the first state transition). The cadence
                // is profile data; a def without it stays inert.
                if ((p.def.trailEveryTics > 0) && (p.tics > 0) && ((p.tics % p.def.trailEveryTics) === 0)) {
                    if (p.def.trailEffect !== null) {
                        this._effects.spawn(p.def.trailEffect, p.x, p.y, p.z);
                    }
                    this._sowTrail(p);
                }

                p.x += p.vx;
                p.y += p.vy;
                p.z += p.vz;
                p.traveled += step;
                if (p.traveled > DoomProjectileSystem.MAX_TRAVEL) {   // escaped through open sky
                    loader.instances().scheduleRemoval(inst);
                    continue;
                }
            }

            p.tics += 1;
            const frame = ((p.def.frames.length > 1)
                ? Math.floor(p.tics / p.def.flightTics) % p.def.frames.length : 0);
            if (frame !== p.shown) {
                inst.setObject(p.def.frames[frame].objId);
                p.shown = frame;
            }
            const pos = inst.getTransform().position;
            pos[0] = p.x;
            pos[1] = p.y - p.def.frames[frame].height / 2;
            pos[2] = p.z;
            kept.push(p);
        }
        this._active = kept;
    }

    /**
     * A_GenWizard: past afterTics the shot tries, every retryTics, to hatch
     * its body where it flies. A taken spot just delays it — the spawner flies
     * on and tries again a little further.
     *
     * @returns {boolean} true when the body hatched and the shot is spent
     */
    _tryHatch(p) {
        const spec = p.def.spawnMonster;
        if ((this._monsters === null) || (p.tics < spec.afterTics)
            || (((p.tics - spec.afterTics) % spec.retryTics) !== 0)) {
            return false;
        }
        // Vanilla drops the body by half its height so it lands on its feet.
        const born = this._monsters.spawnBodyAt(spec.kind, p.x, p.y, p.z, p.yaw, {exclude: p.owner});
        if (born === null) {
            return false;
        }
        born.target = ((p.owner !== null) ? p.owner.target : null);
        this._effects.spawn(spec.fog, p.x, p.y, p.z);
        this._effects.spawn(p.def.explosion, p.x, p.y, p.z);

        return true;
    }

    // A_MntrFloorFire: the crawling flame drops a standing fire beside itself,
    // scattered a little, which burns where it lands until somebody treads on
    // it. The fires belong to the shot's owner, so they never bite it back.
    _sowTrail(p) {
        const def = ((p.def.trailKind !== null) ? this._defs[p.def.trailKind] : null);
        if ((def === null) || (def === undefined)) {
            return;
        }
        const scatter = p.def.trailScatter;
        this._spawnRaw(def,
            p.x + (this._rng.nextDiff() / 255) * scatter,
            p.y,
            p.z + (this._rng.nextDiff() / 255) * scatter,
            0, 0, 0, p.owner);
    }

    // Ballistic projectiles (Heretic MaceFX1): fly straight for
    // gravityDelayTics, then drop — at the dropoff tic the horizontal speed is
    // rescaled to dropSpeed and the vertical speed halved (A_MacePL1Check),
    // then gravity pulls every tic.
    _applyGravity(p) {
        if ((p.def.gravity <= 0) || (p.tics < p.def.gravityDelayTics)) {
            return;
        }
        if (!p.dropped) {
            p.dropped = true;
            if (p.def.dropSpeed > 0) {
                const h = Math.sqrt(p.vx * p.vx + p.vz * p.vz);
                if (h > 0) {
                    const k = p.def.dropSpeed / h;
                    p.vx *= k;
                    p.vz *= k;
                }
                p.vy *= 0.5;
            }
        }
        p.vy -= p.def.gravity;
    }

    // Homing shots (A_SeekerMissile for the golem's skull, A_Tracer2 for the
    // revenant's): the heading turns by at most turnMax degrees per tic toward
    // the body it locked on, snapping when the remaining angle is under
    // threshold; the slope closes at a fixed rate. A dead or lost target frees
    // the shot, which then flies on straight.
    _applySeek(p) {
        const seek = p.def.seek;
        if ((seek === null) || (p.seekTarget === null)) {
            return;
        }
        // A_Tracer opens its correction on the world clock (`maptime & 3`), so
        // every revenant tracer in the level bends on the same tics;
        // A_SeekerMissile instead runs on the shot's own state cadence.
        const clock = ((seek.worldClock === true) ? this._ticCount : p.tics);
        if ((clock % seek.everyTics) !== 0) {
            return;
        }
        if (DoomActorRef.isDead(p.seekTarget)) {
            p.seekTarget = null;
            return;
        }
        const speed = Math.hypot(p.vx, p.vy, p.vz);
        if (speed < 1e-9) {
            return;
        }
        const wanted = Math.atan2(DoomActorRef.x(p.seekTarget) - p.x, DoomActorRef.z(p.seekTarget) - p.z);
        const flat   = Math.hypot(p.vx, p.vz);
        let   yaw    = Math.atan2(p.vx, p.vz);
        let   delta  = ((((wanted - yaw) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
        const turn   = seek.turnMax * DEG_TO_RAD;
        if (Math.abs(delta) > seek.threshold * DEG_TO_RAD) {
            delta = ((delta > 0) ? turn : -turn);
        }
        yaw += delta;
        p.vx = Math.sin(yaw) * flat;
        p.vz = Math.cos(yaw) * flat;

        // Slope chase (A_Tracer2): the vertical speed creeps toward the one
        // that would land on the target, never jumps to it.
        const toY  = DoomActorRef.centerY(p.seekTarget) - p.y;
        const dist = Math.max(Math.hypot(DoomActorRef.x(p.seekTarget) - p.x, DoomActorRef.z(p.seekTarget) - p.z), speed);
        const want = (toY / dist) * flat;
        const rate = DoomProjectileSystem.SEEK_SLOPE_RATE * WadConstants.SCALE;
        p.vy += ((want > p.vy) ? rate : -rate);
    }

    // A ripper grinding the body it is passing through (Whirlwind's
    // DoSpecialDamage): a small wound every damageEvery tics, the victim spun
    // and lifted by the funnel in between.
    _grind(p, flesh) {
        if (this._damage === null) {
            return;
        }
        const ripper = p.def.ripper;
        this._damage.spin(flesh.ref, ripper.shove, ripper.lift);
        if ((p.tics % ripper.damageEvery) !== 0) {
            return;
        }
        this._damage.damage(flesh.ref, ripper.damage, {point: flesh.point, source: p.owner, srcX: p.x, srcZ: p.z});
    }

    // Floor bounce of the Heretic mace balls (P_FloorBounceMissile +
    // A_MaceBallImpact/A_MaceBallImpact2): on an upward-facing hit while
    // falling, the vertical speed reflects damped (×0.75). FX1/FX3 bounce a
    // single time (the MAGIC_JUNK marker), FX2 keeps bouncing while its
    // pre-damping energy is >= minVz (2 u/tic) and spits two sideways FX3 at
    // every bounce. Walls and ceilings always explode.
    _tryBounce(p, hit) {
        const bounce = p.def.bounce;
        if ((bounce === null) || (hit.normal[1] < 0.7) || (p.vy >= 0)) {
            return false;
        }
        if ((bounce.maxBounces !== undefined) && (p.bounces >= bounce.maxBounces)) {
            return false;
        }
        const scale = WadConstants.SCALE;
        if ((bounce.minVz !== undefined) && (-p.vy < bounce.minVz * scale)) {
            return false;
        }
        p.bounces += 1;
        p.x = hit.point[0];
        p.y = hit.point[1] + 0.02;
        p.z = hit.point[2];
        p.vy = -p.vy * bounce.damping;

        // A_MaceBallImpact2's side balls: horizontal speed = the ball's damped
        // up-velocity minus 1 u/tic, perpendicular to its heading (±90°), plus
        // half the ball's horizontal velocity; same (damped) vertical velocity.
        if (bounce.spawnKind !== undefined) {
            const tinyDef = this._defs[bounce.spawnKind];
            const h     = Math.sqrt(p.vx * p.vx + p.vz * p.vz);
            const tinyH = p.vy - scale;
            if ((tinyDef !== null) && (tinyDef !== undefined) && (h > 0) && (tinyH > 0)) {
                for (const side of [1, -1]) {
                    this._spawnRaw(tinyDef,
                        p.x, p.y, p.z,
                        (p.vz / h) * side * tinyH + p.vx * 0.5,
                        p.vy,
                        (-p.vx / h) * side * tinyH + p.vz * 0.5,
                        p.owner);
                }
            }
        }
        return true;
    }

    // Impact: spawn the explosion pulled a little off the surface (like the puff),
    // then the rocket's radius splash.
    _explode(p, hit) {
        // Persistent scorch on the wall (self-filters floors/ceilings); a null
        // decal type leaves no mark. Spawned BEFORE the explosion effect:
        // instances draw in id order and an additive explosion writes no depth
        // — a decal drawn after it would paint over it (same rule as the puff
        // in DoomHitscan).
        if ((this._decals !== null) && (p.def.decalType !== null)) {
            this._decals.spawnWallDecal(p.def.decalType, hit.point, hit.normal, [p.dx, p.dy, p.dz], hit.tri.instance);
        }
        const at = WadGeometry.pullBack(hit.point, [p.dx, p.dy, p.dz]);
        this._detonate(p, at[0], at[1], at[2]);
    }

    // Direct body hit (PIT_CheckThing on a missile): the impact roll
    // ((rng & 7) + 1) × Damage lands first, then the ball detonates on the
    // flesh — the victim takes the splash on top, like vanilla.
    _hitFlesh(p, flesh) {
        if ((this._damage !== null) && (p.def.impactDamage > 0)) {
            const roll = ((this._rng.next() & 7) + 1) * p.def.impactDamage;
            this._damage.damage(flesh.ref, roll, {
                point:    flesh.point,
                source:   p.owner,
                srcX:     p.x,
                srcZ:     p.z,
                kickback: p.def.kickback
            });
        }
        const at = WadGeometry.pullBack(flesh.point, [p.dx, p.dy, p.dz]);
        this._detonate(p, at[0], at[1], at[2]);
    }

    // Death effect + A_Explode blast + the def's shooter-side spray (BFG).
    _detonate(p, ex, ey, ez) {
        this._effects.spawn(p.def.explosion, ex, ey, ez);
        // A_Explode's damage doubles as its reach; D'Sparil's bolt rolls it
        // fresh on every burst (A_Explode(random(80,111))).
        const blast = ((typeof p.def.splashDamage === 'number')
            ? p.def.splashDamage
            : this._rng.damageRoll(p.def.splashDamage));
        if ((blast > 0) && (this._damage !== null)) {
            this._damage.radiusAttack(ex, ey, ez, blast, blast, {kickback: p.def.kickback, source: p.owner});
        }
        // The spray is the player's BFG alone: it fans from the shooter, and
        // no monster in either bestiary carries one.
        if ((p.def.spray !== null) && DoomActorRef.isPlayer(p.owner)) {
            this._sprayFromShooter(p.def.spray, p.yaw);
        }
    }

    // A_BFGSpray: rays fanned from the SHOOTER's position around the BALL's
    // launch heading (turning while the ball flies moves the origin, never the
    // fan); each ray aims like P_AimLineAttack — the closest live body
    // crossing the ray in 2D, above or below the eye plane — then a
    // line-of-sight check to its centre settles it (walls and slabs block).
    // The victim takes sum(damageCount × (1d8)) and flashes the spray effect.
    _sprayFromShooter(spray, yawDeg) {
        if ((this._monsters === null) || (this._damage === null)) {
            return;
        }
        const range = spray.distance * WadConstants.SCALE;
        const ox = this._user.getCameraX();
        const oy = this._user.getCameraY();
        const oz = this._user.getCameraZ();
        for (let i = 0; i < spray.rays; i++) {
            const yawR = (yawDeg - spray.angle / 2 + (spray.angle / spray.rays) * i) * DEG_TO_RAD;
            const aim  = this._monsters.aimRay(ox, oz, Math.sin(yawR), Math.cos(yawR), range);
            if (aim === null) {
                continue;
            }
            const c  = aim.record.inst.getWorldCenter();
            const dx = c[0] - ox;
            const dy = c[1] - oy;
            const dz = c[2] - oz;
            const d  = Math.hypot(dx, dy, dz);
            if ((d > 1e-6) && (this._collision.raycast(ox, oy, oz, dx / d, dy / d, dz / d, d, {floors: true, ceilings: true, dynamic: true}) !== null)) {
                continue;
            }
            let damage = 0;
            for (let j = 0; j < spray.damageCount; j++) {
                damage += (this._rng.next() & 7) + 1;
            }
            this._effects.spawn(spray.effect, c[0], c[1], c[2]);
            this._damage.damage(aim.record, damage,
                {point: [c[0], c[1], c[2]], source: this._user, srcX: ox, srcZ: oz});
        }
    }
}

// Rotations a single in-flight billboard settles for, best first
DoomProjectileSystem.VIEW_PREFERENCE = ['0', '5', '1'];
DoomProjectileSystem.MS_PER_TIC = 1000 / 35;
DoomProjectileSystem.MAX_TRAVEL = 8192 * WadConstants.SCALE;   // fail-safe lifetime
// A_Tracer2 slope chase: map units per tic added to the vertical speed toward
// the one that would land on the target.
DoomProjectileSystem.SEEK_SLOPE_RATE = 1 / 8;
