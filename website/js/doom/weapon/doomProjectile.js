// Moving projectiles (P_SpawnPlayerMissile): each is launched from the eye
// along the free-aim direction at its vanilla speed, advances one tic at a
// time, and raycasts the segment it just crossed for a wall/floor/ceiling. On
// impact it spawns its death effect (DoomEffects) and, when the def carries a
// splash, applies the A_Explode blast — to the player only, faithfully (no
// enemies yet). The BFG spray (A_BFGSpray) targets things, so with no enemies
// it is a no-op here. All the data (sprites, speeds, effects, decals, gravity)
// comes from the game profile's projectileDefs().
class DoomProjectileSystem {
    constructor(spriteBank, effects, rng, decals, profile) {
        this._effects   = effects;
        this._rng       = rng;
        this._decals    = decals;
        this._collision = null;
        this._user      = null;
        this._active    = [];
        this._acc       = 0;
        this._defs      = this._buildDefs(spriteBank, profile);
    }

    setWorld(collision, user) {
        this._collision = collision;
        this._user      = user;
        return this;
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
            frames.push({
                objId:  loader.objects().loadBillboardFromData(null, {
                    textures:      [spr.texId],
                    halfWidth:     (spr.width * scale) / 2,
                    height:        spr.height * scale,
                    anchorOffsetX: ((spr.width / 2) - spr.leftOffset) * scale,
                    anchorOffsetY: 0,
                    light:         255,
                    alpha:         ((spec.additive) ? 0.75 : 1),
                    additive:      spec.additive,
                }),
                height: spr.height * scale,
            });
        }
        return {
            frames,
            speed:            spec.speed * scale,
            flightTics:       spec.flightTics,
            explosion:        spec.explosion,
            splashDamage:     spec.splashDamage,
            decalType:        spec.decalType ?? null,
            gravity:          (spec.gravity ?? 0) * scale,
            gravityDelayTics: spec.gravityDelayTics ?? 0,
            dropSpeed:        (spec.dropSpeed ?? 0) * scale,
            trailEffect:      spec.trailEffect ?? null,
            trailEveryTics:   spec.trailEveryTics ?? 4,
        };
    }

    // In-flight sprite lookup. Projectiles are directional: the rocket ships only
    // rotation frames (MISLA1/5/6/7/8, no MISLA0), the plasma/BFG balls are
    // non-rotating (…A0). A single camera-facing billboard can't do 8-way
    // rotation, so pick the best available single view — rotation 0 when present,
    // else the rear view (5, seen as the shot flies away), else rotation 1.
    // Probed with has() so a missing rotation never warns.
    _pickSprite(bank, base, letter) {
        for (const rot of ['0', '5', '1']) {
            const lump = base + letter + rot;
            if (bank.has(lump)) {
                return bank.get(lump);
            }
        }
        return null;
    }

    // angleOffsetDeg = fixed fan angle (Heretic crossbow side bolts),
    // randomSpreadDeg = degrees per DoomRandom difference unit (Heretic mace).
    spawn(kind, user, angleOffsetDeg = 0, randomSpreadDeg = 0) {
        const def = this._defs[kind];
        if ((def === null) || (def === undefined) || (this._collision === null)) {
            return;
        }
        let yawDeg = user.yaw + angleOffsetDeg;
        if (randomSpreadDeg !== 0) {
            yawDeg += randomSpreadDeg * this._rng.nextDiff();
        }
        const yawR   = yawDeg * DEG_TO_RAD;
        const pitchR = user.pitch * DEG_TO_RAD;
        const cp = Math.cos(pitchR);
        const dx = Math.sin(yawR) * cp;
        const dy = Math.sin(pitchR);
        const dz = Math.cos(yawR) * cp;

        const p = {
            def,
            x: user.getCameraX(), y: user.getCameraY(), z: user.getCameraZ(),
            dx, dy, dz,
            vx: dx * def.speed, vy: dy * def.speed, vz: dz * def.speed,
            tics: 0, shown: 0, traveled: 0, dropped: false,
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
    }

    update(dtMs) {
        if (this._active.length === 0) {
            return;
        }
        this._acc += dtMs;
        while (this._acc >= DoomProjectileSystem.MS_PER_TIC) {
            this._acc -= DoomProjectileSystem.MS_PER_TIC;
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
            this._applyGravity(p);
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
            if (hit !== null) {
                this._explode(p, hit);
                loader.instances().scheduleRemoval(inst);
                continue;
            }

            // In-flight trail (Heretic A_PhoenixPuff), left at the current
            // position before the move so it lags behind the shot.
            if ((p.def.trailEffect !== null) && ((p.tics % p.def.trailEveryTics) === 0)) {
                this._effects.spawn(p.def.trailEffect, p.x, p.y, p.z);
            }

            p.x += p.vx;
            p.y += p.vy;
            p.z += p.vz;
            p.traveled += step;
            if (p.traveled > DoomProjectileSystem.MAX_TRAVEL) {   // escaped through open sky
                loader.instances().scheduleRemoval(inst);
                continue;
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

    // Impact: spawn the explosion pulled a little off the surface (like the puff),
    // then the rocket's radius splash.
    _explode(p, hit) {
        const back = 4 * WadConstants.SCALE;
        const ex = hit.point[0] - p.dx * back;
        const ey = hit.point[1] - p.dy * back;
        const ez = hit.point[2] - p.dz * back;
        this._effects.spawn(p.def.explosion, ex, ey, ez);
        // Persistent scorch on the wall (self-filters floors/ceilings); a null
        // decal type leaves no mark.
        if ((this._decals !== null) && (p.def.decalType !== null)) {
            this._decals.spawnWallDecal(p.def.decalType, hit.point, hit.normal, [p.dx, p.dy, p.dz], hit.tri.instance);
        }
        if (p.def.splashDamage > 0) {
            this._radiusAttack(ex, ez, p.def.splashDamage);
        }
    }

    // P_RadiusAttack restricted to the player: Chebyshev distance in map units,
    // minus the player radius; damage = bombdamage - dist, linear falloff.
    _radiusAttack(ex, ez, damage) {
        const toMap = 1 / WadConstants.SCALE;
        const dxMap = Math.abs(this._user.x - ex) * toMap;
        const dzMap = Math.abs(this._user.z - ez) * toMap;
        let dist = Math.max(dxMap, dzMap) - 16;   // MT_PLAYER radius (map units)
        if (dist < 0) {
            dist = 0;
        }
        if (dist < damage) {
            this._user.takeDamage(damage - dist);
        }
    }
}

DoomProjectileSystem.MS_PER_TIC = 1000 / 35;
DoomProjectileSystem.MAX_TRAVEL = 8192 * WadConstants.SCALE;   // fail-safe lifetime
