/**
 * Monster locomotion (phase C): the vanilla A_Chase movement layer —
 * P_NewChaseDir / P_TryWalk / P_Move over the engine collision, with the
 * all-or-nothing P_TryMove semantics: walls and the other bodies' boxes
 * (any slide deviation = blocked), the player's cylinder, climb ≤ 24 units,
 * ceiling fit, and the STRICT dropoff refusal (no MBF avoidance — a walker
 * simply refuses to overhang a >24u drop; floaters and +DROPOFF actors are
 * exempt). One move covers `speed` map units per A_Chase call, so the See
 * state cadence IS the monster's pace, exactly like vanilla.
 *
 * Diagonals use the UZDoom LUT (sqrt(1/2) = 0.7071…); the vanilla
 * fixed-point table used 47000/65536 ≈ 0.7172 — negligible, noted variant.
 */
class DoomMonsterMove {
    /**
     * @param {Collision}  collision
     * @param {User}       user      blocks the walkers (and is the chase target)
     * @param {DoomRandom} rng       shared vanilla P_Random table
     * @param {object}     levelData DoomMonsterSystem level data (findSector)
     */
    constructor(collision, user, rng, levelData) {
        this._collision = collision;
        this._user      = user;
        this._rng       = rng;
        this._levelData = levelData;
        this._postMove  = null;
    }

    // Bookkeeping hook run after every successful step (ride re-resolution).
    setPostMove(callback) {
        this._postMove = callback;
        return this;
    }

    // A_Chase movement: walk the current direction, repick when the move
    // count expires or the step is blocked (`if (--movecount < 0 || !P_Move)`)
    chaseMove(m) {
        if ((--m.movecount < 0) || !this.move(m)) {
            this.newChaseDir(m);
        }
    }

    // A_Chase turn: the yaw snaps to its 45° grid and closes on movedir one
    // notch per call.
    turnToward(m) {
        if (m.movedir >= DoomMonsterMove.DI_NODIR) {
            return;
        }
        m.facing = Math.floor((((m.facing % 360) + 360) % 360) / 45) * 45;
        let delta = ((m.movedir * 45 - m.facing) % 360 + 360) % 360;
        if (delta > 180) {
            delta -= 360;
        }
        if (delta < 0) {
            m.facing -= 45;
        } else if (delta > 0) {
            m.facing += 45;
        }
        m.facing = ((m.facing % 360) + 360) % 360;
    }

    // P_Move: one all-or-nothing step of `speed` map units along movedir.
    // An airborne walker never walks (vanilla: z > floorz means no move).
    // On MBF ice the successful step feeds momentum instead of moving; a
    // blocked floater with vertical room unsticks by FLOATSPEED (MF_INFLOAT);
    // a walker bumping a usable manual door opens it (spechit use).
    move(m) {
        if (m.movedir === DoomMonsterMove.DI_NODIR) {
            return false;
        }
        const S       = WadConstants.SCALE;
        const pos     = m.inst.getTransform().position;
        const r       = m.inst.getCollisionRadius();
        const isFloat = (m.def.getFlags().float === true);
        if (!isFloat) {
            const floorY = this._collision.getFloor(pos[0], pos[2], r, pos[1] + 0.01);
            if ((floorY !== -Infinity) && (pos[1] > floorY + 0.001)) {
                return false;
            }
        }
        const speed = m.def.getSpeed() * S;
        const destX = pos[0] + DoomMonsterMove.XSPEED[m.movedir] * speed;
        const destZ = pos[2] + DoomMonsterMove.YSPEED[m.movedir] * speed;
        let   res   = this._tryMove(m, destX, destZ);
        if (!res.ok && isFloat && !res.floatok) {
            // Our ledges are riser WALLS, which hide the vanilla height-only
            // refusal (floatok): probe the destination heights without the
            // step cap — passable higher ground ahead lets the floater rise.
            const df = this._collision.getFloor(destX, destZ, r, Infinity);
            if ((df !== -Infinity) && (df > pos[1])) {
                const ce = this._collision.getCeiling(destX, destZ, r, df + 0.01);
                if ((ce - df >= m.def.getHeight() * S) && !this._blockedAboveLedge(m, pos, destX, destZ, df, r)) {
                    res = {ok: false, floor: df, floatok: true};
                }
            }
        }
        if (!res.ok) {
            if (isFloat && res.floatok) {
                // P_Move float unstick: rise/sink toward the passable band
                // and report the move as handled (MF_INFLOAT suspends the
                // toward-target float this tic).
                m.inst.translate(0, ((pos[1] < res.floor) ? WadConstants.ACTOR_FLOAT_SPEED : -WadConstants.ACTOR_FLOAT_SPEED), 0);
                this._collision.syncBoxFor(m.inst);
                m.inFloat = true;
                return true;
            }
            if (this._tryDoorUse(m, pos, r, speed)) {
                // Vanilla spechit use: the monster stands by (DI_NODIR) while
                // the door it just activated opens.
                m.movedir = DoomMonsterMove.DI_NODIR;
                return true;
            }
            return false;
        }
        m.inFloat = false;
        if (!isFloat && (m.env.getGroundFriction() !== null)) {
            // MBF ice (p_enemy.cpp: try_ok && friction > ORIG_FRICTION): the
            // step is undone and pushed into the velocity instead — the
            // monster skids, coasting under the sector friction.
            const push = DoomMonsterMove.frictionToMoveFactor(m.env.getGroundFriction()) / DoomMonsterMove.ORIG_FRICTION_FACTOR / 4;
            m.velX += DoomMonsterMove.XSPEED[m.movedir] * m.def.getSpeed() * push;
            m.velZ += DoomMonsterMove.YSPEED[m.movedir] * m.def.getSpeed() * push;
            return true;
        }
        // A walker sticks to its destination floor (up AND down steps); a
        // floater keeps its altitude — its vertical life is the float logic.
        const fromX = pos[0];
        const fromZ = pos[2];
        m.inst.translate(destX - pos[0], ((isFloat) ? 0 : res.floor - pos[1]), destZ - pos[2]);
        this._collision.syncBoxFor(m.inst);
        const sec = this._levelData.findSector(destX / S, destZ / S);
        if (sec !== null) {
            m.si = sec.si;
        }
        if (this._postMove !== null) {
            this._postMove(m, fromX, fromZ, destX, destZ);
        }
        return true;
    }

    // Tells a climbable ledge from an impassable band (ML_BLOCKING blocker
    // spanning the whole opening): a ray cast at the floater's would-be
    // altitude above the destination floor clears a real riser (top at that
    // floor, under the ray) but hits the band — no float-unstick then.
    _blockedAboveLedge(m, pos, destX, destZ, destFloorY, r) {
        const dx   = destX - pos[0];
        const dz   = destZ - pos[2];
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 1e-9) {
            return false;
        }
        const rayY = destFloorY + m.def.getHeight() * WadConstants.SCALE / 2;
        const hit  = this._collision.raycast(pos[0], rayY, pos[2], dx / dist, 0, dz / dist, dist + r, {includeShotPassable: true});
        return (hit !== null);
    }

    // P_NewChaseDir (Doom strict): direct diagonal first, then the axial
    // tries (swapped on rng > 200 or |dy| > |dx|), the old direction, a
    // random-order sweep of all eight, the turnaround last — else DI_NODIR.
    newChaseDir(m) {
        if (m.target === null) {
            m.movedir = DoomMonsterMove.DI_NODIR;
            return;
        }
        const S          = WadConstants.SCALE;
        const pos        = m.inst.getTransform().position;
        const deltax     = (m.target.x - pos[0]) / S;
        const deltay     = (m.target.z - pos[2]) / S;
        const olddir     = m.movedir;
        const turnaround = DoomMonsterMove.OPPOSITE[olddir];

        let d1 = ((deltax > 10) ? DoomMonsterMove.DI_EAST : ((deltax < -10) ? DoomMonsterMove.DI_WEST : DoomMonsterMove.DI_NODIR));
        let d2 = ((deltay < -10) ? DoomMonsterMove.DI_SOUTH : ((deltay > 10) ? DoomMonsterMove.DI_NORTH : DoomMonsterMove.DI_NODIR));

        if ((d1 !== DoomMonsterMove.DI_NODIR) && (d2 !== DoomMonsterMove.DI_NODIR)) {
            m.movedir = DoomMonsterMove.DIAGS[((deltay < 0) ? 2 : 0) + ((deltax > 0) ? 1 : 0)];
            if ((m.movedir !== turnaround) && this._tryWalk(m)) {
                return;
            }
        }
        if ((this._rng.next() > 200) || (Math.abs(deltay) > Math.abs(deltax))) {
            const swap = d1;
            d1 = d2;
            d2 = swap;
        }
        if (d1 === turnaround) {
            d1 = DoomMonsterMove.DI_NODIR;
        }
        if (d2 === turnaround) {
            d2 = DoomMonsterMove.DI_NODIR;
        }
        if (d1 !== DoomMonsterMove.DI_NODIR) {
            m.movedir = d1;
            if (this._tryWalk(m)) {
                return;
            }
        }
        if (d2 !== DoomMonsterMove.DI_NODIR) {
            m.movedir = d2;
            if (this._tryWalk(m)) {
                return;
            }
        }
        if (olddir !== DoomMonsterMove.DI_NODIR) {
            m.movedir = olddir;
            if (this._tryWalk(m)) {
                return;
            }
        }
        if ((this._rng.next() & 1) !== 0) {
            for (let dir = DoomMonsterMove.DI_EAST; dir <= DoomMonsterMove.DI_SOUTHEAST; dir++) {
                if (dir !== turnaround) {
                    m.movedir = dir;
                    if (this._tryWalk(m)) {
                        return;
                    }
                }
            }
        } else {
            for (let dir = DoomMonsterMove.DI_SOUTHEAST; dir >= DoomMonsterMove.DI_EAST; dir--) {
                if (dir !== turnaround) {
                    m.movedir = dir;
                    if (this._tryWalk(m)) {
                        return;
                    }
                }
            }
        }
        if (turnaround !== DoomMonsterMove.DI_NODIR) {
            m.movedir = turnaround;
            if (this._tryWalk(m)) {
                return;
            }
        }
        m.movedir = DoomMonsterMove.DI_NODIR;
    }

    // --- Internal ---

    // P_TryWalk: attempt the current movedir, arm the random move count on
    // success (0-15 calls before the next direction repick).
    _tryWalk(m) {
        if (!this.move(m)) {
            return false;
        }
        m.movecount = (this._rng.next() & 15);
        return true;
    }

    // P_TryMove all-or-nothing checks → {ok, floor, floatok}. floatok is the
    // vanilla "the spot is passable at SOME height" flag: walls and capacity
    // fine, only the step/headroom failed — a floater unsticks vertically.
    _tryMove(m, destX, destZ) {
        const S       = WadConstants.SCALE;
        const pos     = m.inst.getTransform().position;
        const r       = m.inst.getCollisionRadius();
        const h       = m.def.getHeight() * S;
        const step    = WadConstants.ACTOR_STEP_HEIGHT;
        const refused = {ok: false, floor: -Infinity, floatok: false};

        // Walls and the other bodies' boxes: the slide resolver in test mode —
        // a real obstruction deviates the solved point by centimetres, so it
        // reads as "blocked" (vanilla monster moves never slide). The contact
        // TOLERANCE absorbs the ~2e-5 depenetration of a body brushing a wall:
        // vanilla P_TryMove tests the destination POSITION and lets a grazing
        // step through.
        const solved = this._collision.resolveWall(pos[0], pos[2], destX - pos[0], destZ - pos[2], r, pos[1], h, step, m.inst);
        if ((Math.abs(solved.x - destX) > DoomMonsterMove.CONTACT_EPSILON) || (Math.abs(solved.z - destZ) > DoomMonsterMove.CONTACT_EPSILON)) {
            return refused;
        }

        const destFloor = this._collision.getFloor(destX, destZ, r, pos[1] + step);
        if (destFloor === -Infinity) {
            return refused;
        }
        const isFloat = (m.def.getFlags().float === true);
        const ceil    = this._collision.getCeiling(destX, destZ, r, destFloor + 0.01);
        if (ceil - destFloor < h) {
            return refused;
        }
        const floatok = {ok: false, floor: destFloor, floatok: true};
        if (destFloor - pos[1] > step + 1e-9) {
            return floatok;
        }
        if (isFloat && (ceil - pos[1] < h)) {
            return floatok;
        }
        if (!this._dropoffOk(m, destX, destZ, destFloor, isFloat)) {
            return refused;
        }

        // The player blocks like any body (PIT_CheckThing square overlap,
        // with the engine's vertical-span gate).
        const u = this._user;
        if (WadGeometry.boxesOverlap2d(destX, destZ, r, u.x, u.z, u.getRadius())) {
            const feet = ((isFloat) ? pos[1] : destFloor);
            if ((u.y < feet + h) && (u.y + u.getCurrentHeight() > feet)) {
                return refused;
            }
        }

        return {ok: true, floor: destFloor, floatok: true};
    }

    // Strict dropoff (P_TryMove): the destination box must not overhang a
    // drop deeper than one step (floaters and +DROPOFF actors are exempt).
    // A corner over the void counts as a bottomless drop. Shared by the walk
    // step and the live momentum slides.
    _dropoffOk(m, destX, destZ, destFloor, isFloat) {
        if (isFloat || (m.def.getFlags().dropOff === true)) {
            return true;
        }
        const r    = m.inst.getCollisionRadius();
        const step = WadConstants.ACTOR_STEP_HEIGHT;
        const capY = m.inst.getTransform().position[1] + step;
        let lowest = destFloor;
        for (const c of [[destX - r, destZ - r], [destX + r, destZ - r], [destX - r, destZ + r], [destX + r, destZ + r]]) {
            const fy = this._collision.getFloor(c[0], c[1], 0.01, capY);
            if (fy === -Infinity) {
                return false;
            }
            lowest = Math.min(lowest, fy);
        }
        return (destFloor - lowest <= step + 1e-9);
    }

    // Vertical legality of a LIVE body's momentum slide (P_TryMove: ceiling
    // fit + strict dropoff). Corpses skip it — the acted deviation lets a
    // blast-slid body follow a ledge down.
    slideOk(m, destX, destZ, destFloor) {
        const isFloat = (m.def.getFlags().float === true);
        const h       = m.def.getHeight() * WadConstants.SCALE;
        const base    = ((isFloat) ? m.inst.getTransform().position[1] : destFloor);
        const ceil    = this._collision.getCeiling(destX, destZ, m.inst.getCollisionRadius(), base + 0.01);
        if (ceil - base < h) {
            return false;
        }
        return this._dropoffOk(m, destX, destZ, destFloor, isFloat);
    }

    // Manual-door use on a blocked step (P_Move spechit): probe what blocks
    // the path at mid-height; a dynamic collider owned by a monster-usable
    // door instance gets start()ed (idempotent — reopening while moving is a
    // no-op). The usable set holds the vanilla P_UseSpecialLine whitelist net
    // effect: plain repeatable keyless manual doors (special 1).
    _tryDoorUse(m, pos, r, speed) {
        const doors = this._usableDoors();
        if (doors.size === 0) {
            return false;
        }
        const h   = m.def.getHeight() * WadConstants.SCALE;
        const dx  = DoomMonsterMove.XSPEED[m.movedir];
        const dz  = DoomMonsterMove.YSPEED[m.movedir];
        const hit = this._collision.raycast(pos[0], pos[1] + h * 0.5, pos[2], dx, 0, dz, r + speed + 0.05, {dynamic: true});
        if ((hit === null) || (hit.tri.instance === undefined) || (hit.tri.instance === null)) {
            return false;
        }
        if (!doors.has(hit.tri.instance)) {
            return false;
        }
        hit.tri.instance.start();
        return true;
    }

    _usableDoors() {
        if (this._usableDoorSet === undefined) {
            this._usableDoorSet = new Set();
            for (const si of Object.keys(this._levelData.moverCodes)) {
                const entry = this._levelData.moverCodes[si];
                if ((entry.kind === 'door') && (entry.monsterUse === true)) {
                    this._usableDoorSet.add(loader.instances().getByCode(entry.code));
                }
            }
        }
        return this._usableDoorSet;
    }

    // BOOM FrictionToMoveFactor (p_map.cpp), friction as the per-tic keep
    // factor (ice ≥ ORIG_FRICTION; the mud branch kept for completeness).
    static frictionToMoveFactor(friction) {
        let movefactor;
        if (friction >= WadConstants.ORIG_FRICTION) {
            movefactor = (((0x10092 - friction * 65536) * 1024) / 4352 + 568) / 65536;
        } else {
            movefactor = (((friction * 65536 - 0xDB34) * 0xA) / 0x80) / 65536;
        }
        return Math.max(movefactor, 1 / 2048);
    }
}

// Vanilla dirtype_t order (EAST counter-clockwise to SOUTHEAST) + DI_NODIR
DoomMonsterMove.DI_EAST      = 0;
DoomMonsterMove.DI_NORTHEAST = 1;
DoomMonsterMove.DI_NORTH     = 2;
DoomMonsterMove.DI_NORTHWEST = 3;
DoomMonsterMove.DI_WEST      = 4;
DoomMonsterMove.DI_SOUTHWEST = 5;
DoomMonsterMove.DI_SOUTH     = 6;
DoomMonsterMove.DI_SOUTHEAST = 7;
DoomMonsterMove.DI_NODIR     = 8;
DoomMonsterMove.OPPOSITE     = [4, 5, 6, 7, 0, 1, 2, 3, 8];
DoomMonsterMove.DIAGS        = [3, 1, 5, 7];
// Doom world mapping keeps atan2(dz, dx) = the Doom angle, so the vanilla
// xspeed/yspeed tables apply to worldX/worldZ directly (SQRTHALF LUT).
DoomMonsterMove.SQRTHALF     = 0.7071075439453125;
DoomMonsterMove.XSPEED       = [1, 0.7071075439453125, 0, -0.7071075439453125, -1, -0.7071075439453125, 0, 0.7071075439453125];
DoomMonsterMove.YSPEED       = [0, 0.7071075439453125, 1, 0.7071075439453125, 0, -0.7071075439453125, -1, -0.7071075439453125];
// BOOM ORIG_FRICTION_FACTOR (2048/65536) — the normal-ground move factor
DoomMonsterMove.ORIG_FRICTION_FACTOR = 2048 / 65536;
// Wall-graze tolerance of the all-or-nothing step test (metres)
DoomMonsterMove.CONTACT_EPSILON      = 0.005;
