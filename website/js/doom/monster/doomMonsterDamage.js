/**
 * Shared damage pipeline of every body that can be hurt — monsters, barrels
 * and the player alike: each attack channel (hitscan, melee, projectile
 * impact, radius blast) lands here. Faithful port of the P_DamageMobj chain —
 * blood, health, kickback thrust, pain roll or death (gibbed past the game's
 * gib threshold) — plus the ReactToDamage tail that wakes the victim and turns
 * it on its attacker. The per-game numbers come from
 * profile.monsterDamageRules().
 *
 * The module never moves anything: a monster's thrust feeds its record's
 * velocity (integrated by DoomMonsterSystem at 35 Hz), the player's feeds the
 * engine's own perturbation channel — one formula, two owners.
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

    // CanAttackHurt (p_map.cpp) at the default infighting setting: a MISSILE
    // never wounds a body of its owner's species, and nothing ever spares the
    // player. It is called from PIT_CheckThing alone, so it rules the missiles
    // and them only — a chaingunner's spray does tear through its own kin.
    static canAttackHurt(victim, shooter) {
        if ((shooter === null) || DoomActorRef.isPlayer(victim) || DoomActorRef.isPlayer(shooter)) {
            return true;
        }

        return (DoomActorRef.species(victim) !== DoomActorRef.species(shooter));
    }

    /**
     * Hurt one body. A corpse still bleeds and takes thrust (sliding bodies)
     * but no longer loses health.
     *
     * @param {object} victim DoomMonsterSystem record, or the DoomUser
     * @param {number} amount rolled damage
     * @param {object} opts   {point?, source?, srcX?, srcZ?, kickback?,
     *                         noBlood?, noRetarget?} — source is the attacking
     *                         body (it becomes the victim's new target and
     *                         gives the thrust its direction); noRetarget =
     *                         sourceless damage (a crusher), which vanilla
     *                         P_DamageMobj never turns the victim on anyone for.
     */
    damage(victim, amount, opts = {}) {
        if (DoomActorRef.isPlayer(victim)) {
            this._damagePlayer(victim, amount, opts);
            return;
        }
        if (victim.invulnerable === true) {
            return;
        }
        const def = victim.def;
        if ((opts.noBlood !== true) && (def.getFlags().noBlood !== true)) {
            const at = (opts.point ?? victim.inst.getWorldCenter());
            this._spawnBlood(at[0], at[1], at[2], amount);
        }
        this._thrust(victim, amount, opts);
        if (victim.dead) {
            return;
        }
        victim.health -= amount;
        if (victim.health <= 0) {
            this._kill(victim);
            return;
        }
        if ((this._rng.next() < def.getPainChance()) && (def.getState('pain0') !== null)) {
            this._monsters.enterState(victim, 'pain0');
            // MF_JUSTHIT: the flinch lets P_CheckMissileRange fire back at once.
            victim.justHit = true;
        }
        // "we're awake now" (P_DamageMobj): the attack-gate delay is cleared
        // by any hit, whatever the pain roll said.
        victim.reactiontime = 0;
        this._retarget(victim, opts);
    }

    // ReactToDamage's target switch: a damaged body turns on whoever hit it —
    // the player, or another monster (infighting). Species plays NO part here
    // (OkayToSwitchTarget only refuses it under +NOINFIGHTSPECIES, which no
    // monster of either bestiary carries): two zombies really do turn on each
    // other, and what keeps a crowd from tearing itself apart over one stray
    // fireball is the MISSILE immunity, not this rule.
    _retarget(victim, opts) {
        const source = (opts.source ?? null);
        if ((opts.noRetarget === true) || (source === null) || (source === victim)) {
            return;
        }
        // MF3_NOTARGET (the archvile, the maulotaur, D'Sparil): a body nobody
        // may aim at is never adopted, so its blast starts no fight with it.
        if (DoomActorRef.isMonster(source) && (source.def.getFlags().noTarget === true)) {
            return;
        }
        // A lock still running keeps the current target — but a blow from that
        // very target refreshes it instead of being ignored.
        if ((victim.target !== source) && (victim.threshold !== 0)) {
            return;
        }
        victim.target    = source;
        victim.threshold = DoomMonsterDamage.BASE_THRESHOLD;
        if (victim.stateKey.startsWith('spawn') && (victim.def.getState('see0') !== null)) {
            this._monsters.enterState(victim, 'see0');
        }
    }

    // The player half of P_DamageMobj: the armour, the skill factor and the
    // invulnerability live on DoomUser, the kickback is the shared formula.
    _damagePlayer(user, amount, opts) {
        if (user.isDead()) {
            return;
        }
        user.takeDamage(amount);
        this._thrust(user, amount, opts);
    }

    /**
     * Explosion at a world point (rocket, barrel, phoenix…): every live body
     * in range takes the vanilla Chebyshev falloff behind a line-of-sight
     * check, plus the blast thrust. The player goes through the same path as
     * the monsters — A_Explode never spared the shooter either.
     *
     * @param {number} x, y, z    world explosion point
     * @param {number} damage     bomb damage
     * @param {number} distance   bomb reach (map units)
     * @param {object} opts       {kickback?, exclude?, source?} exclude = the exploding record
     */
    radiusAttack(x, y, z, damage, distance, opts = {}) {
        const SCALE    = WadConstants.SCALE;
        const kickback = (opts.kickback ?? this._rules.defKickback);
        const source   = (opts.source ?? null);

        const pdx   = Math.abs(this._user.x - x) / SCALE;
        const pdz   = Math.abs(this._user.z - z) / SCALE;
        const pDist = Math.max(0, Math.max(pdx, pdz) - (this._user.getRadius() / SCALE));
        if ((pDist < distance) && (damage - pDist > 0)
            && this._blastReaches(x, y, z, this._user.getCameraX(), this._user.getCameraY(), this._user.getCameraZ())) {
            this.damage(this._user, damage - pDist, {srcX: x, srcZ: z, source: source, kickback: kickback});
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
            this.damage(m, damage - mDist, {srcX: x, srcZ: z, source: source, noBlood: true, kickback: kickback});
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

    // ApplyKickback (interaction.zs): thrust away from the source, in map units
    // per tic, clamped to 32 — clamp(damage × 0.125 × kickback / mass, 0, 32).
    // The vanilla "fall forwards" flourish is skipped. Applies to corpses too
    // (blast-slid bodies, user decision) — except the noCorpseThrust defs (an
    // exploding barrel must not glide away mid-explosion).
    _thrust(victim, damage, opts) {
        const isPlayer = DoomActorRef.isPlayer(victim);
        if (!isPlayer && victim.dead && (victim.def.getFlags().noCorpseThrust === true)) {
            return;
        }
        const kickback = (opts.kickback ?? this._rules.defKickback);
        const from     = this._sourcePos(opts);
        if ((kickback <= 0) || (from === null)) {
            return;
        }
        const mass   = ((isPlayer) ? WadConstants.PLAYER_MASS : victim.def.getMass());
        const thrust = Math.min(32, (damage * 0.125 * kickback) / ((mass > 0) ? mass : 1));
        if (thrust < 0.01) {
            return;
        }
        const ang = Math.atan2(DoomActorRef.z(victim) - from.z, DoomActorRef.x(victim) - from.x);
        if (!isPlayer) {
            victim.velX += Math.cos(ang) * thrust;
            victim.velZ += Math.sin(ang) * thrust;
            return;
        }
        // The player's momentum lives in the engine's perturbation channel,
        // whose decay IS the vanilla friction — map units/tic become m/s there.
        const speed = thrust * WadConstants.SCALE / WadConstants.SECONDS_PER_TIC;
        victim.getExternalForces().addImpulse(Math.cos(ang) * speed, Math.sin(ang) * speed);
    }

    // Being caught in a funnel (Whirlwind::DoSpecialDamage): the victim is
    // spun on the spot, shoved sideways at random and lifted a little. Amounts
    // are the vanilla maxima, in map units per tic.
    spin(victim, shove, lift) {
        const turn = this._rng.nextDiff() * (360 / 4096);
        const dx   = (this._rng.nextDiff() / 128) * shove;
        const dz   = (this._rng.nextDiff() / 128) * shove;
        if (!DoomActorRef.isPlayer(victim)) {
            victim.facing = (((victim.facing + turn) % 360) + 360) % 360;
            victim.velX  += dx;
            victim.velZ  += dz;
            // A boss keeps its feet on the ground (the funnel never lifts one).
            if (victim.def.getFlags().boss !== true) {
                victim.velY = Math.min(victim.velY + lift, DoomMonsterDamage.SPIN_MAX_LIFT);
            }
            return;
        }
        victim.yaw = (((victim.yaw + turn) % 360) + 360) % 360;
        const perSecond = WadConstants.SCALE / WadConstants.SECONDS_PER_TIC;
        victim.getExternalForces().addImpulse(dx * perSecond, dz * perSecond);
        victim.applyVerticalImpulse(Math.min(lift, DoomMonsterDamage.SPIN_MAX_LIFT) * perSecond);
    }

    /**
     * The vertical half of a blow: the archvile's hellfire throws its victim
     * straight up (A_VileAttack — Vel.Z = thrust × 1000 / mass, map units per
     * tic). A monster carries its own vertical velocity; the player's lives in
     * the engine's physics.
     *
     * @param {number} thrust the verb's thrust factor (1 for the archvile)
     */
    launch(victim, thrust) {
        const isPlayer = DoomActorRef.isPlayer(victim);
        const mass     = ((isPlayer) ? WadConstants.PLAYER_MASS : victim.def.getMass());
        const velocity = (thrust * 1000) / Math.max(1, mass);
        if (!isPlayer) {
            victim.velY = velocity;
            return;
        }
        victim.applyVerticalImpulse(velocity * WadConstants.SCALE / WadConstants.SECONDS_PER_TIC);
    }

    // Where the blow came from: an explicit point (a blast) or the attacking
    // body's own position. null when nothing says — the victim is not pushed.
    _sourcePos(opts) {
        if (opts.srcX !== undefined) {
            return {x: opts.srcX, z: opts.srcZ};
        }
        const source = (opts.source ?? null);
        if (source === null) {
            return null;
        }

        return {x: DoomActorRef.x(source), z: DoomActorRef.z(source)};
    }

    // A_VileChase put a body back on its feet: vanilla Revive raises the level
    // total with it, so the ☠ ratio stays honest when it is killed again.
    reviveCounted(record) {
        if ((record.def.getFlags().countsKill !== false) && (record.noKillCount !== true) && (this._game !== null)) {
            this._game.addKillTotal();
        }
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
// Ceiling the whirlwind lifts a body to (Whirlwind::DoSpecialDamage), u/tic
DoomMonsterDamage.SPIN_MAX_LIFT  = 12;
