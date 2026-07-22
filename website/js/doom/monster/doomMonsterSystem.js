/**
 * Runtime monster driver. Phase A scope: monsters are inert bodies — this
 * system only advances their Spawn-state animation at 35 Hz and picks the
 * rotation view matching the camera position (vanilla R_ProjectSprite: the
 * world angle monster→viewer minus the monster's facing selects one of the
 * 8 octants; rotation 1 faces the viewer).
 *
 * Records are added DURING the loading batch (the world builder) with their
 * engine instance: the entity exists as soon as loadFromData registers it —
 * only its object resolution waits for finalizeInit, which this system never
 * needs before its first update.
 */
class DoomMonsterSystem {
    constructor() {
        this._monsters  = [];
        this._user      = null;
        this._collision = null;
        this._damage    = null;
        this._drops     = null;
        this._timeAcc   = 0;
    }

    /**
     * @param {object} record {code, inst (engine Instance), def,
     *                         facing (Doom degrees), flags,
     *                         frames: {letter → [objId ×1|×8]}}
     */
    add(record) {
        this._monsters.push({
            code:     record.code,
            inst:     record.inst,
            def:      record.def,
            facing:   record.facing,
            flags:    record.flags,
            frames:   record.frames,
            health:   record.def.getHealth(),
            dead:     false,
            velX:     0,
            velZ:     0,
            velY:     0,
            stateKey: 'spawn0',
            ticsLeft: record.def.getState('spawn0').getTics(),
            shownObj: null
        });
        return this;
    }

    setWorld(collision, user) {
        this._collision = collision;
        this._user      = user;
        return this;
    }

    // Catalog key of one dropItems entry — shared with the world builder,
    // which prepares the pickup templates under the same key.
    static dropKey(d) {
        return (d.item + '|' + (d.amount ?? ''));
    }

    setDamageModule(damageModule) {
        this._damage = damageModule;
        return this;
    }

    // Drop pickup templates prepared in the batch by the world builder,
    // keyed 'item|amount' (an interaction cannot register at runtime).
    setDrops(catalog) {
        this._drops = catalog;
        return this;
    }

    getMonsters() {
        return this._monsters;
    }

    update(dt) {
        if (this._user === null) {
            return;
        }
        this._timeAcc += dt;
        while (this._timeAcc >= DoomMonsterSystem.MS_PER_TIC) {
            this._timeAcc -= DoomMonsterSystem.MS_PER_TIC;
            this._stepTic();
        }
    }

    _stepTic() {
        const kept = [];
        for (const m of this._monsters) {
            this._integrateVelocity(m);
            // A live rider's box blocker follows its lift (the ride sync moves
            // the body outside this system) — corpses have no box anymore.
            if (!m.dead && (this._collision !== null) && (m.inst.getRideOn() !== null)) {
                this._collision.syncBoxFor(m.inst);
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

            this._refreshView(m);
            kept.push(m);
        }
        this._monsters = kept;
    }

    // Switch a monster to a new state and run its entry action — the game
    // verbs that matter while monsters cannot act yet (a whitelist; sounds and
    // AI actions are inert). A chase target ('see…') falls back to the idle
    // group until phase C brings the walking machinery.
    enterState(m, key) {
        if (key.startsWith('see')) {
            key = 'spawn0';
        }
        m.stateKey = key;
        m.ticsLeft = m.def.getState(key).getTics();
        this._dispatchAction(m, m.def.getState(key).getAction());
        this._refreshView(m);
    }

    _dispatchAction(m, action) {
        if (action === 'A_NoBlocking') {
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

    // A_DropItem at the A_NoBlocking state: every dropItems entry rolls its
    // chance (x/256, default always) and materializes as a proximity pickup
    // at the body's feet — no toss (agreed simplification).
    _spawnDrops(m) {
        if ((this._drops === null) || (this._damage === null)) {
            return;
        }
        const pos = m.inst.getTransform().position;
        for (const d of m.def.getDropItems()) {
            const tpl = this._drops[DoomMonsterSystem.dropKey(d)];
            if (tpl === undefined) {
                continue;
            }
            if (!this._damage.rollChance(d.chance ?? 256)) {
                continue;
            }
            const dropId = loader.instances().spawnFromData(null, {
                code:              null,
                object:            tpl.objId,
                position:          [pos[0], pos[1], pos[2]],
                rotation:          [0, 0, 0],
                trigger:           'proximity',
                loop:              false,
                onlyOnce:          false,
                collisionShape:    'none',
                interactionRadius: WadConstants.PICKUP_RADIUS,
                interaction:       tpl.code,
                keyframes:         []
            });
            // A drop released on a moving floor rides it, like its owner did
            // (a clip left on a lift goes up and down with it).
            if (m.inst.getRideOn() !== null) {
                loader.instances().get(dropId).setRideOn(m.inst.getRideOn());
            }
        }
    }

    // Bodies in motion (P_XYMovement / P_ZMovement at 35 Hz): the blast thrust
    // slides them against walls and other bodies under the vanilla friction,
    // and anything held above its floor falls — a floater's corpse drops, a
    // body shoved past a ledge follows it down.
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

        if ((m.velX !== 0) || (m.velZ !== 0)) {
            // Vanilla P_TryMove: a shoved body climbs steps up to 24 units and
            // a move onto NO floor is refused outright (never through the
            // world) — the momentum dies against the obstacle.
            const step      = DoomMonsterSystem.STEP_HEIGHT;
            const solved    = this._collision.resolveWall(pos[0], pos[2], m.velX * SCALE, m.velZ * SCALE, r, pos[1], h, step, m.inst);
            const destFloor = this._collision.getFloor(solved.x, solved.z, r, pos[1] + step);
            if (destFloor === -Infinity) {
                m.velX = 0;
                m.velZ = 0;
            } else {
                m.inst.translate(solved.x - pos[0], ((destFloor > pos[1]) ? destFloor - pos[1] : 0), solved.z - pos[2]);
                this._collision.syncBoxFor(m.inst);
                moved = true;
                m.velX *= DoomMonsterSystem.FRICTION;
                m.velZ *= DoomMonsterSystem.FRICTION;
                if (Math.hypot(m.velX, m.velZ) < DoomMonsterSystem.STOPSPEED) {
                    m.velX = 0;
                    m.velZ = 0;
                }
            }
        }

        // Gravity — a LIVE floater hovers (its own lift, until phase C flies
        // it); everything else falls to its floor. A void below (no floor at
        // all) freezes the body instead of dropping it through the world.
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
// Vanilla P_XYMovement numbers (map units/tic): ORIG_FRICTION per-tic decay,
// motion zeroed under STOPSPEED (0x1000/65536), gravity 1 unit/tic².
DoomMonsterSystem.FRICTION    = 0.90625;
DoomMonsterSystem.STOPSPEED   = 0.0625;
DoomMonsterSystem.STEP_HEIGHT = 24 * WadConstants.SCALE;
