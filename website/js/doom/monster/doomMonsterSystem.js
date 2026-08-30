/**
 * Runtime monster driver at 35 Hz: state machine (entry actions dispatched
 * through a whitelist), velocity integration (knockback, gravity), rotation
 * views by octant (vanilla R_ProjectSprite: the world angle monster→viewer
 * minus the monster's facing selects one of the 8 octants; rotation 1 faces
 * the viewer), and the phase-C senses (A_Look wake-up on sight or on the
 * sector sound target fed by the player's fire).
 *
 * Records are added DURING the loading batch (the world builder) with their
 * engine instance: the entity exists as soon as loadFromData registers it —
 * only its object resolution waits for finalizeInit, which this system never
 * needs before its first update.
 */
class DoomMonsterSystem {
    constructor() {
        this._monsters      = [];
        this._user          = null;
        this._collision     = null;
        this._damage        = null;
        this._attack        = null;
        this._effects       = null;
        this._drops         = null;
        this._spawnables    = null;
        this._bossDeath     = null;
        this._levelData     = null;
        this._sight         = null;
        this._move          = null;
        this._sounds        = {};
        this._rng           = null;
        this._skillRule     = null;
        this._nightmareFast = false;
        this._timeAcc       = 0;
        this._ticCount      = 0;
        this._userSi        = null;
        this._userSiTic     = -1;
        this._respawnQueue  = [];
        // Serial of the bodies born mid-level, so two spat souls never share
        // a code (the save resolves targets and owners by code).
        this._runtimeSeq    = 0;
        this._zoneCache     = {};
        this._clockMs       = 0;
        // Dropped pickups spawned at runtime ({key, inst}): they carry no
        // instance code, so a save must re-spawn them explicitly.
        this._droppedRecords = [];
        this._pressure       = new DoomMoverPressure();
        this._trace          = new DoomMonsterTrace(this);
        this._bossBrain      = null;
        this._exitCallback   = null;
        this._view           = new DoomMonsterView();
    }

    /**
     * @param {object} record {code, inst (engine Instance), def,
     *                         facing (Doom degrees), flags,
     *                         frames: {letter → [objId ×1|×8]},
     *                         si (build sector index),
     *                         spawn: {position, facing, flags, si}}
     */
    add(record) {
        // Vanilla P_SpawnMobj: reactiontime comes from the actor info (8)
        // except in nightmare, where it stays 0 — the InstantReaction skill.
        const instant = ((this._skillRule !== null) && (this._skillRule.instantReaction === true));
        this._monsters.push({
            code:            record.code,
            inst:            record.inst,
            def:             record.def,
            // Folded here, at the ONE door every body comes through: a verb
            // that spits three souls at facing + 90/180/270 must not leave a
            // 585-degree angle on a record (and in the save).
            facing:          WadGeometry.normalizeAngle(record.facing),
            flags:           record.flags,
            frames:          record.frames,
            si:              (record.si ?? null),
            spawn:           (record.spawn ?? null),
            // Catalog key when the body was spat into the level at runtime
            // (null for the ones the map itself placed) — a save recreates it
            // from that key alone.
            spawnKind:       (record.spawnKind ?? null),
            health:          record.def.getHealth(),
            dead:            false,
            velX:            0,
            velZ:            0,
            velY:            0,
            target:          null,
            threshold:       0,
            reactiontime:    ((instant) ? 0 : DoomMonsterSystem.REACTION_TIME),
            movedir:         DoomMonsterMove.DI_NODIR,
            movecount:       0,
            // MF5_AVOIDINGDROPOFF, held for the length of one escape step
            // (transient: never saved).
            avoidingDropoff: false,
            special1:        0,
            special2:        0,
            // MF_JUSTATTACKED / MF_JUSTHIT: "not twice in a row" and "fight
            // back at once", the two flags that pace a fight.
            justAttacked:    false,
            justHit:         false,
            // MF_SKULLFLY: the body is charging, so it no longer walks — it
            // flies until it slams into something.
            charging:        false,
            invulnerable:    false,
            renderLight:     null,   // last factor pushed to the instance (null = never)
            litSi:           null,   // sector and bright flag the light was resolved for
            litBright:       false,
            inFloat:         false,
            respawnClock:    0,
            noKillCount:     false,
            crushedFlat:     false,
            blend:           null,
            snapRender:      false,
            walkStepped:     false,
            env:             new ActorExternalForces(),
            stateKey:        'spawn0',
            ticsLeft:        record.def.getState('spawn0').getTics(),
            shownObj:        null
        });
        return this;
    }

    setWorld(collision, user) {
        this._collision = collision;
        this._user      = user;
        this._trace.setUser(user);
        this._view.setUser(user);
        this._wireModules();
        return this;
    }

    // The senses and locomotion need BOTH the level data and the world; the
    // two setters arrive in build order — whichever lands last completes the
    // wiring (no implicit ordering constraint).
    _wireModules() {
        if ((this._levelData === null) || (this._collision === null)) {
            return;
        }
        if (this._sight === null) {
            this._sight = new DoomMonsterSight(this._collision, this._levelData, this._levelData.heights);
        }
        this._pressure.setHeights(this._levelData.heights).setCollision(this._collision);
        if ((this._move === null) && (this._rng !== null) && (this._user !== null)) {
            this._move = new DoomMonsterMove(this._collision, this._user, this._rng, this._levelData);
            this._move.setPostMove((m, fromX, fromZ, toX, toZ) => {
                m.walkStepped = true;
                this._resolveRide(m);
                this._crossLines(m, fromX, fromZ, toX, toZ);
            });
        }
    }

    // Skill rules of the running game (instantReaction, fastMonsters, respawn…),
    // set before the builder feeds the records.
    setSkillRule(rule) {
        this._skillRule = rule;
        return this;
    }

    // Skill-0 rule: the monsters live their whole vanilla life — wake, chase,
    // block, die, fire the boss map actions — but never attack.
    isPacifist() {
        return ((this._skillRule !== null) && (this._skillRule.monstersPacifist === true));
    }

    // Shared vanilla P_Random table (the locomotion rolls its direction and
    // move counts on it) — set before the world wiring.
    setRandom(rng) {
        this._rng = rng;
        return this;
    }

    // gameinfo nightmarefast (Heretic true, Doom false): the runtime chase
    // acceleration of the fastMonsters skill.
    setNightmareFast(flag) {
        this._nightmareFast = (flag === true);
        return this;
    }

    // Level-wide data built once by the world builder: the sector adjacency
    // graph (P_NoiseAlert flood, walk-line crossings), the REJECT table
    // (sight-check early-out, null when the WAD has none), the sector count
    // and a resolver over the level's polygon cache (a monster that moved
    // re-resolves its current sector through it).
    setLevelData(data) {
        this._levelData = data;
        this._view.setLevelData(data);
        this._pressure.setMovers(data.moverCodes);
        this._wireModules();
        // First lighting of the bodies already added: their views are baked
        // fullbright, so none may reach a draw unlit.
        for (const m of this._monsters) {
            this._view.applyLight(m);
        }
        return this;
    }

    // P_NoiseAlert entry point: the player's weapon fire (P_FireWeapon) floods
    // the sector graph from his sector — every reached sector remembers him
    // as its sound target, consumed by A_Look.
    noiseAlert() {
        if ((this._sight === null) || (this._user === null)) {
            return;
        }
        this._sight.noiseAlert(this._user, this._sectorIndexAt(this._user.x, this._user.z));
    }

    // Catalog key of one dropItems entry — shared with the world builder,
    // which prepares the pickup templates under the same key.
    static dropKey(d) {
        return (d.item + '|' + (d.amount ?? ''));
    }

    setDamageModule(damageModule) {
        this._damage = damageModule;
        this._pressure.setDamageModule(damageModule);
        return this;
    }

    getDamageModule() {
        return this._damage;
    }

    // The attack layer (DoomMonsterAttack): the gates A_Chase consults and the
    // verbs its states run.
    setAttack(attack) {
        this._attack = attack;
        return this;
    }

    // Bodies a verb may bring into the world mid-level (the lost soul an
    // elemental spits), prepared in the load batch by the world builder like
    // the drop pickups: code → {def, frames}.
    setSpawnables(catalog) {
        this._spawnables = catalog;
        return this;
    }

    // Transient effect spawner (DoomEffects), consumed by the teleport fog.
    setEffects(effects) {
        this._effects = effects;
        return this;
    }

    // Drop pickup templates prepared in the batch by the world builder,
    // keyed 'item|amount' (an interaction cannot register at runtime).
    setDrops(catalog) {
        this._drops = catalog;
        return this;
    }

    setCrushedCorpseView(objId) {
        this._pressure.setCrushedView(objId);
        return this;
    }

    // Per-level A_BossDeath rules (DoomBossDeath), set by the world builder.
    setBossDeath(service) {
        this._bossDeath = service;
        return this;
    }

    /**
     * The level's Icon of Sin bookkeeping (null on every other level): the
     * rotation of the target spots and the weighted draw of what a cube
     * hatches. Read by the spit verb and by a landing cube.
     */
    setBossBrain(service) {
        this._bossBrain = service;
        return this;
    }

    getBossBrain() {
        return this._bossBrain;
    }

    /**
     * How a monster ends the level (A_BrainDie): the NORMAL exit, so the tally
     * and the story text come up exactly as through an exit switch.
     */
    setExitCallback(callback) {
        this._exitCallback = callback;
        return this;
    }

    exitLevel() {
        if (this._exitCallback !== null) {
            this._exitCallback(false);
        }
    }

    countAliveOfDef(def) {
        return this._monsters.filter((m) => ((m.def === def) && !m.dead)).length;
    }

    getMonsters() {
        return this._monsters;
    }

    // Plain-data snapshot of every record (live and corpses) plus the dropped
    // pickups still on the ground, restorable by importState after a
    // deterministic level rebuild. The environmental channel and the render
    // smoothing are transient and not exported.
    exportState() {
        const monsters = this._monsters.map((m) => this._exportRecord(m));
        const drops    = [];
        for (const drop of this._droppedRecords) {
            // Picked up since it fell, or crushed by a mover and awaiting the
            // next frame's flush.
            if (this._isDropGone(drop) || drop.crushed) {
                continue;
            }
            const pos  = drop.inst.getTransform().position;
            const ride = drop.inst.getRideOn();
            drops.push({
                key:        drop.key,
                si:         drop.si,
                position:   [...pos],
                rideOnCode: ((ride !== null) ? ride.getCode() : null),
            });
        }

        return {
            monsters:     monsters,
            drops:        drops,
            // The spat-body counter travels with the save: reset to zero, a
            // reloaded elemental would hand a live soul's code to the next one.
            runtimeSeq:   this._runtimeSeq,
            // Consumed walk/teleport lines of the monsters (deterministic
            // build order) — owned here, where they are crossed.
            lines:        (this._levelData.monsterLines ?? []).map((line) => line.used),
            crushStalled: this._pressure.exportStalled(),
            // Where the Icon of Sin's rotation stands (null on every other
            // level): reloaded at zero, its cubes would walk the spots again
            // from the first one.
            bossBrain:    ((this._bossBrain !== null) ? this._bossBrain.exportState() : null),
        };
    }

    // Counterpart of exportState, applied on the freshly rebuilt records:
    // a build monster absent from the save is despawned (lost soul faded,
    // exploded barrel), a present one is patched in place, and the bodies born
    // during the saved game — nightmare respawns and the souls an elemental
    // spat — are recreated before anyone's target is resolved.
    importState(data) {
        this._runtimeSeq = (data.runtimeSeq ?? 0);
        const rebuilt = new Map(this._monsters.map((m) => [m.code, m]));
        const saved   = new Map(data.monsters.map((rec) => [rec.code, rec]));

        // A save from the old monster-free skill 0 carries NO record at all
        // (a cleared level still exports its corpses): the freshly built
        // monsters then stay as they are instead of being despawned.
        if (data.monsters.length > 0) {
            const kept = [];
            for (const m of this._monsters) {
                const rec = saved.get(m.code);
                if (rec === undefined) {
                    this._despawn(m);
                    continue;
                }
                this._restoreRecord(m, rec);
                kept.push(m);
            }
            this._monsters = kept;
        }

        for (const rec of data.monsters) {
            if (rebuilt.has(rec.code)) {
                continue;
            }
            const fresh = this._recreateRuntimeBody(rec, rebuilt);
            if (fresh !== null) {
                this._restoreRecord(fresh, rec);
            }
        }

        // Targets last: only now does every body of the saved fight exist, so
        // an infighting pair can point at each other again.
        const byCode = new Map(this._monsters.map((m) => [m.code, m]));
        for (const rec of data.monsters) {
            const m = byCode.get(rec.code);
            if (m !== undefined) {
                m.target = this._resolveTargetCode(rec.targetCode, byCode);
            }
        }

        this._droppedRecords = [];
        for (const drop of data.drops) {
            const ride = ((drop.rideOnCode !== null) ? loader.instances().getByCode(drop.rideOnCode) : null);
            // Saves predating the si field re-resolve it from the position.
            const si   = ((drop.si !== undefined)
                ? drop.si
                : this._sectorIndexAt(drop.position[0], drop.position[2]));
            this._spawnDropAt(drop.key, drop.position[0], drop.position[1], drop.position[2], ride, si);
        }

        const lines = (this._levelData.monsterLines ?? []);
        for (let i = 0; i < lines.length && i < data.lines.length; i++) {
            lines[i].used = data.lines[i];
        }

        this._pressure.importStalled(data.crushStalled ?? []);
        if (this._bossBrain !== null) {
            this._bossBrain.importState(data.bossBrain ?? null);
        }
    }

    // A body that did not exist at build time: a nightmare respawn ('_r'),
    // which copies its original, or a spat soul ('_s'), which comes from the
    // runtime-spawnable catalog under the kind the save recorded.
    _recreateRuntimeBody(rec, rebuilt) {
        if (rec.spawnKind !== null) {
            const template = ((this._spawnables !== null) ? (this._spawnables[rec.spawnKind] ?? null) : null);
            if (template === null) {
                return null;
            }

            return this._spawnBody({
                code:     rec.code,
                def:      template.def,
                frames:   template.frames,
                radius:   template.def.getRadius() * WadConstants.SCALE,
                position: rec.position,
                facing:   rec.facing,
                flags:    0,
                si:       rec.si,
                spawn:    null
            });
        }
        const proto = rebuilt.get(rec.code.replace(/(_r)+$/, ''));

        return ((proto !== undefined) ? this._spawnFreshBody(proto, rec.code, rec.position) : null);
    }

    /**
     * How a save names an actor: nothing, the player, or another body's
     * instance code (infighting). Public and static — the projectile system
     * writes the owner and the seek target of every shot in flight with it,
     * and reads them back through actorByCode.
     *
     * @param {object|null} actor player, monster record, or null
     * @returns {string|null}
     */
    static actorCode(actor) {
        if (actor === null) {
            return null;
        }

        return ((DoomActorRef.isPlayer(actor)) ? DoomMonsterSystem.PLAYER_TARGET_CODE : actor.code);
    }

    /**
     * A saved actor code (a body, or the player) resolved against the live
     * level — how a restored missile finds its owner and its lock again.
     *
     * @returns {object|null}
     */
    actorByCode(code) {
        return this._resolveTargetCode(code, new Map(this._monsters.map((m) => [m.code, m])));
    }

    _resolveTargetCode(code, byCode) {
        if ((code === null) || (code === undefined)) {
            return null;
        }
        if (code === DoomMonsterSystem.PLAYER_TARGET_CODE) {
            return this._user;
        }

        return (byCode.get(code) ?? null);
    }

    _exportRecord(m) {
        const pos = m.inst.getTransform().position;

        return {
            code:           m.code,
            spawnKind:      m.spawnKind,
            position:       [...pos],
            facing:         m.facing,
            si:             m.si,
            stateKey:       m.stateKey,
            ticsLeft:       m.ticsLeft,
            health:         m.health,
            dead:           m.dead,
            velX:           m.velX,
            velY:           m.velY,
            velZ:           m.velZ,
            targetCode:     DoomMonsterSystem.actorCode(m.target),
            threshold:      m.threshold,
            reactiontime:   m.reactiontime,
            movedir:        m.movedir,
            movecount:      m.movecount,
            special1:       m.special1,
            special2:       m.special2,
            justAttacked:   m.justAttacked,
            justHit:        m.justHit,
            charging:       m.charging,
            invulnerable:   m.invulnerable,
            inFloat:        m.inFloat,
            respawnClock:   m.respawnClock,
            noKillCount:    m.noKillCount,
            crushedFlat:    m.crushedFlat,
            hasBox:         ((this._collision !== null) && this._collision.hasBoxFor(m.inst)),
        };
    }

    // The state key and tics are written DIRECTLY — enterState would replay
    // the entry action (A_Explode, A_NoBlocking, A_Look) on a state the saved
    // game already went through.
    _restoreRecord(m, rec) {
        const pos = m.inst.getTransform().position;
        m.inst.translate(rec.position[0] - pos[0], rec.position[1] - pos[1], rec.position[2] - pos[2]);
        m.facing       = rec.facing;
        m.si           = rec.si;
        m.stateKey     = rec.stateKey;
        m.ticsLeft     = rec.ticsLeft;
        m.health       = rec.health;
        m.dead         = rec.dead;
        m.velX         = rec.velX;
        m.velY         = rec.velY;
        m.velZ         = rec.velZ;
        // The target is resolved once every body of the save exists again.
        m.target       = null;
        m.threshold    = rec.threshold;
        m.reactiontime = rec.reactiontime;
        m.movedir      = rec.movedir;
        m.movecount    = rec.movecount;
        m.special1     = rec.special1;
        m.special2     = (rec.special2 ?? 0);
        m.justAttacked = (rec.justAttacked === true);
        m.justHit      = (rec.justHit === true);
        m.charging     = (rec.charging === true);
        m.invulnerable = (rec.invulnerable === true);
        m.inFloat      = rec.inFloat;
        m.respawnClock = rec.respawnClock;
        m.noKillCount  = rec.noKillCount;
        this._pressure.restoreFlat(m, rec.crushedFlat);
        m.blend        = null;
        m.snapRender   = false;
        if (this._collision !== null) {
            if (rec.hasBox === true) {
                this._collision.syncBoxFor(m.inst);
            } else {
                this._collision.removeBoxFor(m.inst);
            }
        }
        this._resolveRide(m);
        this._view.refresh(m);
        this._view.applyLight(m);

        return m;
    }

    update(dt) {
        if (this._user === null) {
            return;
        }
        this._clockMs += dt;
        // Environmental channel (wind/conveyors/ice fed by the sector-push
        // interaction earlier this frame): integrate per frame like the User,
        // consumed per tic, then reset for the next frame's emitters.
        for (const m of this._monsters) {
            m.env.integrate(dt / 1000);
        }
        // Mover motion is a FRAME fact (the animations advance in World.update):
        // read it once here so every tic drained below sees the same state —
        // sampled per tic, a slow frame would miss the movement on most tics.
        this._pressure.refreshMotion();
        this._timeAcc += dt;
        while (this._timeAcc >= DoomMonsterSystem.MS_PER_TIC) {
            this._timeAcc -= DoomMonsterSystem.MS_PER_TIC;
            this._stepTic();
        }
        for (const m of this._monsters) {
            m.env.beginFrame();
            this._view.applyBlend(m, this._clockMs);
            this._view.applyLight(m);
        }
        this._refreshDropLight();
    }

    // A drop never moves sector, so the light is only recomputed while its
    // sector runs a light effect. Picked-up drops leave a despawned instance
    // behind: purge their records here.
    _refreshDropLight() {
        for (let i = this._droppedRecords.length - 1; i >= 0; i--) {
            const drop = this._droppedRecords[i];
            if (this._isDropGone(drop)) {
                this._droppedRecords.splice(i, 1);
                continue;
            }
            this._view.pushLight(drop, false);
        }
    }

    // Picked up: DoomPickupInteraction scheduled the instance's removal.
    // Identity-checked so a reused id can never pass for the drop.
    _isDropGone(drop) {
        return (loader.instances().get(drop.inst.getId()) !== drop.inst);
    }

    // Sector index under a world position, null when no sector claims it.
    _sectorIndexAt(x, z) {
        if (this._levelData === null) {
            return null;
        }
        const S   = WadConstants.SCALE;
        const sec = this._levelData.findSector(x / S, z / S);
        return ((sec !== null) ? sec.si : null);
    }

    _stepTic() {
        this._ticCount++;
        this._pressure.pressureTic(this._monsters, this._droppedRecords, this._ticCount);
        const kept = [];
        for (const m of this._monsters) {
            const before   = m.inst.getTransform().position;
            const beforeX  = before[0];
            const beforeY  = before[1];
            const beforeZ  = before[2];
            m.walkStepped  = false;
            if (m.charging) {
                this._stepCharge(m);
            } else {
                this._floatToward(m);
                this._integrateVelocity(m);
            }
            // A live rider's box blocker follows its lift (the ride sync moves
            // the body outside this system) — corpses have no box anymore.
            if (!m.dead && (this._collision !== null) && (m.inst.getRideOn() !== null)) {
                this._collision.syncBoxFor(m.inst);
            }
            if (this._maybeNightmareRespawn(m)) {
                this._despawn(m);
                continue;
            }
            const state = m.def.getState(m.stateKey);
            if (state.getTics() >= 0) {
                m.ticsLeft--;
                if (m.ticsLeft <= 0) {
                    if (state.getNext() !== null) {
                        this.enterState(m, state.getNext());
                    } else {
                        // A finite last state with no follow-up is the vanilla
                        // Stop with no corpse frame (lost soul, pain elemental,
                        // exploded barrel): the body vanishes from the world.
                        this._despawn(m);
                        continue;
                    }
                }
            }

            this._view.armBlend(m, beforeX, beforeY, beforeZ, this._clockMs);
            this._view.refresh(m);
            kept.push(m);
        }
        this._monsters = kept;
        if (this._respawnQueue.length > 0) {
            for (const spawn of this._respawnQueue) {
                this._spawnRespawned(spawn);
            }
            this._respawnQueue = [];
        }
    }

    // One tic of a charging body (MF_SKULLFLY): it flies its whole velocity in
    // a straight line and stops on the first thing it meets — a body takes the
    // slam damage, a wall just ends the run. Nothing else applies: a charge
    // ignores the ground, the walk and the float.
    _stepCharge(m) {
        if (this._collision === null) {
            return;
        }
        const S    = WadConstants.SCALE;
        const pos  = m.inst.getTransform().position;
        const r    = m.inst.getCollisionRadius();
        const h    = m.def.getHeight() * S;
        const dx   = m.velX * S;
        const dy   = m.velY * S;
        const dz   = m.velZ * S;
        const step = Math.hypot(dx, dy, dz);
        if (step < 1e-9) {
            this.slam(m, null);
            return;
        }
        const centreY = pos[1] + h / 2;
        const body = this.traceRay(pos[0], centreY, pos[2], dx / step, dy / step, dz / step, step + r,
            {exclude: m, includePlayer: true, immuneTo: m});
        if (body !== null) {
            this.slam(m, body.ref);
            return;
        }
        const solved = this._collision.resolveWall(pos[0], pos[2], dx, dz, r, pos[1], h, 0, m.inst);
        if ((Math.abs(solved.x - (pos[0] + dx)) > DoomMonsterMove.CONTACT_EPSILON)
            || (Math.abs(solved.z - (pos[2] + dz)) > DoomMonsterMove.CONTACT_EPSILON)) {
            this.slam(m, null);
            return;
        }
        m.inst.translate(dx, dy, dz);
        this._collision.syncBoxFor(m.inst);
        const si = this._sectorIndexAt(pos[0], pos[2]);
        if (si !== null) {
            m.si = si;
        }
    }

    // P_NightmareRespawn trigger (p_mobj.c P_MobjThinker): a counted corpse
    // resting on its terminal frame ages, then rolls 5/256 every 32 tics past
    // 12 s — and only respawns when its ORIGINAL spot is free of live bodies
    // and of the player. The actual spawn is queued (never mutate the list
    // mid-iteration).
    _maybeNightmareRespawn(m) {
        if (!m.dead || (this._skillRule === null) || !(this._skillRule.respawnTicsDelay > 0)) {
            return false;
        }
        if ((m.def.getFlags().countsKill === false) || (m.spawn === null)) {
            return false;
        }
        if (m.def.getState(m.stateKey).getTics() >= 0) {
            return false;
        }
        m.respawnClock++;
        if (m.respawnClock < this._skillRule.respawnTicsDelay) {
            return false;
        }
        if ((this._ticCount & 31) !== 0) {
            return false;
        }
        if (this._rng.next() > DoomMonsterSystem.RESPAWN_DICE) {
            return false;
        }
        const spot = this._spotOccupancy(m.spawn.position[0], m.spawn.position[2], m.inst.getCollisionRadius(), m);
        if ((spot.blockers.length > 0) || spot.playerBlocks) {
            return false;
        }
        this._respawnQueue.push(m);
        return true;
    }

    // P_CheckPosition against the live bodies and the player (the world
    // geometry validated these spots at map load) — shared by the nightmare
    // respawn (any occupancy refuses) and the monster teleport (which may stomp).
    _spotOccupancy(x, z, r, exclude) {
        const blockers = [];
        for (const other of this._monsters) {
            if ((other === exclude) || other.dead) {
                continue;
            }
            const op = other.inst.getTransform().position;
            if (WadGeometry.boxesOverlap2d(x, z, r, op[0], op[2], other.inst.getCollisionRadius())) {
                blockers.push(other);
            }
        }
        const u = this._user;
        return {
            blockers:     blockers,
            playerBlocks: WadGeometry.boxesOverlap2d(x, z, r, u.x, u.z, u.getRadius())
        };
    }

    // Fresh actor at the original THINGS spot: same def/frames/facing/ambush,
    // reactiontime 18 (vanilla), and — user decision — its future death no
    // longer feeds the ☠ counter (x stays ≤ y despite the endless respawns).
    _spawnRespawned(m) {
        const fresh = this._spawnFreshBody(m, m.code + '_r', m.spawn.position);
        fresh.reactiontime = DoomMonsterSystem.RESPAWN_REACTION;
        this._resolveRide(fresh);
        // P_NightmareRespawn rings the teleport at both ends — the corpse and
        // the spot (the visual fog itself belongs to the fidelity pass).
        doomSound.playAt('misc/teleport', [...m.inst.getTransform().position], {});
        doomSound.playAt('misc/teleport', [...fresh.inst.getTransform().position], {});
    }

    // Fresh runtime body sharing an existing record's def/frames/spawn — the
    // nightmare respawn and the save restore of a respawned monster. Runtime
    // bodies never feed the ☠ counter (their build original already did).
    _spawnFreshBody(proto, code, position) {
        return this._spawnBody({
            code:     code,
            def:      proto.def,
            frames:   proto.frames,
            radius:   proto.inst.getCollisionRadius(),
            position: position,
            facing:   proto.spawn.facing,
            flags:    proto.spawn.flags,
            si:       proto.spawn.si,
            spawn:    proto.spawn
        });
    }

    /**
     * A body a verb brings into the world mid-level: the lost soul an
     * elemental spits (A_PainShootSkull). It appears clear of its parent —
     * `4 + (both radii) × 1.5` in front of the given angle, eight units up —
     * and never at all when that spot is taken or too low, which is exactly
     * what makes an elemental against a ceiling spit nothing.
     *
     * @param {string} kind   key of the profile's runtime-spawnable catalog
     * @param {object} parent the body spitting it
     * @param {number} angle  Doom degrees the child is pushed toward
     * @returns {object|null} the fresh record
     */
    spawnRuntimeBody(kind, parent, angle) {
        const template = ((this._spawnables !== null) ? (this._spawnables[kind] ?? null) : null);
        if ((template === null) || (this._collision === null)) {
            return null;
        }
        const parentPos = parent.inst.getTransform().position;
        const radius    = template.def.getRadius() * WadConstants.SCALE;
        const lift      = DoomMonsterSystem.SPAWN_LIFT * WadConstants.SCALE;

        // A_PainShootSkull measures the room against the SPITTER's own head
        // plus the lift, never the spat body's: an elemental with its skull in
        // the ceiling spits nothing and SINKS instead, which is what drags it
        // back down into the room.
        const parentTop = parentPos[1] + parent.def.getHeight() * WadConstants.SCALE;
        const ceiling   = this._collision.getCeiling(parentPos[0], parentPos[2],
            parent.inst.getCollisionRadius(), parentPos[1] + 0.01);
        if ((parentTop + lift) > ceiling) {
            if (parent.def.getFlags().float === true) {
                parent.velY    -= DoomMonsterSystem.SPAWN_BLOCKED_SINK;
                parent.inFloat  = true;
            }
            return null;
        }

        const prestep = (DoomMonsterSystem.SPAWN_PRESTEP
            + (parent.inst.getCollisionRadius() + radius) / WadConstants.SCALE * 1.5) * WadConstants.SCALE;
        const rad = angle * DEG_TO_RAD;
        const x   = parentPos[0] + Math.cos(rad) * prestep;
        const z   = parentPos[2] + Math.sin(rad) * prestep;
        const y   = parentPos[1] + lift;

        return this.spawnBodyAt(kind, x, y, z, angle, {exclude: parent});
    }

    /**
     * A body born at an explicit spot: the wizard a D'Sparil spawner hatches,
     * the sorcerer rising out of his dying mount. Returns null when the space
     * is taken, which is what keeps a spawner flying until it finds room.
     *
     * @param {object} opts {exclude?: a body that does not block the spot,
     *                       state?: the state key it starts in, free?: skip
     *                       the occupancy test (the sorcerer replaces its own
     *                       corpse and a boss cube stomps its spot first, so
     *                       both always fit)}
     * @returns {object|null} the fresh record
     */
    spawnBodyAt(kind, x, y, z, angle, opts = {}) {
        const template = ((this._spawnables !== null) ? (this._spawnables[kind] ?? null) : null);
        if (template === null) {
            return null;
        }
        const radius = template.def.getRadius() * WadConstants.SCALE;
        if (opts.free !== true) {
            const spot = this._spotOccupancy(x, z, radius, (opts.exclude ?? null));
            if ((spot.blockers.length > 0) || spot.playerBlocks) {
                return null;
            }
        }
        const fresh = this._spawnBody({
            code:      'runtime_' + kind + '_' + (this._runtimeSeq++),
            spawnKind: kind,
            def:       template.def,
            frames:    template.frames,
            radius:    radius,
            position:  [x, y, z],
            facing:    angle,
            flags:     0,
            si:        this._sectorIndexAt(x, z),
            spawn:     null
        });
        if ((fresh !== null) && (opts.state !== undefined)) {
            this.enterState(fresh, opts.state);
        }

        return fresh;
    }

    /**
     * Clear a spot for a body about to land on it (TeleportMove with
     * telefragging on): every live body and the player standing there are
     * killed outright. The Icon of Sin's cubes land this way — that is what
     * makes standing on a target spot lethal.
     *
     * @param {number}      x       world position of the spot
     * @param {number}      z
     * @param {string}      kind    catalog key of the body about to land
     * @param {object|null} exclude a body that does not count as an occupant
     */
    telefragAt(x, z, kind, exclude = null) {
        const template = ((this._spawnables !== null) ? (this._spawnables[kind] ?? null) : null);
        if (template === null) {
            return;
        }
        const spot = this._spotOccupancy(x, z, template.def.getRadius() * WadConstants.SCALE, exclude);
        for (const other of spot.blockers) {
            this._damage.damage(other, WadConstants.TELEFRAG_DAMAGE, {});
        }
        if (spot.playerBlocks) {
            this._user.takeDamage(WadConstants.TELEFRAG_DAMAGE);
        }
    }

    /**
     * A body that appeared mid-level enters the fight at once (SpawnFly): it
     * inherits the grudge of whoever sent it, hears what its sector last heard,
     * and walks straight into its See state.
     *
     * @param {object}      body   a record from spawnBodyAt
     * @param {object|null} target what its sender was after
     */
    wakeSpawnedBody(body, target) {
        body.target = (target ?? this._sight.getSoundTarget(body.si) ?? null);
        if ((body.target !== null) && (body.def.getState('see0') !== null)) {
            this.enterState(body, 'see0');
        }
    }

    /**
     * DSparilTeleport: the sorcerer vanishes and reappears on a BossSpot at
     * least `minDistance` map units away, leaving a fade behind him. Without
     * spots on the map (or with nowhere far enough) he simply stays put.
     *
     * @returns {boolean} true when he moved
     */
    teleportToBossSpot(m, minDistance) {
        const spots = ((this._levelData.spots ?? {}).bossSpot ?? []);
        if (spots.length === 0) {
            return false;
        }
        const pos  = m.inst.getTransform().position;
        const far  = minDistance * WadConstants.SCALE;
        const away = spots.filter((s) => (Math.hypot(s.x - pos[0], s.z - pos[2]) >= far));
        if (away.length === 0) {
            return false;
        }
        const spot = away[this._rng.next() % away.length];

        return this._monsterTeleport(m, {x: spot.x, y: spot.y, z: spot.z, yaw: spot.angle, topY: Infinity});
    }

    // The one place a record and its engine instance come into being outside
    // the level build: every runtime body (respawn, spit soul) goes through it.
    _spawnBody(spec) {
        const idle0  = spec.def.getState('spawn0');
        const instId = loader.instances().spawnFromData(null, {
            code:            null,
            object:          spec.frames[DoomMonsterDef.viewKey(idle0.getSprite(), idle0.getFrame())][0],
            position:        [spec.position[0], spec.position[1], spec.position[2]],
            rotation:        [0, 0, 0],
            trigger:         'none',
            loop:            false,
            onlyOnce:        false,
            collisionShape:  'box',
            collisionRadius: spec.radius,
            keyframes:       []
        });
        const inst = loader.instances().get(instId);
        this.add({
            code:      spec.code,
            spawnKind: (spec.spawnKind ?? null),
            inst:      inst,
            def:       spec.def,
            facing:    spec.facing,
            flags:     spec.flags,
            frames:    spec.frames,
            si:        spec.si,
            spawn:     spec.spawn
        });
        const fresh = this._monsters[this._monsters.length - 1];
        fresh.noKillCount = true;
        if (this._collision !== null) {
            this._collision.addInstance(inst);
        }
        this._view.applyLight(fresh);

        return fresh;
    }

    // A_SkullAttack: the body stops walking and becomes a charge — velocity
    // straight at the target, slope closed over the distance it will take to
    // cross. DoomMonsterMove drives it from there until it slams.
    startCharge(m, speedUnitsPerTic, invulnerable = false) {
        if (m.target === null) {
            return;
        }
        // Heretic's maulotaur cannot be touched while it runs (A_MinotaurDecide
        // arms it, A_MinotaurCharge lifts it at the end of the run).
        m.invulnerable = invulnerable;
        if (this._attack !== null) {
            this._attack.faceTarget(m);
        }
        const speed = speedUnitsPerTic * WadConstants.SCALE;
        const angle = m.facing * DEG_TO_RAD;
        m.charging = true;
        m.velX = Math.cos(angle) * speedUnitsPerTic;
        m.velZ = Math.sin(angle) * speedUnitsPerTic;
        // Vel.Z = (target centre − own feet) / (tics the crossing will take).
        const dist = Math.max(DoomActorRef.distance2d(m, m.target), speed);
        const rise = DoomActorRef.centerY(m.target) - DoomActorRef.feetY(m);
        m.velY = (rise / (dist / speed)) / WadConstants.SCALE;
    }

    // The charge is over (it slammed, or the maulotaur's run timed out).
    stopCharge(m) {
        m.charging     = false;
        m.invulnerable = false;
        m.velX = 0;
        m.velZ = 0;
        m.velY = 0;
    }

    // Slam (actor.cpp): what a charging body does when it finally meets
    // something — its damage roll on whatever it hit, then back to the chase.
    // A wall does the same without the blow.
    slam(m, victim) {
        this.stopCharge(m);
        if ((victim !== null) && (this._damage !== null) && !m.dead) {
            const spec = (m.def.getParams().chargeDamage ?? null);
            if (spec !== null) {
                this._damage.damage(victim, this._rng.damageRoll(spec), {source: m});
            }
        }
        if (!m.dead) {
            this.enterState(m, ((m.def.getState('see0') !== null) ? 'see0' : 'spawn0'));
        }
    }

    // Switch a monster to a new state and run its entry action. A state of
    // ZERO tics is not a frame, it is a step of the SAME tic (P_SetMobjState
    // loops until it lands on a state that lasts): the archvile's A_VileStart
    // and the elemental's A_PainAttack sit on such states, and letting them
    // eat a tic would drift every one of their attacks. The guard is the same
    // one the weapon psprites use.
    //
    // Under the fastMonsters skill, a state carrying the zscript Fast keyword
    // halves its duration on entry (GetTics: tics − (tics>>1)).
    /**
     * Sound table of the game's bestiary (profile monsterSounds()), keyed by
     * def code — see playMonsterSound.
     *
     * @param {object} map
     */
    setMonsterSounds(map) {
        this._sounds = (map ?? {});
        return this;
    }

    /**
     * One monster voice line: 'see'/'active'/'pain'/'death' on the voice
     * channel, 'melee'/'attack' on the weapon one, steps on 'body'. A new
     * sound replaces the channel's previous one (vanilla per-actor channels);
     * a boss barks its sight and death over the whole level (bBoss).
     *
     * @param {object} m monster record
     * @param {string} key entry of the def's sound table
     * @param {string} channel 'voice' | 'weapon' | 'body'
     */
    playMonsterSound(m, key, channel = 'voice') {
        const table = this._sounds[m.def.getCode()];
        if (table === undefined) {
            return;
        }
        const name = (table[key] ?? null);
        if (name === null) {
            return;
        }
        const boss = ((table.boss === true) && ((key === 'see') || (key === 'death')));
        doomSound.playAt(name, m.inst.getWorldCenter(), {
            attenuation: ((boss) ? WadConstants.SOUND_ATTN.none : WadConstants.SOUND_ATTN.norm),
            replaceKey:  ('monster:' + m.inst.getId() + ':' + channel)
        });
    }

    enterState(m, key) {
        this._playStateEntrySound(m, key);
        let next  = key;
        let guard = 0;
        while ((next !== null) && (guard < DoomMonsterSystem.STATE_CHAIN_GUARD)) {
            guard++;
            const state = m.def.getState(next);
            m.stateKey = next;
            m.ticsLeft = state.getTics();
            if ((m.ticsLeft > 0) && state.isFast()
                && (this._skillRule !== null) && (this._skillRule.fastMonsters === true)) {
                m.ticsLeft = m.ticsLeft - (m.ticsLeft >> 1);
            }
            this._dispatchAction(m, state.getAction(), state.getArgs());
            // The action may have jumped elsewhere (A_CPosRefire back to the
            // chase): that jump already ran its own entry, nothing left to do.
            if (m.stateKey !== next) {
                return;
            }
            if (m.ticsLeft !== 0) {
                break;
            }
            next = state.getNext();
        }
        this._view.refresh(m);
    }

    // Screams tied to the entry of a state group (P_KillMobj, the pain roll,
    // A_XScream on the gib chain, the archvile raising a corpse). Restores
    // write stateKey directly and never come through here.
    _playStateEntrySound(m, key) {
        if (key === 'pain0') {
            this.playMonsterSound(m, 'pain');
            return;
        }
        if (key === 'death0') {
            this.playMonsterSound(m, 'death');
            return;
        }
        if (key === 'xdeath0') {
            doomSound.playAt('misc/gibbed', m.inst.getWorldCenter(),
                {replaceKey: ('monster:' + m.inst.getId() + ':voice')});
            return;
        }
        if (key === 'raise0') {
            doomSound.playAt('vile/raise', m.inst.getWorldCenter());
        }
    }

    _dispatchAction(m, action, args) {
        if (action === null) {
            return;
        }
        // A_StartSound riding a state line (hooves, the revenant's whoosh,
        // D'Sparil's rise) — profile data, played from the body channel.
        const table = this._sounds[m.def.getCode()];
        if ((table !== undefined) && ((table.actions?.[action] ?? null) !== null)) {
            doomSound.playAt(table.actions[action], m.inst.getWorldCenter(),
                {replaceKey: ('monster:' + m.inst.getId() + ':body')});
        }
        // The attack layer owns every aiming and hurting verb.
        if ((this._attack !== null) && this._attack.run(m, action, args)) {
            return;
        }
        if ((action === 'A_Look') || (action === 'A_MinotaurLook')) {
            this._aLook(m);
            return;
        }
        if (DoomMonsterSystem.CHASE_ACTIONS.has(action)) {
            this._aChase(m, action);
            return;
        }
        if (action === 'A_Sor1Pain') {
            // dsparil.zs: the pain arms the serpent's chase acceleration
            m.special1 = 20;
            return;
        }
        // A_KeenDie is A_BossDeath with a door hardwired to tag 666; the
        // profile declares that door as the map's boss action, so both verbs
        // walk the same path.
        if ((action === 'A_BossDeath') || (action === 'A_KeenDie')) {
            if (action === 'A_KeenDie') {
                this.noBlocking(m);
            }
            if (this._bossDeath !== null) {
                this._bossDeath.onDeath(m.def);
            }
            return;
        }
        // The Heretic imp unblocks through its own death verbs (hereticimp.zs
        // A_ImpDeath / A_ImpXDeath1: bSolid = false) — same effect as
        // A_NoBlocking, without which a dead gargoyle still blocks the player.
        if ((action === 'A_NoBlocking') || (action === 'A_ImpDeath') || (action === 'A_ImpXDeath1')) {
            this.noBlocking(m);
            this._spawnDrops(m);
            return;
        }
        if ((action === 'A_Explode') && (this._damage !== null)) {
            const explode = (m.def.getParams().explode ?? null);
            if (explode !== null) {
                // Blast from the body's CENTRE, not its floor-glued feet — the
                // sight rays of P_CheckSight run between body centres, and a
                // ray leaving the exact floor plane self-blocks on it.
                const at = m.inst.getWorldCenter();
                // P_RadiusAttack(self, self.target): the blast is credited to
                // whoever set the barrel off, not to the barrel — which is what
                // makes a barrel chain turn a room against the player, and what
                // lets the chain carry that blame from barrel to barrel.
                this._damage.radiusAttack(at[0], at[1], at[2], explode.damage, explode.distance,
                    {exclude: m, source: m.target});
            }
        }
    }

    // A_NoBlocking: the body stops being solid (and its drops fall out).
    noBlocking(m) {
        if (this._collision !== null) {
            this._collision.removeBoxFor(m.inst);
        }
    }

    _despawn(m) {
        loader.instances().scheduleRemoval(m.inst);
        if (this._collision !== null) {
            this._collision.removeBoxFor(m.inst);
        }
    }

    // A_Look (p_enemy.cpp): threshold cleared, then the sector sound target —
    // a deaf monster (THINGS ambush bit) ignores it unless it SEES the target
    // — then the visual scan (180° FOV + point-blank exception + sight check).
    _aLook(m) {
        m.threshold = 0;
        const heard = ((this._sight !== null) ? this._sight.getSoundTarget(m.si) : null);
        if ((heard !== null) && !heard.isDead()) {
            if ((m.flags & WadConstants.MTF_AMBUSH) !== 0) {
                if (this._checkSight(m)) {
                    this._wake(m);
                    return;
                }
            } else {
                this._wake(m);
                return;
            }
        }
        if (this._lookForPlayer(m)) {
            this._wake(m);
        }
    }

    // P_LookForPlayers / P_IsVisible: front 180° cone around the facing, with
    // the vanilla point-blank exception (seen even behind when closer than
    // MELEERANGE + radius), then the expensive sight check last. The chase
    // re-scan passes allaround (vanilla A_Chase looks in every direction).
    _lookForPlayer(m, allaround = false) {
        if ((this._user === null) || this._user.isDead()) {
            return false;
        }
        const pos = m.inst.getTransform().position;
        const dx  = this._user.x - pos[0];
        const dz  = this._user.z - pos[2];
        if (!allaround) {
            let diff = WadGeometry.normalizeAngle(Math.atan2(dz, dx) * 180 / Math.PI - m.facing);
            if (diff > 180) {
                diff = 360 - diff;
            }
            if (diff > 90) {
                const closeRange = (DoomMonsterSystem.MELEE_RANGE + m.def.getRadius()) * WadConstants.SCALE;
                if (Math.hypot(dx, dz) > closeRange) {
                    return false;
                }
            }
        }
        if (!this._checkSight(m)) {
            return false;
        }

        return this._spotsShadow(m, dx, dz);
    }

    // The blur sphere half of P_LookForPlayers: a body nobody can quite make
    // out is never spotted while it creeps at a distance, and even standing in
    // the open it is only noticed on a draw of SHADOW_SPOT_CHANCE or more —
    // which is what buys the player those few seconds of peace.
    _spotsShadow(m, dx, dz) {
        if (!DoomActorRef.isShadow(this._user)) {
            return true;
        }
        const sneakSpeed = WadConstants.SHADOW_SNEAK_SPEED * WadConstants.SCALE / WadConstants.SECONDS_PER_TIC;
        if ((Math.hypot(dx, dz) > (WadConstants.SHADOW_SNEAK_RANGE * WadConstants.SCALE))
            && (this._user.getRealVelocityXZ() < sneakSpeed)) {
            return false;
        }

        return (this._rng.next() >= WadConstants.SHADOW_SPOT_CHANCE);
    }

    // A_Chase (p_enemy.cpp A_DoChase) — and the order of its steps IS the
    // behaviour: countdowns, the 45° turn toward movedir, the target upkeep,
    // the "never twice in a row" guard, the melee then missile decisions, and
    // only then the walk. Deciding to attack before moving is what makes a
    // monster stop at arm's length instead of walking through you. Active/see
    // sounds are inert.
    _aChase(m, action) {
        // A_VileChase is A_Chase with a look for a corpse to raise first; the
        // vile only walks on when it finds none.
        if ((action === 'A_VileChase') && this._tryResurrect(m)) {
            return;
        }
        // Idle bark (vanilla rolls it at the end of A_Chase; the order only
        // shifts the shared random stream).
        if (this._rng.next() < WadConstants.MONSTER_ACTIVE_SOUND_CHANCE) {
            this.playMonsterSound(m, 'active');
        }
        if (m.reactiontime > 0) {
            m.reactiontime--;
        }
        if (m.threshold > 0) {
            if ((m.target === null) || DoomActorRef.isDead(m.target)) {
                m.threshold = 0;
            } else {
                m.threshold--;
            }
        }
        // A_Sor1Chase (dsparil.zs): the pain-armed boost eats 3 tics per call
        if ((action === 'A_Sor1Chase') && (m.special1 > 0)) {
            m.special1--;
            m.ticsLeft = Math.max(1, m.ticsLeft - 3);
        }
        // Heretic gameinfo nightmarefast (A_DoChase runtime block): EVERY
        // monster's chase cadence halves (floor 3 tics) under fastMonsters —
        // Doom does not set the flag, only its Fast states speed up.
        if (this._nightmareFast && (this._skillRule !== null) && (this._skillRule.fastMonsters === true) && (m.ticsLeft > 3)) {
            m.ticsLeft -= (m.ticsLeft / 2) | 0;
            if (m.ticsLeft < 3) {
                m.ticsLeft = 3;
            }
        }
        if (this._move !== null) {
            this._move.turnToward(m);
        }
        // Lost or dead target: rescan all around, else drop back to idle
        if ((m.target === null) || DoomActorRef.isDead(m.target)) {
            m.target = null;
            if (!this._lookForPlayer(m, true)) {
                this.enterState(m, 'spawn0');
                return;
            }
            m.target = this._user;
        }
        // "Do not attack twice in a row": a monster that just fired steps away
        // first — unless it is fast, which is half of what makes nightmare
        // relentless.
        if (m.justAttacked) {
            m.justAttacked = false;
            if (!this._isFast() && (this._move !== null)) {
                this._move.newChaseDir(m);
            }
            return;
        }
        if (this._tryAttack(m)) {
            return;
        }
        if (this._move !== null) {
            this._move.chaseMove(m);
        }
    }

    /**
     * The two attack decisions of A_DoChase, in order. A missile is only even
     * considered on the tic the walk count runs out — except for fast
     * monsters, which may fire while still on the move.
     *
     * @returns {boolean} true when the body left the chase for an attack state
     */
    _tryAttack(m) {
        if (this._attack === null) {
            return false;
        }
        // A bestiary that labels Melee and Missile on ONE block (the imp, the
        // undead warrior) has a melee state all the same: it is the missile
        // block, and the verb inside picks claw or fireball by range.
        const meleeKey = ((m.def.getState('melee0') !== null) ? 'melee0'
            : ((m.def.getParams().meleeInMissile === true) ? 'missile0' : null));
        if ((meleeKey !== null) && this._attack.checkMeleeRange(m)) {
            this.enterState(m, meleeKey);
            return true;
        }
        if (m.def.getState('missile0') === null) {
            return false;
        }
        if (!this._isFast() && (m.movecount > 0)) {
            return false;
        }
        if (!this._attack.decideMissileAttack(m)) {
            return false;
        }
        this.enterState(m, 'missile0');
        m.justAttacked = true;

        return true;
    }

    // isFast (p_mobj.cpp): the fastMonsters skill, which changes the chase
    // cadence, the missile speeds AND the aggressiveness of the gate above.
    _isFast() {
        return ((this._skillRule !== null) && (this._skillRule.fastMonsters === true));
    }

    /**
     * P_CheckForResurrection: the archvile looks at the square it is walking
     * into and puts back on its feet the first corpse lying there that owns a
     * Raise animation and has room to stand. A ground gib pool is past saving,
     * and so is a body something else already occupies.
     *
     * The raised monster joins the level total again (vanilla Revive does the
     * same), so killing it a second time keeps the ☠ ratio honest.
     *
     * @returns {boolean} true when one was raised
     */
    _tryResurrect(m) {
        if ((m.movedir === DoomMonsterMove.DI_NODIR) || (this._collision === null)) {
            return false;
        }
        const speed = m.def.getSpeed() * WadConstants.SCALE;
        const pos   = m.inst.getTransform().position;
        const tryX  = pos[0] + DoomMonsterMove.XSPEED[m.movedir] * speed;
        const tryZ  = pos[2] + DoomMonsterMove.YSPEED[m.movedir] * speed;

        for (const corpse of this._monsters) {
            if (!this._canRaise(corpse)) {
                continue;
            }
            const cpos    = corpse.inst.getTransform().position;
            const maxDist = (corpse.def.getRadius() * WadConstants.SCALE) + m.inst.getCollisionRadius();
            if ((Math.abs(cpos[0] - tryX) > maxDist) || (Math.abs(cpos[2] - tryZ) > maxDist)) {
                continue;
            }
            const radius = corpse.def.getRadius() * WadConstants.SCALE;
            const spot   = this._spotOccupancy(cpos[0], cpos[2], radius, corpse);
            if ((spot.blockers.length > 0) || spot.playerBlocks) {
                continue;
            }
            this._raise(corpse);
            if (this._attack !== null) {
                this._attack.faceTarget(m);
            }
            if (m.def.getState('heal0') !== null) {
                this.enterState(m, 'heal0');
            }

            return true;
        }

        return false;
    }

    // A_VileChase only raises a corpse that has FINISHED dying (vanilla
    // tics == -1): one still crumpling is skipped, and so is a ground gib pool.
    _canRaise(corpse) {
        return (corpse.dead && !corpse.crushedFlat && (corpse.ticsLeft === -1)
            && (corpse.def.getState('raise0') !== null));
    }

    // Revive (p_mobj.cpp): the body comes back whole, solid, with no target.
    _raise(corpse) {
        corpse.dead      = false;
        corpse.health    = corpse.def.getHealth();
        corpse.target    = null;
        corpse.threshold = 0;
        corpse.justHit   = false;
        corpse.velX      = 0;
        corpse.velZ      = 0;
        corpse.velY      = 0;
        if (this._collision !== null) {
            this._collision.addInstance(corpse.inst);
        }
        if (this._damage !== null) {
            this._damage.reviveCounted(corpse);
        }
        this.enterState(corpse, 'raise0');
    }

    // Whether a def can claw at all. Two monsters put their Melee and Missile
    // labels on ONE block (the Doom imp, the Heretic undead warrior): they do
    // own a melee attack, and P_CheckMissileRange must know it — without this
    // they would be treated as pure shooters and fire from much further out.
    hasMeleeState(def) {
        return ((def.getState('melee0') !== null) || (def.getParams().meleeInMissile === true));
    }

    // P_CheckSight from this monster's eye (feet + 3/4 actor height) to any
    // body — the player or another monster — behind the REJECT early-out when
    // the WAD carries the lump.
    checkSightTo(m, ref) {
        if ((this._sight === null) || (ref === null)) {
            return false;
        }
        const pos  = m.inst.getTransform().position;
        const eyeY = pos[1] + m.def.getHeight() * 0.75 * WadConstants.SCALE;
        const toSi = ((DoomActorRef.isPlayer(ref)) ? this._userSector() : ref.si);

        return this._sight.checkSight(pos[0], eyeY, pos[2], m.si, ref, toSi);
    }

    _checkSight(m) {
        return this.checkSightTo(m, this._user);
    }

    // Whether a body rests on its floor (vanilla mo->z == floorz) — the
    // maulotaur only calls its floor fire on a victim standing on the ground.
    standsOnFloor(ref) {
        if (this._collision === null) {
            return true;
        }
        const feet  = DoomActorRef.feetY(ref);
        const floor = this._collision.getFloor(DoomActorRef.x(ref), DoomActorRef.z(ref),
            DoomActorRef.radius(ref), feet + 0.01);

        return ((floor !== -Infinity) && ((feet - floor) <= WadConstants.ON_FLOOR_TOLERANCE));
    }

    _wake(m) {
        m.target = this._user;
        this.playMonsterSound(m, 'see');
        if (m.def.getState('see0') !== null) {
            this.enterState(m, 'see0');
        }
    }

    // Player sector, resolved at most once per tic (REJECT needs both ends).
    _userSector() {
        if (this._userSiTic !== this._ticCount) {
            this._userSi    = this._sectorIndexAt(this._user.x, this._user.z);
            this._userSiTic = this._ticCount;
        }
        return this._userSi;
    }

    // A_DropItem at the A_NoBlocking state: every dropItems entry rolls its
    // chance (x/256, default always) and materializes as a proximity pickup
    // at the body's feet — no toss (agreed simplification).
    _spawnDrops(m) {
        if ((this._drops === null) || (this._damage === null)) {
            return;
        }
        const pos = m.inst.getTransform().position;
        for (const d of m.def.getDropItems()) {
            const key = DoomMonsterSystem.dropKey(d);
            if (this._drops[key] === undefined) {
                continue;
            }
            if (!this._damage.rollChance(d.chance ?? 256)) {
                continue;
            }
            // A drop released on a moving floor rides it, like its owner did
            // (a clip left on a lift goes up and down with it). It inherits
            // the corpse's tracked sector, so both are lit alike.
            this._spawnDropAt(key, pos[0], pos[1], pos[2], m.inst.getRideOn(), m.si);
        }
    }

    _spawnDropAt(key, x, y, z, rideInstance, si) {
        const tpl = this._drops[key];
        if (tpl === undefined) {
            return;
        }
        const dropId = loader.instances().spawnFromData(null, {
            code:                  null,
            object:                tpl.objId,
            position:              [x, y, z],
            rotation:              [0, 0, 0],
            trigger:               'proximity',
            loop:                  false,
            onlyOnce:              false,
            collisionShape:        'none',
            interactionRadius:     WadConstants.PICKUP_RADIUS,
            interactionShape:      'cylinder',
            interactionReachBelow: WadConstants.PICKUP_REACH_BELOW,
            interactionReachAbove: WadConstants.PLAYER_HEIGHT,
            interaction:           tpl.code,
            keyframes:             []
        });
        const inst = loader.instances().get(dropId);
        if (rideInstance !== null) {
            inst.setRideOn(rideInstance);
        }
        const drop = {
            key:         key,
            inst:        inst,
            si:          si,
            crushed:     false,
            renderLight: null,
            litSi:       null,
            litBright:   false
        };
        this._view.pushLight(drop, false);
        this._droppedRecords.push(drop);
    }

    // Bodies in motion (P_XYMovement / P_ZMovement at 35 Hz): the blast thrust
    // and the environmental velocity (wind/conveyors, corpses drift too) slide
    // them against walls and other bodies under the sector friction, and
    // anything held above its floor falls — a floater's corpse drops, a body
    // shoved past a ledge follows it down.
    _integrateVelocity(m) {
        if (this._collision === null) {
            return;
        }
        const SCALE = WadConstants.SCALE;
        const pos   = m.inst.getTransform().position;
        const r     = m.inst.getCollisionRadius();
        // The ACTOR height (thing->height), not the displayed billboard's —
        // that one changes with every animation frame and rotation.
        const h     = m.def.getHeight() * SCALE;
        let   moved = false;

        // Per-tic displacement: knockback/skid velocity (map units/tic) plus
        // the environmental channel (m/s, integrated per frame)
        const envX = m.env.getVelX() * WadConstants.SECONDS_PER_TIC;
        const envZ = m.env.getVelZ() * WadConstants.SECONDS_PER_TIC;
        const dxM  = m.velX * SCALE + envX;
        const dzM  = m.velZ * SCALE + envZ;
        if ((dxM !== 0) || (dzM !== 0)) {
            // Vanilla P_TryMove: a shoved body climbs steps up to 24 units and
            // a move onto NO floor is refused outright (never through the
            // world) — the momentum dies against the obstacle.
            const step      = WadConstants.ACTOR_STEP_HEIGHT;
            const solved    = this._collision.resolveWall(pos[0], pos[2], dxM, dzM, r, pos[1], h, step, m.inst);
            const destFloor = this._collision.getFloor(solved.x, solved.z, r, pos[1] + step);
            // A LIVE skidding body obeys the P_TryMove vertical rules too
            // (ceiling fit, strict dropoff) — a corpse follows ledges down
            // (acted deviation).
            const slideOk = ((destFloor !== -Infinity)
                && (m.dead || (this._move === null) || this._move.slideOk(m, solved.x, solved.z, destFloor)));
            if (!slideOk) {
                m.velX = 0;
                m.velZ = 0;
            } else {
                const fromX = pos[0];
                const fromZ = pos[2];
                m.inst.translate(solved.x - pos[0], ((destFloor > pos[1]) ? destFloor - pos[1] : 0), solved.z - pos[2]);
                this._collision.syncBoxFor(m.inst);
                moved = true;
                // A momentum move is a real move (P_TryMove): the sector index
                // follows, and a LIVE skidding body still fires the special
                // lines it crosses (a blast-slid corpse crossing a teleport
                // stays put — refused deviation).
                const si = this._sectorIndexAt(solved.x, solved.z);
                if (si !== null) {
                    m.si = si;
                }
                if (!m.dead) {
                    this._crossLines(m, fromX, fromZ, solved.x, solved.z);
                }
                // The skid decay follows the ground: BOOM ice keeps more of
                // the momentum than the vanilla ORIG_FRICTION
                const keep = (m.env.getGroundFriction() ?? WadConstants.ORIG_FRICTION);
                m.velX *= keep;
                m.velZ *= keep;
                if (Math.hypot(m.velX, m.velZ) < DoomMonsterSystem.STOPSPEED) {
                    m.velX = 0;
                    m.velZ = 0;
                }
            }
        }

        // Gravity — a LIVE +NOGRAVITY body holds its altitude (a floater's
        // vertical life is the float logic, Commander Keen simply hangs from
        // his ceiling); everything else falls to its floor. A void below (no
        // floor at all) freezes the body instead of dropping it through the
        // world. Death clears the flag, like vanilla: a corpse always falls.
        if ((m.def.getFlags().noGravity === true) && !m.dead) {
            return;
        }
        const floorY = this._collision.getFloor(pos[0], pos[2], r, pos[1] + 0.01);
        if (floorY === -Infinity) {
            return;
        }
        if (pos[1] > floorY + 0.001) {
            m.velY -= 1;
            const dy = Math.max(m.velY * SCALE, floorY - pos[1]);
            m.inst.translate(0, dy, 0);
            this._collision.syncBoxFor(m.inst);
            moved = true;
        } else if (m.velY !== 0) {
            m.velY = 0;
            this._crashLanding(m);
        }

        // A body that moved re-resolves what it now stands on: grounded on a
        // mover it hooks to it (a corpse shoved onto a lift rides it, a rising
        // platform never swallows it), grounded on the static world it unhooks
        // (no ghost-riding the lift it was blasted off).
        if (moved) {
            this._resolveRide(m);
        }
    }

    // AActor::Crash: a corpse resting on its floor breaks open (the Heretic
    // gargoyle crumples in the air, then shatters on the ground) — the gibbed
    // variant when it was blown apart. Vanilla tests it on every tic a body
    // sits on the ground, not only on the tic it lands, so one killed where it
    // already stood shatters at once.
    _crashLanding(m) {
        if (!m.dead) {
            return;
        }
        // Cheapest test first: this runs for every corpse of every tic, and no
        // Doom monster has a crash state at all.
        const key = ((m.stateKey.startsWith('xdeath')) ? 'xcrash0' : 'crash0');
        if ((m.def.getState(key) === null) || m.stateKey.startsWith('crash') || m.stateKey.startsWith('xcrash')) {
            return;
        }
        this.enterState(m, key);
    }

    // P_ZMovement float: a live floater with a target closes the height gap
    // toward the target's feet + half its own height, by FLOATSPEED per tic,
    // once horizontally near enough (dist2D < 3×|delta|). Suspended while the
    // INFLOAT unstick owns the tic; clamped inside the local floor/ceiling.
    _floatToward(m) {
        if (m.dead || (m.def.getFlags().float !== true) || (m.target === null) || (m.inFloat === true)) {
            return;
        }
        const SCALE = WadConstants.SCALE;
        const pos   = m.inst.getTransform().position;
        const h     = m.def.getHeight() * SCALE;
        const dist  = DoomActorRef.distance2d(m, m.target);
        const delta = (DoomActorRef.feetY(m.target) + h * 0.5) - pos[1];
        let   dy    = 0;
        if ((delta < 0) && (dist < -delta * 3)) {
            dy = -WadConstants.ACTOR_FLOAT_SPEED;
        } else if ((delta > 0) && (dist < delta * 3)) {
            dy = WadConstants.ACTOR_FLOAT_SPEED;
        }
        if (dy === 0) {
            return;
        }
        const r      = m.inst.getCollisionRadius();
        const floorY = this._collision.getFloor(pos[0], pos[2], r, pos[1] + 0.01);
        const ceilY  = this._collision.getCeiling(pos[0], pos[2], r, pos[1] + h);
        let   newY   = pos[1] + dy;
        if (floorY !== -Infinity) {
            newY = Math.max(newY, floorY);
        }
        newY = Math.min(newY, ceilY - h);
        if (Math.abs(newY - pos[1]) < 1e-9) {
            return;
        }
        m.inst.translate(0, newY - pos[1], 0);
        this._collision.syncBoxFor(m.inst);
    }

    // P_CrossSpecialLine (monster side): a walk step that crosses a listed
    // line fires it — shared walk zones (4/10/88, W1 consumed for everyone)
    // and teleports (39/97 shared with the player, 125/126 monster-only).
    _crossLines(m, fromX, fromZ, toX, toZ) {
        const lines = (this._levelData.monsterLines ?? []);
        if (lines.length === 0) {
            return;
        }
        const S  = WadConstants.SCALE;
        const ax = fromX / S;
        const ay = fromZ / S;
        const bx = toX / S;
        const by = toZ / S;
        let teleported = false;
        for (const line of lines) {
            if (line.used) {
                continue;
            }
            if (!WadGeometry.segmentsCross(ax, ay, bx, by, line.x1, line.y1, line.x2, line.y2)) {
                continue;
            }
            if (line.kind === 'zone') {
                const zone = this._zoneInstance(line.zoneCode);
                if ((zone !== null) && zone.fireZoneTrigger() && line.once) {
                    line.used = true;
                }
                continue;
            }
            // Teleport: a W1 line is consumed by the attempt (vanilla clears
            // the special regardless of the EV_Teleport outcome, p_spec.c
            // case 39/125), for the player too when the zone is shared — and
            // a shared pad the PLAYER already consumed is spent for monsters
            // (lazy sync on the zone state).
            if (line.once) {
                const zone = this._zoneInstance(line.zoneCode);
                if ((zone !== null) && zone.isTriggerSpent()) {
                    line.used = true;
                    continue;
                }
                line.used = true;
                if (zone !== null) {
                    zone.stop();
                }
            }
            // EV_Teleport fires from the FRONT side only, so a body walking
            // off the landing pad is let out instead of bounced back. One
            // teleport per step: the segment is stale for the OTHER teleport
            // lines of the pad, but the zone lines it crossed still fire
            // (vanilla walks the whole spechit list).
            if (!teleported && (WadGeometry.pointOnLineSide(ax, ay, line.x1, line.y1, line.x2, line.y2) === 0)) {
                teleported = this._monsterTeleport(m, line.landing);
            }
        }
    }

    // EV_Teleport for a monster: an arrival spot held by any live body fails
    // silently, except on the maps whose profile allows a monster to stomp
    // (p_map.c PIT_StompThing). The teleported actor faces the landing angle
    // with all momentum cleared, and no reaction delay (the 18-tic freeze is
    // player-only).
    _monsterTeleport(m, landing) {
        const spot = this._spotOccupancy(landing.x, landing.z, m.inst.getCollisionRadius(), m);
        if ((spot.blockers.length > 0) || spot.playerBlocks) {
            if (this._levelData.monstersTelefrag !== true) {
                return false;
            }
            for (const other of spot.blockers) {
                this._damage.damage(other, WadConstants.TELEFRAG_DAMAGE, {});
            }
            if (spot.playerBlocks) {
                this._user.takeDamage(WadConstants.TELEFRAG_DAMAGE);
            }
        }
        // ONFLOORZ: the landing sector may be a mover — the floor is resolved
        // live from the sector ceiling, landing.y is only the build fallback.
        const floorY = this._collision.getFloor(landing.x, landing.z, m.inst.getCollisionRadius(), landing.topY);
        const destY  = ((floorY !== -Infinity) ? floorY : landing.y);
        const pos   = m.inst.getTransform().position;
        const fromX = pos[0];
        const fromY = pos[1];
        const fromZ = pos[2];
        m.inst.translate(landing.x - pos[0], destY - pos[1], landing.z - pos[2]);
        this._collision.syncBoxFor(m.inst);
        m.snapRender = true;
        m.facing     = WadGeometry.doomAngleYaw(landing.yaw);
        m.velX = 0;
        m.velZ = 0;
        m.velY = 0;
        m.env  = new ActorExternalForces();
        const si = this._sectorIndexAt(landing.x, landing.z);
        if (si !== null) {
            m.si = si;
        }
        this._resolveRide(m);
        this._view.refresh(m);
        // A def with its own teleport voice REPLACES the generic ring
        // (P_DSparilTeleport plays sorzap alone).
        const ownVoice = ((this._sounds[m.def.getCode()]?.teleport ?? null) !== null);
        if (this._effects !== null) {
            this._effects.spawnTeleportFogs(fromX, fromY, fromZ, landing.x, destY, landing.z, m.facing, ownVoice);
        }
        if (ownVoice) {
            this.playMonsterSound(m, 'teleport');
        }
        return true;
    }

    _zoneInstance(code) {
        if (code === null) {
            return null;
        }
        if (this._zoneCache[code] === undefined) {
            this._zoneCache[code] = loader.instances().getByCode(code);
        }
        return this._zoneCache[code];
    }

    _resolveRide(m) {
        const pos  = m.inst.getTransform().position;
        const info = this._collision.getFloorInfo(pos[0], pos[2], m.inst.getCollisionRadius(), pos[1] + 0.01);
        if ((info.y === -Infinity) || (pos[1] - info.y > 0.01)) {
            return;   // airborne — keep the current ride until it lands
        }
        if (info.instance !== null) {
            m.inst.setRideOn(info.instance);
        } else {
            m.inst.clearRide();
        }
    }

    /**
     * Closest live body crossed by a ray (see DoomMonsterTrace.ray) — the
     * entry point every shooting channel uses.
     *
     * @returns {{ref, dist, point}|null}
     */
    traceRay(ox, oy, oz, dx, dy, dz, maxDist, opts = {}) {
        return this._trace.ray(ox, oy, oz, dx, dy, dz, maxDist, opts);
    }

    /**
     * Closest live body along a horizontal bearing (see DoomMonsterTrace.aim).
     *
     * @returns {{record, dist}|null}
     */
    aimRay(ox, oz, dx, dz, maxDist) {
        return this._trace.aim(ox, oz, dx, dz, maxDist);
    }

    /**
     * The first live body standing on a spot (see DoomMonsterTrace.bodyAt).
     *
     * @returns {{ref, point}|null}
     */
    bodyAt(x, z, radius, opts = {}) {
        return this._trace.bodyAt(x, z, radius, opts);
    }
}

DoomMonsterSystem.MS_PER_TIC = 1000 / 35;

// Vanilla P_XYMovement stop threshold (0x1000/65536, map units/tic) — the
// decay/step/float numbers live in WadConstants (shared with the locomotion)
DoomMonsterSystem.STOPSPEED = 0.0625;
// Actor info reactiontime default (actor.zs)
DoomMonsterSystem.REACTION_TIME = 8;
// MELEERANGE (p_local.h): the point-blank window of P_LookForPlayers, where a
// monster notices a target standing behind it. NOT the melee reach — that one
// is MELEERANGE minus MELEEDELTA (WadConstants.ACTOR_MELEE_RANGE).
DoomMonsterSystem.MELEE_RANGE   = 64;
// P_NightmareRespawn rolls (p_mobj.c): P_Random() ≤ 4 every 32 tics, and the
// vanilla 18-tic reaction delay of the fresh actor
DoomMonsterSystem.RESPAWN_DICE     = 4;
DoomMonsterSystem.RESPAWN_REACTION = 18;
// Longest chain of zero-tic states enterState follows within one tic, so a
// transcription mistake loops out instead of hanging the frame.
DoomMonsterSystem.STATE_CHAIN_GUARD = 64;
// A_PainShootSkull: the spat body appears 8 units up and `4 + 1.5 × (both
// radii)` in front, clear of its parent.
DoomMonsterSystem.SPAWN_LIFT    = 8;
// A_PainShootSkull: an elemental with no headroom sinks by this much per try
DoomMonsterSystem.SPAWN_BLOCKED_SINK = 2;
DoomMonsterSystem.SPAWN_PRESTEP = 4;
// How a save names the player as somebody's target (no instance code carries it).
DoomMonsterSystem.PLAYER_TARGET_CODE = '@player';
// Chase verbs of phase C: plain A_Chase plus its sound-flavoured wrappers
// (their extras are sounds, inert here) and the serpent's accelerated chase.
DoomMonsterSystem.CHASE_ACTIONS = new Set(['A_Chase', 'A_VileChase', 'A_MinotaurChase', 'A_BabyMetal', 'A_Metal', 'A_Hoof', 'A_Sor1Chase']);
