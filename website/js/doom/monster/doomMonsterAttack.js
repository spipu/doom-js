/**
 * The monsters' attack layer: when an attack fires, where it is aimed, and
 * what each `A_*` verb of the bestiary actually does.
 *
 * Two halves. The GATES (checkMeleeRange / decideMissileAttack) are called by
 * A_Chase before it walks, and decide whether the body switches to its Melee
 * or Missile state — they are the whole reason a monster claws at arm's length
 * and only lobs a fireball now and then. The VERBS are the state actions those
 * states run; each one is a transcription of its zscript twin, parameterised by
 * profile data (damage rolls, projectile kinds, spreads) so no monster name
 * ever appears here.
 *
 * Everything a verb needs to hurt somebody goes out through the shared
 * pipelines — DoomHitscan for bullets, DoomProjectileSystem for missiles,
 * DoomMonsterDamage for the blow itself — so a monster's attack and the
 * player's travel the exact same code.
 */
class DoomMonsterAttack {
    /**
     * @param {DoomMonsterSystem}    system
     * @param {DoomMonsterDamage}    damage
     * @param {DoomRandom}           rng
     */
    constructor(system, damage, rng) {
        this._system      = system;
        this._damage      = damage;
        this._rng         = rng;
        this._hitscan     = null;
        this._projectiles = null;
        this._effects     = null;
    }

    // The attack channels, wired once the level's world exists.
    setChannels(hitscan, projectiles, effects) {
        this._hitscan     = hitscan;
        this._projectiles = projectiles;
        this._effects     = effects;

        return this;
    }

    // --- Gates (A_Chase decides on these) ---

    // P_CheckMeleeRange: the reach is meleerange PLUS the victim's radius, the
    // two bodies must overlap vertically, and the monster must see it. Range
    // comes from the def when it declares one (Heretic's longer arms).
    checkMeleeRange(m) {
        const target = m.target;
        if ((target === null) || DoomActorRef.isDead(target)) {
            return false;
        }
        const reach = ((m.def.getParams().meleeRange ?? WadConstants.ACTOR_MELEE_RANGE) * WadConstants.SCALE)
            + DoomActorRef.radius(target);
        if (DoomActorRef.distance2dSq(m, target) >= (reach * reach)) {
            return false;
        }
        // Don't claw at something entirely above or below (NOVERTICALMELEERANGE
        // is off for every monster of both bestiaries).
        if ((DoomActorRef.feetY(target) > DoomActorRef.topY(m))
            || (DoomActorRef.topY(target) < DoomActorRef.feetY(m))) {
            return false;
        }

        return this._system.checkSightTo(m, target);
    }

    // P_CheckMissileRange: a jet against the DISTANCE — the further the target,
    // the rarer the shot. A monster just hurt fires back at once, one still in
    // its reaction delay never fires, a melee fighter holds fire inside its own
    // threshold (the revenant's fist), and the archvile gives up past its
    // maximum range.
    //
    // Named a decision and not a check: like the source, it CONSUMES the
    // MF_JUSTHIT flag it answers on, so calling it twice in a tic would not
    // give the same answer.
    decideMissileAttack(m) {
        const target = m.target;
        if ((target === null) || !this._system.checkSightTo(m, target)) {
            return false;
        }
        if (m.justHit === true) {
            // MF_JUSTHIT: the target just hit us, so fight back.
            m.justHit = false;
            return true;
        }
        if (m.reactiontime > 0) {
            return false;
        }

        const params = m.def.getParams();
        let dist = (DoomActorRef.distance2d(m, target) / WadConstants.SCALE) - WadConstants.MISSILE_RANGE_BIAS;
        const hasMelee = this._system.hasMeleeState(m.def);
        if (!hasMelee) {
            dist -= WadConstants.MISSILE_NO_MELEE_BIAS;   // no fist, so fire more
        }
        if ((params.maxTargetRange !== undefined) && (dist > params.maxTargetRange)) {
            return false;
        }
        if (hasMelee && (params.meleeThreshold !== undefined) && (dist < params.meleeThreshold)) {
            return false;
        }
        dist *= (params.missileChanceMult ?? WadConstants.MISSILE_CHANCE_MULT);

        const cap = (params.minMissileChance ?? WadConstants.MIN_MISSILE_CHANCE);

        return (this._rng.next() >= Math.min(Math.trunc(dist), cap));
    }

    // A_FaceTarget: snap the facing onto the target — and drop the ambush flag,
    // which is why a deaf monster that has attacked once hears like any other.
    faceTarget(m) {
        if (m.target === null) {
            return;
        }
        const dx = DoomActorRef.x(m.target) - DoomActorRef.x(m);
        const dz = DoomActorRef.z(m.target) - DoomActorRef.z(m);
        let facing = (Math.atan2(dz, dx) / DEG_TO_RAD);
        if (DoomActorRef.isShadow(m.target)) {
            // A_Face_ShadowHandling: it cannot quite tell where the thing is,
            // and every shot leaving along this facing inherits the miss.
            facing += this._rng.nextDiff() * WadConstants.SHADOW_FACE_SPREAD;
        }
        m.facing = WadGeometry.normalizeAngle(facing);
        m.flags &= ~WadConstants.MTF_AMBUSH;
    }

    // --- Verbs ---

    // Run one state action. Returns false when the verb is not an attack one,
    // so the caller can try its own table (chase, death, boss).
    run(m, action, args) {
        const method = DoomMonsterAttack.VERBS[action];
        if (method === undefined) {
            return false;
        }
        this[method](m, (args ?? {}));

        return true;
    }

    // A_FaceTarget and the flourishes that only add a sound to it.
    _face(m) {
        this.faceTarget(m);
    }

    // A_SargAttack / A_SkelFist: a bite that only lands in reach.
    _melee(m, args) {
        this.faceTarget(m);
        if (!this.checkMeleeRange(m)) {
            return;
        }
        this._hit(m, this._rng.damageRoll(args.damage ?? m.def.getParams().melee));
    }

    // A_TroopAttack / A_HeadAttack / A_BruisAttack / A_CustomComboAttack /
    // A_WizAtk3: claw when close, throw the def's missile otherwise — a spread
    // of them when the state line names one (the disciple's trio).
    _combo(m, args) {
        this.faceTarget(m);
        if (this.checkMeleeRange(m)) {
            this._hit(m, this._rng.damageRoll(args.damage ?? m.def.getParams().melee));
            return;
        }
        if (args.angles !== undefined) {
            this._fan(m, args);
            return;
        }
        this._missile(m, (args.kind ?? m.def.getParams().missile), args);
    }

    // A_KnightAttack: the axe half picks its projectile on a jet — the rare red
    // one hurts far more, and a ghost always throws it.
    _axeAttack(m, args) {
        this.faceTarget(m);
        if (this.checkMeleeRange(m)) {
            this._hit(m, this._rng.damageRoll(args.damage));
            return;
        }
        const ghost = (m.def.getFlags().ghost === true);
        const kind  = (((ghost) || (this._rng.next() < args.rareChance)) ? args.rareKind : args.kind);
        this._missile(m, kind, args);
    }

    // A_Srcr1Attack: D'Sparil spits one fireball while healthy and the whole
    // fan once wounded, where it may also chain a second volley. Both
    // thresholds are fractions of its full health, read from the state.
    _serpentAttack(m, args) {
        this.faceTarget(m);
        if (this.checkMeleeRange(m)) {
            this._hit(m, this._rng.damageRoll(args.damage));
            return;
        }
        const full = m.def.getHealth();
        if (m.health > DoomMonsterAttack._share(full, args.fanBelow)) {
            this._fire(m, args.kind, {height: args.height});
            return;
        }
        this._fan(m, {kind: args.kind, height: args.height, angles: args.angles});
        if (m.health >= DoomMonsterAttack._share(full, args.doubleBelow)) {
            return;
        }
        // Under the second threshold it attacks twice in a row, then rests one
        // volley (special1 carries the alternation).
        if (m.special1 !== 0) {
            m.special1 = 0;
            return;
        }
        m.special1 = 1;
        this._system.enterState(m, args.againState);
    }

    // A_SorcererRise: the mount dies and the sorcerer stands up out of it, on
    // the very spot, already awake and holding the same grudge.
    _sorcererRise(m, args) {
        this._system.noBlocking(m);
        const pos   = m.inst.getTransform().position;
        const risen = this._system.spawnBodyAt(args.spawn, pos[0], pos[1], pos[2], m.facing,
            {exclude: m, free: true, state: args.state});
        if (risen !== null) {
            risen.target = m.target;
        }
    }

    // A_Srcr2Decide: he blinks away to another BossSpot. The odds are read off
    // eighths of his health — untouched he never budges, and the more he bleeds
    // the harder he is to pin down.
    _sorcererDecide(m, args) {
        const step  = Math.max(1, Math.trunc(m.def.getHealth() / args.chances.length));
        const index = Math.min(args.chances.length - 1, Math.trunc(m.health / step));
        if ((this._rng.next() < args.chances[index]) && this._system.teleportToBossSpot(m, args.minDistance)) {
            this._system.enterState(m, args.teleportState);
        }
    }

    // A_Srcr2Attack: a crushing blow in reach; at range either the blue bolt
    // or, twice as often once he is under half his life, the pair of spawners
    // that hatch disciples on his flanks.
    _sorcererAttack(m, args) {
        if (m.target === null) {
            return;
        }
        this.faceTarget(m);
        if (this.checkMeleeRange(m)) {
            this._hit(m, this._rng.damageRoll(args.damage));
            return;
        }
        const chance = ((m.health < (m.def.getHealth() / 2)) ? args.hurtSpawnChance : args.spawnChance);
        if (this._rng.next() < chance) {
            for (const offset of args.spawnAngles) {
                this._fire(m, args.spawnerKind, {height: args.spawnerHeight, angleOffset: offset});
            }
            return;
        }
        this._missile(m, args.kind, args);
    }

    // A_Sor2DthInit / A_Sor2DthLoop: his death drags on — the middle of the
    // animation replays a set number of times before the bones settle.
    _deathLoopInit(m, args) {
        m.special1 = args.loops;
    }

    _deathLoop(m, args) {
        m.special1--;
        if (m.special1 > 0) {
            this._system.enterState(m, args.state);
        }
    }

    // A_LichAttack: melee in reach, else one of three shots drawn against the
    // distance — ice ball, fire column or whirlwind (close 20/40/40, far
    // 60/20/20 beyond eight cells).
    _lichAttack(m, args) {
        if (m.target === null) {
            return;
        }
        this.faceTarget(m);
        if (this.checkMeleeRange(m)) {
            this._hit(m, this._rng.damageRoll(args.damage));
            return;
        }
        const far  = ((DoomActorRef.distance2d(m, m.target) / WadConstants.SCALE) > args.farDistance);
        const roll = this._rng.next();
        if (roll < args.iceChance[((far) ? 1 : 0)]) {
            this._missile(m, args.iceKind, args);
            return;
        }
        if (roll < args.fireChance[((far) ? 1 : 0)]) {
            this._fireColumn(m, args);
            return;
        }
        const wind = this._fire(m, args.windKind, {height: args.windHeight});
        if (wind !== null) {
            wind.seekTarget = m.target;
        }
    }

    // The lich's fire column: one lead flame and a file of copies on its exact
    // heading, each climbing for a little longer than the last — the flames
    // fan out into a wall of fire as they cross the room (A_LichFireGrow).
    _fireColumn(m, args) {
        const lead = this._fire(m, args.fireKind, {});
        if (lead === null) {
            return;
        }
        for (let i = 0; i < args.fireCount; i++) {
            this._fire(m, args.fireKind, {vz: lead.vy, growTics: (i + 1) * 2});
        }
    }

    // A_MinotaurDecide: charge when the target is level and at mid range, the
    // floor-fire hammer when it stands on its floor and is near, else the swing
    // the state falls through to.
    _minotaurDecide(m, args) {
        const target = m.target;
        if (target === null) {
            return;
        }
        const dist = DoomActorRef.distance2d(m, target) / WadConstants.SCALE;
        const levelWith = ((DoomActorRef.topY(target) > DoomActorRef.feetY(m))
            && (DoomActorRef.topY(target) < DoomActorRef.topY(m)));
        if (levelWith && (dist < args.chargeMax) && (dist > args.chargeMin) && (this._rng.next() < args.chargeChance)) {
            this.faceTarget(m);
            this._system.enterState(m, args.chargeState);
            this._system.startCharge(m, args.chargeSpeed, (args.chargeInvulnerable === true));
            m.special1 = args.chargeTics;
            return;
        }
        if (this._system.standsOnFloor(target) && (dist < args.hammerMax) && (this._rng.next() < args.hammerChance)) {
            m.special2 = 0;
            this._system.enterState(m, args.hammerState);
            return;
        }
        this.faceTarget(m);
    }

    // A_MinotaurCharge: a puff every tic of the run, then back to the chase.
    _minotaurCharge(m, args) {
        if (m.special1 <= 0) {
            this._system.stopCharge(m);
            this._system.enterState(m, 'see0');
            return;
        }
        m.special1--;
        if (this._effects !== null) {
            const pos = m.inst.getTransform().position;
            this._effects.spawn(args.puff, pos[0], pos[1], pos[2]);
        }
    }

    // A_MinotaurAtk3: the hammer — melee in reach, else the fire that crawls
    // along the floor; either way it may swing again.
    _minotaurHammer(m, args) {
        this.faceTarget(m);
        if (this.checkMeleeRange(m)) {
            this._hit(m, this._rng.damageRoll(args.damage));
        } else {
            this._missile(m, args.kind, args);
        }
        if ((this._rng.next() < args.loopChance) && (m.special2 === 0)) {
            m.special2 = 1;
            this._system.enterState(m, args.loopState);
        }
    }

    // A_ImpMsAttack: the gargoyle only commits to its dive one time in four,
    // and slinks back to the chase otherwise.
    _impCharge(m, args) {
        if ((m.target === null) || (this._rng.next() > args.chance)) {
            this._system.enterState(m, 'see0');
            return;
        }
        this._charge(m, args);
    }

    // A_PainAttack: the elemental spits a lost soul, which flies off charging.
    // A_PainDie spits three as it bursts.
    _painAttack(m, args) {
        if (m.target === null) {
            return;
        }
        this.faceTarget(m);
        this._shootSoul(m, m.facing + (args.addAngle ?? 0), args);
    }

    _painDie(m, args) {
        this._system.noBlocking(m);
        for (const offset of args.spawnAngles) {
            this._shootSoul(m, m.facing + offset, args);
        }
    }

    // A_PainShootSkull: the soul appears clear of the elemental's own body and
    // charges at once. Too little headroom and nothing is spat — the elemental
    // just sinks a little, exactly like vanilla.
    _shootSoul(m, angleDeg, args) {
        const soul = this._system.spawnRuntimeBody(args.spawn, m, angleDeg);
        if (soul === null) {
            return;
        }
        soul.target = m.target;
        this._charge(soul, args);
    }

    // A_VileTarget: the hellfire is planted on the victim and follows it. The
    // vile keeps no handle on it — the flame lives out its own animation, which
    // lasts the cast, and A_VileAttack recomputes where it goes off.
    _vileTarget(m, args) {
        if ((m.target === null) || (this._effects === null)) {
            return;
        }
        this.faceTarget(m);
        this._effects.spawnTracking(args.fire, m.target, args.ahead);
    }

    // A_VileAttack: a direct hit, the hellfire's own blast where it stands, and
    // the upward kick that launches whoever survives.
    _vileAttack(m, args) {
        const target = m.target;
        if ((target === null) || !this._system.checkSightTo(m, target)) {
            return;
        }
        this.faceTarget(m);
        this._damage.damage(target, args.damage, {source: m});
        // The fire is called in between the vile and its victim before it goes
        // off (A_VileAttack moves it to -24 along the vile's own facing).
        const at = DoomActorRef.pointAt(target, m.facing, -args.ahead);
        this._damage.radiusAttack(at[0], at[1], at[2], args.blastDamage, args.blastRadius, {source: m});
        this._damage.launch(target, args.thrust);
    }

    // A_BspiAttack / A_CyberAttack / A_SpawnProjectile: a plain shot.
    _shoot(m, args) {
        this.faceTarget(m);
        this._missile(m, (args.kind ?? m.def.getParams().missile), args);
    }

    // A_PosAttack / A_SPosAttack / A_CPosAttack: a bullet volley.
    _bullets(m, args) {
        if ((m.target === null) || (this._hitscan === null)) {
            return;
        }
        this.faceTarget(m);
        const spec = (m.def.getParams().bullet ?? null);
        if (spec === null) {
            return;
        }
        this._hitscan.fireMonster(m, m.target, {
            rays:   (args.rays ?? 1),
            damage: spec.damage,
            puff:   spec.puff
        });
    }

    // A_CPosRefire / A_SpidRefire: keep the trigger down unless the target got
    // away — a jet decides whether to even look, so the burst length varies.
    _refire(m, args) {
        this.faceTarget(m);
        if (this._rng.next() < args.chance) {
            return;
        }
        if ((m.target === null) || DoomActorRef.isDead(m.target) || !this._system.checkSightTo(m, m.target)) {
            this._system.enterState(m, 'see0');
        }
    }

    // A_SkelMissile: the revenant's tracer leaves 16 units higher than a
    // normal missile and locks onto its target.
    _seekerMissile(m, args) {
        this.faceTarget(m);
        this._missile(m, (args.kind ?? m.def.getParams().missile), {
            height: (args.height ?? (WadConstants.MISSILE_SPAWN_HEIGHT + 16))
        });
    }

    // A_FatAttack1/2/3, A_WizAtk3's trio, A_MinotaurAtk2's five, D'Sparil's
    // three: one shot aimed at the target and the others copied from it, turned
    // by a fixed angle and sharing its slope (SpawnMissileAngle).
    _fan(m, args) {
        this.faceTarget(m);
        const params = m.def.getParams();
        const kind   = (args.kind ?? params.missile);
        const height = (args.height ?? WadConstants.MISSILE_SPAWN_HEIGHT);
        const angles = args.angles;
        const lead   = this._fire(m, kind, {height: height, angleOffset: angles[0]});
        if (lead === null) {
            return;
        }
        for (let i = 1; i < angles.length; i++) {
            this._fire(m, kind, {height: height, angleOffset: angles[i], vz: lead.vy});
        }
    }

    // A_SkullAttack: the charge. The body stops being a walker and becomes a
    // projectile of flesh until it slams into something (DoomMonsterMove).
    _charge(m, args) {
        if (m.target === null) {
            return;
        }
        this.faceTarget(m);
        this._system.startCharge(m, (args.speed ?? WadConstants.SKULL_CHARGE_SPEED));
    }

    // --- Internals ---

    // A fraction of a health pool, multiplied BEFORE dividing like the source
    // does: for a third of the integer healths — D'Sparil's own 3500 among them
    // — the two forms differ by one ulp, which flips the comparison for a body
    // sitting exactly on the threshold.
    static _share(health, fraction) {
        return ((health * fraction.num) / fraction.den);
    }

    // A blow landing on the current target, through the shared pipeline.
    _hit(m, damage) {
        if ((damage <= 0) || (m.target === null)) {
            return;
        }
        this._damage.damage(m.target, damage, {source: m});
    }

    // One missile toward the target; null when the kind is unknown.
    _missile(m, kind, args) {
        if ((kind === undefined) || (kind === null)) {
            return null;
        }

        return this._fire(m, kind, {height: (args.height ?? WadConstants.MISSILE_SPAWN_HEIGHT)});
    }

    _fire(m, kind, opts) {
        if ((this._projectiles === null) || (m.target === null)) {
            return null;
        }

        return this._projectiles.spawnAtTarget(kind, m, m.target, opts);
    }

}

// Every attack verb of the two bestiaries, mapped onto the generic handler that
// reproduces it. A name absent from this table is not an attack — the monster
// system tries its own (chase, death, boss) tables next, and anything left is a
// sound, which this engine has none of.
DoomMonsterAttack.VERBS = {
    // Facing (and the sound-only flourishes around it)
    A_FaceTarget:              '_face',
    A_SkelWhoosh:              '_face',
    A_FatRaise:                '_face',
    A_VileStart:               '_face',
    A_WizAtk1:                 '_face',
    A_WizAtk2:                 '_face',
    // Bullets
    A_PosAttack:               '_bullets',
    A_SPosAttack:              '_bullets',
    A_SposAttackUseAtkSound:   '_bullets',
    A_SPosAttackUseAtkSound:   '_bullets',
    A_CPosAttack:              '_bullets',
    A_CPosRefire:              '_refire',
    A_SpidRefire:              '_refire',
    // Melee only
    A_SargAttack:              '_melee',
    A_SkelFist:                '_melee',
    A_CustomMeleeAttack:       '_melee',
    A_MinotaurAtk1:            '_melee',
    // Melee or missile, by range
    A_TroopAttack:             '_combo',
    A_HeadAttack:              '_combo',
    A_BruisAttack:             '_combo',
    A_CustomComboAttack:       '_combo',
    A_WizAtk3:                 '_combo',
    A_MinotaurAtk2:            '_combo',
    A_KnightAttack:            '_axeAttack',
    A_Srcr1Attack:             '_serpentAttack',
    A_LichAttack:              '_lichAttack',
    A_MinotaurAtk3:            '_minotaurHammer',
    // Missile only
    A_BspiAttack:              '_shoot',
    A_CyberAttack:             '_shoot',
    A_SpawnProjectile:         '_shoot',
    A_SkelMissile:             '_seekerMissile',
    // Fans
    A_FatAttack1:              '_fan',
    A_FatAttack2:              '_fan',
    A_FatAttack3:              '_fan',
    // Charges
    A_SkullAttack:             '_charge',
    A_ImpMsAttack:             '_impCharge',
    A_MinotaurDecide:          '_minotaurDecide',
    A_MinotaurCharge:          '_minotaurCharge',
    // D'Sparil's second phase
    A_SorcererRise:            '_sorcererRise',
    A_Srcr2Decide:             '_sorcererDecide',
    A_Srcr2Attack:             '_sorcererAttack',
    A_Sor2DthInit:             '_deathLoopInit',
    A_Sor2DthLoop:             '_deathLoop',
    // Spawners and the archvile's hellfire
    A_PainAttack:              '_painAttack',
    A_PainDie:                 '_painDie',
    A_VileTarget:              '_vileTarget',
    A_VileAttack:              '_vileAttack'
};
