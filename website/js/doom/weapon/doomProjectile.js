// Moving projectiles: the rocket, plasma ball and BFG shot (P_SpawnPlayerMissile
// + the MT_ROCKET / MT_PLASMA / MT_BFG mobjs). Each is launched from the eye
// along the free-aim direction at its vanilla speed, advances one tic at a time,
// and raycasts the segment it just crossed for a wall/floor/ceiling. On impact it
// spawns the matching explosion (DoomEffects) and, for the rocket, applies the
// A_Explode splash — to the player only, faithfully (no enemies yet). The BFG
// spray (A_BFGSpray) targets things, so with no enemies it is a no-op here.
class DoomProjectileSystem {
    constructor(spriteBank, effects, rng) {
        this._effects   = effects;
        this._rng       = rng;
        this._collision = null;
        this._user      = null;
        this._active    = [];
        this._acc       = 0;
        this._defs      = this._buildDefs(spriteBank);
    }

    setWorld(collision, user) {
        this._collision = collision;
        this._user      = user;
        return this;
    }

    _buildDefs(bank) {
        // The rocket is a solid missile (opaque); the plasma/BFG balls glow
        // (gzdoom RenderStyle "Add", Alpha 0.75).
        return {
            rocket: this._buildDef(bank, 'MISL', ['A'],      20, 1, 'rocketExplode', 128, false),
            plasma: this._buildDef(bank, 'PLSS', ['A', 'B'], 25, 6, 'plasmaExplode', 0,   true),
            bfg:    this._buildDef(bank, 'BFS1', ['A', 'B'], 25, 4, 'bfgExplode',    0,   true),
        };
    }

    // In-flight billboard(s) + kinematics for one projectile kind; null if the
    // WAD lacks the sprites. speed is in map units/tic, converted to world units.
    _buildDef(bank, spriteBase, letters, speedMap, flightTics, explosion, splashDamage, additive) {
        const scale  = WadConstants.SCALE;
        const frames = [];
        for (const letter of letters) {
            const spr = this._pickSprite(bank, spriteBase, letter);
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
                    alpha:         ((additive) ? 0.75 : 1),
                    additive:      additive,
                }),
                height: spr.height * scale,
            });
        }
        return { frames, speed: speedMap * scale, flightTics, explosion, splashDamage };
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

    spawn(kind, user) {
        const def = this._defs[kind];
        if ((def === null) || (def === undefined) || (this._collision === null)) {
            return;
        }
        const yawR   = user.yaw * DEG_TO_RAD;
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
            tics: 0, shown: 0, traveled: 0,
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
            const step = p.def.speed;
            const hit  = this._collision.raycast(
                p.x, p.y, p.z, p.dx, p.dy, p.dz, step,
                { floors: true, ceilings: true, dynamic: true }
            );
            if (hit !== null) {
                this._explode(p, hit);
                loader.instances().scheduleRemoval(inst);
                continue;
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

    // Impact: spawn the explosion pulled a little off the surface (like the puff),
    // then the rocket's radius splash.
    _explode(p, hit) {
        const back = 4 * WadConstants.SCALE;
        const ex = hit.point[0] - p.dx * back;
        const ey = hit.point[1] - p.dy * back;
        const ez = hit.point[2] - p.dz * back;
        this._effects.spawn(p.def.explosion, ex, ey, ez);
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
