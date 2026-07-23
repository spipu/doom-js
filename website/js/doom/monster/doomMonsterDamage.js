/**
 * Shared damage pipeline of the shootable bodies (monsters, barrels): every
 * player attack channel (hitscan, projectile impact, radius blast) lands here.
 * Faithful port of the P_DamageMobj chain — blood, health, kickback thrust,
 * pain roll or death (gibbed past the game's gib threshold) — with the
 * per-game numbers coming from profile.monsterDamageRules().
 *
 * The module never moves anything: the thrust only feeds the record's
 * velocity, integrated by DoomMonsterSystem at 35 Hz.
 */
class DoomMonsterDamage {
    /**
     * @param {DoomMonsterSystem} monsters
     * @param {DoomEffects}       effects
     * @param {DoomRandom}        rng
     * @param {object}            rules   profile.monsterDamageRules()
     * @param {DoomGame}          game    kill counter
     */
    constructor(monsters, effects, rng, rules, game) {
        this._monsters  = monsters;
        this._effects   = effects;
        this._rng       = rng;
        this._rules     = rules;
        this._game      = game;
        this._collision = null;
        this._user      = null;
    }

    setWorld(collision, user) {
        this._collision = collision;
        this._user      = user;
        return this;
    }

    // A_DropItem chance roll (x/256) on the shared vanilla random table;
    // 256 and above never rolls (the vanilla "always" default).
    rollChance(chance) {
        return ((chance >= 256) || (this._rng.next() <= chance));
    }

    /**
     * Hurt one body. A corpse still bleeds and takes thrust (sliding bodies)
     * but no longer loses health.
     *
     * @param {object} record DoomMonsterSystem record
     * @param {number} amount rolled damage
     * @param {object} opts   {point?, srcX?, srcZ?, kickback?, noBlood?}
     */
    damage(record, amount, opts = {}) {
        const def = record.def;
        if ((opts.noBlood !== true) && (def.getFlags().noBlood !== true)) {
            const at = (opts.point ?? record.inst.getWorldCenter());
            this._spawnBlood(at[0], at[1], at[2], amount);
        }
        this._thrust(record, amount, opts);
        if (record.dead) {
            return;
        }
        record.health -= amount;
        if (record.health <= 0) {
            this._kill(record);
            return;
        }
        if ((this._rng.next() < def.getPainChance()) && (def.getState('pain0') !== null)) {
            this._monsters.enterState(record, 'pain0');
        }
        // P_DamageMobj wake: past its target lock, any damage turns the victim
        // on its attacker (solo: the player) even without a pain flinch — a
        // spawn-state monster jumps straight to its See state (the pain roll
        // above may already have moved it, the guard covers that).
        if (record.threshold === 0) {
            record.target    = this._user;
            record.threshold = DoomMonsterDamage.BASE_THRESHOLD;
            if (record.stateKey.startsWith('spawn') && (def.getState('see0') !== null)) {
                this._monsters.enterState(record, 'see0');
            }
        }
    }

    /**
     * Explosion at a world point (rocket, barrel, phoenix…): the player keeps
     * the vanilla Chebyshev falloff, every live body in range takes the same
     * — with a wall line-of-sight check — plus the blast thrust.
     *
     * @param {number} x, y, z    world explosion point
     * @param {number} damage     bomb damage
     * @param {number} distance   bomb reach (map units)
     * @param {object} opts       {kickback?, exclude?} exclude = the exploding record
     */
    radiusAttack(x, y, z, damage, distance, opts = {}) {
        const SCALE = WadConstants.SCALE;

        // Player: distance from the blast in map units, minus his radius (16),
        // behind the same sight check as every other victim (P_CheckSight).
        const pdx   = Math.abs(this._user.x - x) / SCALE;
        const pdz   = Math.abs(this._user.z - z) / SCALE;
        const pDist = Math.max(0, Math.max(pdx, pdz) - 16);
        if ((pDist < distance) && (damage - pDist > 0)
            && this._blastReaches(x, y, z, this._user.getCameraX(), this._user.getCameraY(), this._user.getCameraZ())) {
            this._user.takeDamage(damage - pDist);
        }

        for (const m of this._monsters.getMonsters()) {
            if ((m === (opts.exclude ?? null)) || (m.def.getFlags().noRadiusDmg === true)) {
                continue;
            }
            const pos   = m.inst.getTransform().position;
            const mdx   = Math.abs(pos[0] - x) / SCALE;
            const mdz   = Math.abs(pos[2] - z) / SCALE;
            const mDist = Math.max(0, Math.max(mdx, mdz) - (m.inst.getCollisionRadius() / SCALE));
            if ((mDist >= distance) || (damage - mDist <= 0)) {
                continue;
            }
            const c = m.inst.getWorldCenter();
            if (!this._blastReaches(x, y, z, c[0], c[1], c[2])) {
                continue;
            }
            // No blood on blast victims: vanilla only bleeds on direct hits
            // (P_LineAttack / missile impact), never from P_RadiusAttack.
            this.damage(m, damage - mDist, {srcX: x, srcZ: z, noBlood: true, kickback: (opts.kickback ?? this._rules.defKickback)});
        }
    }

    // Line of sight from the blast to a victim point (walls AND floor/ceiling
    // slabs block a blast, vanilla P_RadiusAttack / P_CheckSight — a barrel
    // under a balcony never hurts the bodies standing on it).
    _blastReaches(x, y, z, tx, ty, tz) {
        const dx = tx - x;
        const dy = ty - y;
        const dz = tz - z;
        const d  = Math.hypot(dx, dy, dz);
        if (d < 1e-6) {
            return true;
        }
        const wall = this._collision.raycast(x, y, z, dx / d, dy / d, dz / d, d, {floors: true, ceilings: true, dynamic: true});
        return (wall === null);
    }

    // ApplyKickback (interaction.zs): thrust = clamp(damage × 0.125 × kickback
    // / mass, 0, 32) map units/tic away from the source. The vanilla "fall
    // forwards" flourish is skipped. Applies to corpses too (blast-slid
    // bodies, user decision) — except the noCorpseThrust defs (an exploding
    // barrel must not glide away mid-explosion).
    _thrust(record, damage, opts) {
        if (record.dead && (record.def.getFlags().noCorpseThrust === true)) {
            return;
        }
        const kickback = (opts.kickback ?? this._rules.defKickback);
        if ((kickback <= 0) || (opts.srcX === undefined)) {
            return;
        }
        const mass   = record.def.getMass();
        const thrust = Math.min(32, (damage * 0.125 * kickback) / ((mass > 0) ? mass : 1));
        if (thrust < 0.01) {
            return;
        }
        const pos = record.inst.getTransform().position;
        const ang = Math.atan2(pos[2] - opts.srcZ, pos[0] - opts.srcX);
        record.velX += Math.cos(ang) * thrust;
        record.velZ += Math.sin(ang) * thrust;
    }

    _kill(record) {
        const def = record.def;
        record.dead = true;
        // Extreme death: overkill past spawnhealth × the game's gib factor
        // (health is already negative here).
        const gibbed = ((record.health < -(def.getHealth() * this._rules.gibFactor))
            && (def.getState('xdeath0') !== null)
            && (def.getFlags().dontGib !== true));
        this._monsters.enterState(record, ((gibbed) ? 'xdeath0' : 'death0'));
        // Nightmare-respawned actors no longer feed the counter (user
        // decision: ☠ x never exceeds the level total).
        if ((def.getFlags().countsKill !== false) && (record.noKillCount !== true) && (this._game !== null)) {
            this._game.addKill();
        }
    }

    // P_SpawnBlood: the Doom family starts the splash deeper into the
    // animation for weak hits (>12 full, 9-12 mid, <9 small).
    _spawnBlood(x, y, z, damage) {
        let start = 0;
        if (this._rules.bloodDamageAdvance) {
            start = ((damage > 12) ? 0 : ((damage >= 9) ? 1 : 2));
        }
        this._effects.spawn(this._rules.bloodTemplate, x, y, z, start);
    }
}

// Vanilla BASETHRESHOLD (p_inter.c): the target lock set on every wake-by-damage
DoomMonsterDamage.BASE_THRESHOLD = 100;
