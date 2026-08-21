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
        this._drops         = null;
        this._bossDeath     = null;
        this._levelData     = null;
        this._sight         = null;
        this._move          = null;
        this._rng           = null;
        this._skillRule     = null;
        this._nightmareFast = false;
        this._timeAcc       = 0;
        this._ticCount      = 0;
        this._userSi        = null;
        this._userSiTic     = -1;
        this._respawnQueue  = [];
        this._zoneCache     = {};
        this._clockMs       = 0;
        // Dropped pickups spawned at runtime ({key, inst}): they carry no
        // instance code, so a save must re-spawn them explicitly.
        this._droppedRecords = [];
        this._pressure       = new DoomMoverPressure();
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
            code:         record.code,
            inst:         record.inst,
            def:          record.def,
            facing:       record.facing,
            flags:        record.flags,
            frames:       record.frames,
            si:           (record.si ?? null),
            spawn:        (record.spawn ?? null),
            health:       record.def.getHealth(),
            dead:         false,
            velX:         0,
            velZ:         0,
            velY:         0,
            target:       null,
            threshold:    0,
            reactiontime: ((instant) ? 0 : DoomMonsterSystem.REACTION_TIME),
            movedir:      DoomMonsterMove.DI_NODIR,
            movecount:    0,
            special1:     0,
            renderLight:  null,   // last factor pushed to the instance (null = never)
            litSi:        null,   // sector and bright flag the light was resolved for
            litBright:    false,
            inFloat:      false,
            respawnClock: 0,
            noKillCount:  false,
            crushedFlat:  false,
            blend:        null,
            snapRender:   false,
            walkStepped:  false,
            env:          new ActorExternalForces(),
            stateKey:     'spawn0',
            ticsLeft:     record.def.getState('spawn0').getTics(),
            shownObj:     null
        });
        return this;
    }

    setWorld(collision, user) {
        this._collision = collision;
        this._user      = user;
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
            this._sight = new DoomMonsterSight(this._collision, this._levelData);
        }
        this._pressure.setSight(this._sight).setCollision(this._collision);
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
        this._pressure.setMovers(data.moverCodes);
        this._wireModules();
        // First lighting of the bodies already added: their views are baked
        // fullbright, so none may reach a draw unlit.
        for (const m of this._monsters) {
            this._applyRenderLight(m);
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

    countAliveOfDef(def) {
        return this._monsters.filter((m) => ((m.def === def) && !m.dead)).length;
    }

    getMonsters() {
        return this._monsters;
    }

    /**
     * Plain-data snapshot of every record (live and corpses) plus the dropped
     * pickups still on the ground, restorable by importState after a
     * deterministic level rebuild. The environmental channel and the render
     * smoothing are transient and not exported.
     */
    exportState() {
        const monsters = this._monsters.map((m) => this._exportRecord(m));
        const drops    = [];
        for (const drop of this._droppedRecords) {
            if (this._isDropGone(drop)) {
                continue;   // picked up since it fell
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
            monsters: monsters,
            drops:    drops,
            // Consumed walk/teleport lines of the monsters (deterministic
            // build order) — owned here, where they are crossed.
            lines:    (this._levelData.monsterLines ?? []).map((line) => line.used),
            crushStalled: this._pressure.exportStalled(),
        };
    }

    /**
     * Counterpart of exportState, applied on the freshly rebuilt records:
     * a build monster absent from the save is despawned (lost soul faded,
     * exploded barrel), a present one is patched in place, and the nightmare
     * respawns ('_r' codes) are recreated from their base record's def/frames.
     */
    importState(data) {
        const rebuilt = new Map(this._monsters.map((m) => [m.code, m]));
        const saved   = new Map(data.monsters.map((rec) => [rec.code, rec]));

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

        for (const rec of data.monsters) {
            if (rebuilt.has(rec.code)) {
                continue;
            }
            const proto = rebuilt.get(rec.code.replace(/(_r)+$/, ''));
            if (proto !== undefined) {
                this._restoreRecord(this._spawnFreshBody(proto, rec.code, rec.position), rec);
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
    }

    _exportRecord(m) {
        const pos = m.inst.getTransform().position;

        return {
            code:           m.code,
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
            targetIsPlayer: (m.target !== null),
            threshold:      m.threshold,
            reactiontime:   m.reactiontime,
            movedir:        m.movedir,
            movecount:      m.movecount,
            special1:       m.special1,
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
        m.target       = ((rec.targetIsPlayer === true) ? this._user : null);
        m.threshold    = rec.threshold;
        m.reactiontime = rec.reactiontime;
        m.movedir      = rec.movedir;
        m.movecount    = rec.movecount;
        m.special1     = rec.special1;
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
        this._refreshView(m);
        this._applyRenderLight(m);

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
            this._applyRenderBlend(m);
            this._applyRenderLight(m);
        }
        this._refreshDropLight();
    }

    // A drop never moves sector, so _pushRenderLight only recomputes while its
    // sector runs a light effect. Picked-up drops leave a despawned instance
    // behind: purge their records here.
    _refreshDropLight() {
        for (let i = this._droppedRecords.length - 1; i >= 0; i--) {
            const drop = this._droppedRecords[i];
            if (this._isDropGone(drop)) {
                this._droppedRecords.splice(i, 1);
                continue;
            }
            this._pushRenderLight(drop, false);
        }
    }

    // Picked up: DoomPickupInteraction scheduled the instance's removal.
    // Identity-checked so a reused id can never pass for the drop.
    _isDropGone(drop) {
        return (loader.instances().get(drop.inst.getId()) !== drop.inst);
    }

    // Light of the sector the body CURRENTLY stands in, times that sector's
    // live effect: a monster leaving a dark room brightens, one entering a
    // strobing room pulses with it. A bright state (zscript Bright — the lost
    // soul burns in the dark) stays fullbright.
    //
    // Only recomputed on an event that can change the answer — the body changed
    // sector, its state switched fullbright, or its sector runs a light effect.
    // A body standing still in a steadily-lit room is lit once and never again.
    _applyRenderLight(m) {
        this._pushRenderLight(m, m.def.getState(m.stateKey).isBright());
    }

    // Shared by monster and drop records ({inst, si, renderLight, litSi,
    // litBright}) — both views are baked fullbright, the instance carries
    // the sector lighting.
    _pushRenderLight(rec, bright) {
        if ((rec.renderLight !== null) && (rec.litSi === rec.si) && (rec.litBright === bright)
            && !this._hasLightEffect(rec.si)) {
            return;
        }
        rec.litSi     = rec.si;
        rec.litBright = bright;
        const wanted = ((bright) ? 1 : this._sectorLight(rec.si));
        if (wanted !== rec.renderLight) {
            rec.renderLight = wanted;
            rec.inst.setRenderLight(wanted);
        }
    }

    // True when the sector runs one of the vanilla light thinkers, so its
    // brightness moves on its own and its bodies must follow every frame.
    _hasLightEffect(si) {
        return ((si !== null) && (this._levelData !== null) && this._levelData.hasLightEffect(si));
    }

    // Sector brightness as a 0..1 factor; full light when the sector is unknown.
    _sectorLight(si) {
        if ((si === null) || (this._levelData === null) || (this._levelData.sectors[si] === undefined)) {
            return 1;
        }
        return (this._levelData.sectors[si].light / 255) * this._levelData.lightFactorOf(si);
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

    // Arm the render glide after a tic that moved the body: from its previous
    // spot, over the current state's duration for a walking step (the next
    // A_Chase step lands right when the glide ends — continuous motion) or a
    // single tic for momentum slides. A teleport snaps instead.
    _armRenderBlend(m, fromX, fromY, fromZ) {
        if (m.snapRender) {
            m.snapRender = false;
            m.blend      = null;
            m.inst.clearRenderOffset();
            return;
        }
        const p = m.inst.getTransform().position;
        if ((Math.abs(p[0] - fromX) < 1e-9) && (Math.abs(p[1] - fromY) < 1e-9) && (Math.abs(p[2] - fromZ) < 1e-9)) {
            return;
        }
        // Only a REAL walk step glides over the state duration; a momentum
        // slide (knockback, drift) smooths over its own single tic — a shove
        // mid-chase must not rubber-band across the whole See state.
        const durTics = ((m.walkStepped) ? Math.max(1, m.ticsLeft) : 1);
        m.blend = {fx: fromX, fy: fromY, fz: fromZ, t0: this._clockMs, dur: durTics * DoomMonsterSystem.MS_PER_TIC};
    }

    // Render smoothing (user decision, GZDoom-like): the logical body moves
    // by teleport-steps at 35 Hz, the DISPLAYED body glides from the previous
    // spot to the current one — vertically too, so stair steps flow like the
    // player's camera smoothing. Only the render offset moves, never the
    // physics.
    _applyRenderBlend(m) {
        if (m.blend === null) {
            return;
        }
        const k = (this._clockMs - m.blend.t0) / m.blend.dur;
        if (k >= 1) {
            m.inst.clearRenderOffset();
            m.blend = null;
            return;
        }
        const p = m.inst.getTransform().position;
        m.inst.setRenderOffset(
            (m.blend.fx - p[0]) * (1 - k),
            (m.blend.fy - p[1]) * (1 - k),
            (m.blend.fz - p[2]) * (1 - k)
        );
    }

    _stepTic() {
        this._ticCount++;
        this._pressure.pressureTic(this._monsters, this._ticCount);
        const kept = [];
        for (const m of this._monsters) {
            const before   = m.inst.getTransform().position;
            const beforeX  = before[0];
            const beforeY  = before[1];
            const beforeZ  = before[2];
            m.walkStepped  = false;
            this._floatToward(m);
            this._integrateVelocity(m);
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

            this._armRenderBlend(m, beforeX, beforeY, beforeZ);
            this._refreshView(m);
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
    // respawn (any occupancy refuses) and the monster teleport (MAP30 stomps).
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
        this._applyRenderLight(fresh);
    }

    // Fresh runtime body sharing an existing record's def/frames/spawn — the
    // nightmare respawn and the save restore of a respawned monster. Runtime
    // bodies never feed the ☠ counter (their build original already did).
    _spawnFreshBody(proto, code, position) {
        const idle0  = proto.def.getState('spawn0');
        const instId = loader.instances().spawnFromData(null, {
            code:            null,
            object:          proto.frames[DoomMonsterDef.viewKey(idle0.getSprite(), idle0.getFrame())][0],
            position:        [position[0], position[1], position[2]],
            rotation:        [0, 0, 0],
            trigger:         'none',
            loop:            false,
            onlyOnce:        false,
            collisionShape:  'box',
            collisionRadius: proto.inst.getCollisionRadius(),
            keyframes:       []
        });
        const inst = loader.instances().get(instId);
        this.add({
            code:   code,
            inst:   inst,
            def:    proto.def,
            facing: proto.spawn.facing,
            flags:  proto.spawn.flags,
            frames: proto.frames,
            si:     proto.spawn.si,
            spawn:  proto.spawn
        });
        const fresh = this._monsters[this._monsters.length - 1];
        fresh.noKillCount = true;
        if (this._collision !== null) {
            this._collision.addInstance(inst);
        }

        return fresh;
    }

    // Switch a monster to a new state and run its entry action — the game
    // verbs implemented so far (a whitelist; sounds stay inert). Under the
    // fastMonsters skill, a state carrying the zscript Fast keyword halves
    // its duration on entry (GetTics: tics − (tics>>1) — Doom demon/spectre).
    enterState(m, key) {
        m.stateKey = key;
        m.ticsLeft = m.def.getState(key).getTics();
        if ((m.ticsLeft > 0) && m.def.getState(key).isFast()
            && (this._skillRule !== null) && (this._skillRule.fastMonsters === true)) {
            m.ticsLeft = m.ticsLeft - (m.ticsLeft >> 1);
        }
        this._dispatchAction(m, m.def.getState(key).getAction());
        this._refreshView(m);
    }

    _dispatchAction(m, action) {
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
        if (action === 'A_BossDeath') {
            if (this._bossDeath !== null) {
                this._bossDeath.onDeath(m.def);
            }
            return;
        }
        // The Heretic imp unblocks through its own death verbs (hereticimp.zs
        // A_ImpDeath / A_ImpXDeath1: bSolid = false) — same effect as
        // A_NoBlocking, without which a dead gargoyle still blocks the player.
        if ((action === 'A_NoBlocking') || (action === 'A_ImpDeath') || (action === 'A_ImpXDeath1')) {
            if (this._collision !== null) {
                this._collision.removeBoxFor(m.inst);
            }
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
                this._damage.radiusAttack(at[0], at[1], at[2], explode.damage, explode.distance, {exclude: m});
            }
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
            let diff = (((Math.atan2(dz, dx) * 180 / Math.PI - m.facing) % 360) + 360) % 360;
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
        return this._checkSight(m);
    }

    // A_Chase (p_enemy.cpp A_DoChase, movement scope of phase C): reaction
    // and threshold countdowns, the 45° turn toward movedir, the target
    // upkeep, then the walk step. The melee/missile checks live HERE in
    // vanilla — stubbed until phase D. Active/see sounds are inert.
    _aChase(m, action) {
        if (m.reactiontime > 0) {
            m.reactiontime--;
        }
        if (m.threshold > 0) {
            if ((m.target === null) || m.target.isDead()) {
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
        if ((m.target === null) || m.target.isDead()) {
            m.target = null;
            if (!this._lookForPlayer(m, true)) {
                this.enterState(m, 'spawn0');
                return;
            }
            m.target = this._user;
        }
        // [phase D] P_CheckMeleeRange / P_CheckMissileRange hook in here.
        if (this._move !== null) {
            this._move.chaseMove(m);
        }
    }

    // P_CheckSight from this monster's eye (feet + 3/4 actor height) to the
    // player, behind the REJECT early-out when the WAD carries the lump.
    _checkSight(m) {
        if (this._sight === null) {
            return false;
        }
        const pos  = m.inst.getTransform().position;
        const eyeY = pos[1] + m.def.getHeight() * 0.75 * WadConstants.SCALE;
        return this._sight.checkSight(pos[0], eyeY, pos[2], m.si, this._user, this._userSector());
    }

    _wake(m) {
        m.target = this._user;
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
            code:              null,
            object:            tpl.objId,
            position:          [x, y, z],
            rotation:          [0, 0, 0],
            trigger:           'proximity',
            loop:              false,
            onlyOnce:          false,
            collisionShape:    'none',
            interactionRadius: WadConstants.PICKUP_RADIUS,
            interaction:       tpl.code,
            keyframes:         []
        });
        const inst = loader.instances().get(dropId);
        if (rideInstance !== null) {
            inst.setRideOn(rideInstance);
        }
        const drop = {
            key:         key,
            inst:        inst,
            si:          si,
            renderLight: null,
            litSi:       null,
            litBright:   false
        };
        this._pushRenderLight(drop, false);
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

        // Gravity — a LIVE floater holds its altitude here (its vertical life
        // is the float logic); everything else falls to its floor. A void
        // below (no floor at all) freezes the body instead of dropping it
        // through the world.
        if ((m.def.getFlags().float === true) && !m.dead) {
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
        }

        // A body that moved re-resolves what it now stands on: grounded on a
        // mover it hooks to it (a corpse shoved onto a lift rides it, a rising
        // platform never swallows it), grounded on the static world it unhooks
        // (no ghost-riding the lift it was blasted off).
        if (moved) {
            this._resolveRide(m);
        }
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
        const dist  = Math.hypot(m.target.x - pos[0], m.target.z - pos[2]);
        const delta = (m.target.y + h * 0.5) - pos[1];
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
            // off the landing pad is let out instead of bounced back.
            if (WadGeometry.pointOnLineSide(ax, ay, line.x1, line.y1, line.x2, line.y2) === 0) {
                this._monsterTeleport(m, line.landing);
            }
        }
    }

    // EV_Teleport for a monster: an arrival spot held by any live body fails
    // silently — the telefrag only exists on MAP30 (p_map.c PIT_StompThing).
    // The teleported actor faces the landing angle with all momentum cleared,
    // and no reaction delay (the 18-tic freeze is player-only).
    _monsterTeleport(m, landing) {
        const spot = this._spotOccupancy(landing.x, landing.z, m.inst.getCollisionRadius(), m);
        if ((spot.blockers.length > 0) || spot.playerBlocks) {
            if (this._levelData.levelName !== 'MAP30') {
                return;
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
        const pos = m.inst.getTransform().position;
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
        this._refreshView(m);
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

    _refreshView(m) {
        // A ground corpse shows the gibs pool whatever its state machine says
        // (it keeps running to its terminal frame for the nightmare respawn).
        if (m.crushedFlat) {
            return;
        }
        const state = m.def.getState(m.stateKey);
        const views = m.frames[DoomMonsterDef.viewKey(state.getSprite(), state.getFrame())];
        if (views === undefined) {
            return;
        }
        const objId = ((views.length === 1) ? views[0] : views[this._rotationOctant(m)]);
        if (objId !== m.shownObj) {
            m.inst.setObject(objId);
            m.shownObj = objId;
        }
    }

    // Octant of the view angle: world runs on worldX = doomX / worldZ = +doomY,
    // so atan2(dz, dx) IS the Doom angle. (angleToViewer − facing + 22.5°) / 45
    // is the thing→viewer form of the vanilla viewer→thing +202.5° formula.
    _rotationOctant(m) {
        const pos = m.inst.getTransform().position;
        const angleToViewer = Math.atan2(this._user.z - pos[2], this._user.x - pos[0]) * 180 / Math.PI;
        return Math.floor(((((angleToViewer - m.facing + 22.5) % 360) + 360) % 360) / 45);
    }

    // First LIVE body crossed by a ray (normalized direction): each monster is
    // a vertical cylinder — the 2D circle of its collision radius over the
    // [feet, feet + actor height] span (thing->height from the def, never the
    // displayed billboard's — that one pulses with the animation). Returns
    // {record, dist, point} of the closest hit, or null; the engine raycast
    // never sees these bodies, so the caller compares dist with its wall hit.
    traceRay(ox, oy, oz, dx, dy, dz, maxDist) {
        let best = null;
        for (const m of this._monsters) {
            if (m.dead) {
                continue;
            }
            const pos = m.inst.getTransform().position;
            const t   = this._rayCylinder(ox, oy, oz, dx, dy, dz, pos[0], pos[2], m.inst.getCollisionRadius(), pos[1], pos[1] + m.def.getHeight() * WadConstants.SCALE);
            if ((t !== null) && (t <= maxDist) && ((best === null) || (t < best.dist))) {
                best = {record: m, dist: t, point: [ox + dx * t, oy + dy * t, oz + dz * t]};
            }
        }
        return best;
    }

    // A_BFGSpray-style aim: closest LIVE body whose XZ circle crosses the
    // HORIZONTAL ray within maxDist — the vertical axis is ignored, like the
    // slope search of P_AimLineAttack, which finds a target above or below
    // the eye plane. The caller settles visibility with its own LOS check.
    aimRay(ox, oz, dx, dz, maxDist) {
        let best = null;
        for (const m of this._monsters) {
            if (m.dead) {
                continue;
            }
            const pos = m.inst.getTransform().position;
            const t   = this._rayCircle(ox, oz, dx, dz, pos[0], pos[2], m.inst.getCollisionRadius());
            if ((t !== null) && (t <= maxDist) && ((best === null) || (t < best.dist))) {
                best = {record: m, dist: t};
            }
        }
        return best;
    }

    // Ray parameter against one 2D circle (entry point, clamped to the origin
    // when it starts inside), or null when the ray misses or leaves it behind.
    _rayCircle(ox, oz, dx, dz, cx, cz, r) {
        const ex   = ox - cx;
        const ez   = oz - cz;
        const a    = dx * dx + dz * dz;
        const b    = 2 * (ex * dx + ez * dz);
        const c    = ex * ex + ez * ez - r * r;
        const disc = b * b - 4 * a * c;
        if (disc < 0) {
            return null;
        }
        const sq = Math.sqrt(disc);
        return ((((-b + sq) / (2 * a)) >= 0) ? Math.max(0, (-b - sq) / (2 * a)) : null);
    }

    // Ray parameter against one vertical cylinder, or null. Solved on the XZ
    // circle (the quadratic keeps the 3D ray parameter since the direction is
    // 3D-normalized), then gated on the vertical span — with a cap crossing
    // when the ray enters above the head or below the feet and dives into it.
    _rayCylinder(ox, oy, oz, dx, dy, dz, cx, cz, r, yBottom, yTop) {
        const ex = ox - cx;
        const ez = oz - cz;
        const a  = dx * dx + dz * dz;
        if (a < 1e-9) {
            // Straight vertical shot: hit only when already over the body.
            if ((ex * ex + ez * ez) > r * r) {
                return null;
            }
            const tCap = (((dy > 0) ? yBottom : yTop) - oy) / dy;
            return ((tCap >= 0) ? tCap : null);
        }
        const b    = 2 * (ex * dx + ez * dz);
        const c    = ex * ex + ez * ez - r * r;
        const disc = b * b - 4 * a * c;
        if (disc < 0) {
            return null;
        }
        const sq    = Math.sqrt(disc);
        const tNear = Math.max(0, (-b - sq) / (2 * a));
        const tFar  = (-b + sq) / (2 * a);
        if (tFar < 0) {
            return null;
        }
        const yNear = oy + dy * tNear;
        if ((yNear >= yBottom) && (yNear <= yTop)) {
            return tNear;
        }
        if (dy === 0) {
            return null;
        }
        // Entering above the head (or below the feet): the ray may still dive
        // onto the matching cap while inside the circle.
        const tCap = (((yNear > yTop) ? yTop : yBottom) - oy) / dy;
        return (((tCap >= tNear) && (tCap <= tFar) && (tCap >= 0)) ? tCap : null);
    }
}

DoomMonsterSystem.MS_PER_TIC = 1000 / 35;
// Vanilla P_XYMovement stop threshold (0x1000/65536, map units/tic) — the
// decay/step/float numbers live in WadConstants (shared with the locomotion)
DoomMonsterSystem.STOPSPEED = 0.0625;
// Actor info reactiontime default (actor.zs) and MELEERANGE (p_local.h), map units
DoomMonsterSystem.REACTION_TIME = 8;
DoomMonsterSystem.MELEE_RANGE   = 64;
// P_NightmareRespawn rolls (p_mobj.c): P_Random() ≤ 4 every 32 tics, and the
// vanilla 18-tic reaction delay of the fresh actor
DoomMonsterSystem.RESPAWN_DICE     = 4;
DoomMonsterSystem.RESPAWN_REACTION = 18;
// Chase verbs of phase C: plain A_Chase plus its sound-flavoured wrappers
// (their extras are sounds, inert here) and the serpent's accelerated chase.
DoomMonsterSystem.CHASE_ACTIONS = new Set(['A_Chase', 'A_VileChase', 'A_MinotaurChase', 'A_BabyMetal', 'A_Metal', 'A_Hoof', 'A_Sor1Chase']);
