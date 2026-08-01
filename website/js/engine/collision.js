class Collision {
    constructor() {
        this._static      = []; // [{floors, ceilings, walls, grids}] — grids index the three lists
        this._dynamic     = []; // [{instance, localTris, bRadius, centerLocal, floors, ceilings, walls, centerWorld, _platformDeltaApplied}]
        this._boxes       = []; // [{cx, cz, half, yBottom, yTop}] — static Doom-style square decoration blockers
        this._prevUserPos = null; // player position at the end of the previous pressure pass
        this._tfDelta     = {dx: 0, dy: 0, dz: 0, dRy: 0}; // scratch of _transformDelta
        // Candidate buffers of the spatial queries, one per family so a query
        // that gathers two kinds in a row (the pinch predicate: floors then
        // ceilings) never overwrites the set it is still scanning.
        this._floorScratch = [];
        this._ceilScratch  = [];
        this._wallScratch  = [];
        this._rayScratch   = [];
        this._floorHit     = {y: -Infinity, n: null, tri: null}; // scratch of _scanFloors
    }

    // --- Public setup ---

    addMap(object3d) {
        this._static.push(this._buildStaticCollider(object3d));
    }

    addInstance(instance) {
        if (!instance.isCollidable()) {
            return;
        }

        // Doom-style square blocker (decorations, bodies): a static
        // axis-aligned box centred on the thing point, with a vertical
        // interval derived from the sprite body. Not updated per frame — a
        // box that moves or dies must be pushed back through syncBoxFor /
        // removeBoxFor by its owner.
        if (instance.getCollisionShape() === 'box') {
            const box = {instance: instance, cx: 0, cz: 0, half: 0, yBottom: 0, yTop: 0};
            this._refreshBox(box);
            this._boxes.push(box);
            return;
        }

        const obj = instance.getObject();
        const localTris = [];
        for (const fc of obj.faceList) {
            if (fc.passableUser) {
                continue;
            }
            const A = obj.ptOrigin[fc.pts[0]], B = obj.ptOrigin[fc.pts[1]], C = obj.ptOrigin[fc.pts[2]];
            localTris.push([[A[0],A[1],A[2]], [B[0],B[1],B[2]], [C[0],C[1],C[2]]]);
        }
        const dc = {
            instance,
            localTris,
            bRadius:               obj.getBoundingRadius(),
            centerLocal:           obj.getCenter(),
            floors: [], ceilings: [], walls: [],
            centerWorld:           [0, 0, 0],
            _platformDeltaApplied: null,
        };
        this._dynamic.push(dc);
        this._updateDynamicCollider(dc);
    }

    updateDynamicColliders() {
        for (const dc of this._dynamic) {
            this._updateDynamicCollider(dc);
        }
    }

    // Re-read a box blocker's position/interval from its instance (owner moved it).
    syncBoxFor(instance) {
        for (const box of this._boxes) {
            if (box.instance === instance) {
                this._refreshBox(box);
                return;
            }
        }
    }

    // Whether an instance still owns a box blocker (a restored corpse must
    // know if its unblocking already happened).
    hasBoxFor(instance) {
        return this._boxes.some((box) => (box.instance === instance));
    }

    // Drop an instance's box blocker (its body stopped blocking). Safe against
    // an absent box (already removed, or never a box collider).
    removeBoxFor(instance) {
        for (let i = 0; i < this._boxes.length; i++) {
            if (this._boxes[i].instance === instance) {
                this._boxes.splice(i, 1);
                return;
            }
        }
    }

    _refreshBox(box) {
        const inst = box.instance;
        const pos  = inst.getPosition();
        const cyW  = inst.getWorldCenter()[1];
        const h    = inst.getObject().getHeight();
        box.cx      = pos[0];
        box.cz      = pos[2];
        box.half    = inst.getCollisionRadius();
        box.yBottom = cyW - h / 2;
        box.yTop    = cyW + h / 2;
    }

    // --- Queries ---

    getFloor(px, pz, r, maxSearchY = Infinity) {
        return this._findFloor(px, pz, r, maxSearchY, Collision.DYN_NEAR).y;
    }

    getFloorNormal(px, pz, r, maxSearchY = Infinity) {
        return this._findFloor(px, pz, r, maxSearchY, Collision.DYN_NEAR).n;
    }

    // Floor height plus the instance OWNING the winning triangle (null for the
    // static world) — lets a body standing there follow a moving floor.
    getFloorInfo(px, pz, r, maxSearchY = Infinity) {
        const found = this._findFloor(px, pz, r, maxSearchY, Collision.DYN_NEAR);
        return {y: found.y, instance: (found.tri ? (found.tri.instance ?? null) : null)};
    }

    getCeiling(px, pz, r, headY) {
        return this._findCeiling(px, pz, r, headY, Collision.DYN_NEAR);
    }

    // Nearest triangle hit by the ray (origin, unit direction), within maxDist.
    // Walls are always tested; floors/ceilings/dynamic movers are opt-in via
    // opts, and shot-passable faces (movement-only blockers) join in with
    // opts.includeShotPassable. Returns {point, dist, normal, tri} or null.
    // dist is in world units (the direction must be normalised).
    raycast(ox, oy, oz, dx, dy, dz, maxDist = Infinity, opts = {}) {
        const tris  = this._rayScratch;
        const count = this._gatherRay(ox, oz, dx, dz, maxDist, tris, opts);
        let best  = null;
        let bestT = maxDist;
        for (let i = 0; i < count; i++) {
            const tri = tris[i];
            if (tri.passableShot && (opts.includeShotPassable !== true)) {
                continue;
            }
            const denom = tri.n[0]*dx + tri.n[1]*dy + tri.n[2]*dz;
            if (Math.abs(denom) < 1e-10) {
                continue;
            }
            const t = (tri.d - (tri.n[0]*ox + tri.n[1]*oy + tri.n[2]*oz)) / denom;
            if (t < 0 || t > bestT) {
                continue;
            }
            const px = ox + t*dx, py = oy + t*dy, pz = oz + t*dz;
            // Broadphase: reject on the triangle AABB (6 compares) before the
            // costly point-in-triangle test. Matters for multi-ray shots
            // (the super shotgun casts 20 rays through every wall).
            if (px < tri.xMin || px > tri.xMax
                || py < tri.yMin || py > tri.yMax
                || pz < tri.zMin || pz > tri.zMax) {
                continue;
            }
            if (!this._pointInTri(px, py, pz, tri)) {
                continue;
            }
            bestT = t;
            best  = { point: [px, py, pz], dist: t, normal: tri.n, tri };
        }
        return best;
    }

    // Candidate triangles of a ray, appended into `out`; returns how many. The
    // static indexes are walked cell by cell along the ray (a shot crossing a
    // level touches a handful of cells, where its bounding box would cover a
    // large part of it); the dynamic movers stay linear. Walls always, floors
    // and ceilings opt-in, static before dynamic.
    _gatherRay(ox, oz, dx, dz, maxDist, out, opts) {
        let n = 0;
        for (const sc of this._static) {
            n = sc.grids.walls.queryRay(ox, oz, dx, dz, maxDist, out, n);
            if (opts.floors) {
                n = sc.grids.floors.queryRay(ox, oz, dx, dz, maxDist, out, n);
            }
            if (opts.ceilings) {
                n = sc.grids.ceilings.queryRay(ox, oz, dx, dz, maxDist, out, n);
            }
        }
        if (opts.dynamic !== true) {
            return n;
        }
        for (const dc of this._dynamic) {
            n = Collision._append(dc.walls, out, n);
            if (opts.floors) {
                n = Collision._append(dc.floors, out, n);
            }
            if (opts.ceilings) {
                n = Collision._append(dc.ceilings, out, n);
            }
        }
        return n;
    }

    // ignoreBoxOf: a moving box body resolves against everything BUT its own
    // blocker (which sits at its own centre and would pin it in place).
    resolveWall(cx, cz, vx, vz, r, feetY, h, stepHeight = 0, ignoreBoxOf = null) {
        const tris = this._wallScratch;
        let count  = this._gatherWalls(cx, cz, vx, vz, r, tris, true);
        const res   = this._resolveWallFrom(cx, cz, vx, vz, r, feetY, h, tris, count, stepHeight);
        const boxed = this._resolveBoxes(res.x, res.z, r, feetY, h, ignoreBoxOf);

        const ejectX = boxed.x - res.x;
        const ejectZ = boxed.z - res.z;
        if ((ejectX === 0) && (ejectZ === 0)) {
            return boxed;
        }
        // The box ejection is a displacement like any other, so it goes through
        // the wall resolution too. Left as a raw teleport it can cross a wall:
        // it pushes along the axis of least penetration, by up to
        // boxRadius + bodyRadius, and a body pinned against a wall by a monster
        // walking into it gets shoved straight to the other side (the next
        // frame's depenetration then keeps it there, since the far side has
        // become the nearest one). Resolving it makes the body slide ALONG the
        // wall instead, which is what being squeezed should feel like. Any
        // overlap the wall prevents us from clearing is left for the following
        // frames — resolving once here keeps this bounded.
        count = this._gatherWalls(res.x, res.z, ejectX, ejectZ, r, tris, true);
        return this._resolveWallFrom(res.x, res.z, ejectX, ejectZ, r, feetY, h, tris, count, stepHeight);
    }

    // Doom-style square blockers: push the player cylinder out of any overlapping
    // decoration box along the axis of least penetration (which preserves the
    // tangential motion → sliding along faces). Purely 2D + a vertical gate
    // (feet/head vs box bottom/top), no sqrt. A few passes settle corners/multi-box.
    _resolveBoxes(x, z, r, feetY, h, ignoreBoxOf = null) {
        if (this._boxes.length === 0) {
            return { x, z };
        }
        const headY = feetY + h;
        for (let pass = 0; pass < 3; pass++) {
            let moved = false;
            for (const b of this._boxes) {
                if (b.instance === ignoreBoxOf) {
                    continue;
                }
                if (feetY >= b.yTop || headY <= b.yBottom) {
                    continue;
                }
                const sum = b.half + r;
                const ox  = sum - Math.abs(x - b.cx);
                const oz  = sum - Math.abs(z - b.cz);
                if (ox <= 0 || oz <= 0) {
                    continue;
                }
                moved = true;
                if (ox < oz) {
                    x += ((x >= b.cx) ? ox : -ox);
                    continue;
                }
                z += ((z >= b.cz) ? oz : -oz);
            }
            if (!moved) {
                break;
            }
        }
        return { x, z };
    }

    // --- Platform riding & object blocking ---

    applyPlatformRiding(user) {
        for (const dc of this._dynamic) {
            dc._platformDeltaApplied = null;
            if (!dc.instance.isCollidable()) {
                continue;
            }
            const prevTf = dc.instance.getPreviousTransform();
            if (!prevTf) {
                continue;
            }
            const {dx, dy, dz, dRy} = this._transformDelta(dc.instance.getTransform(), prevTf);

            if (Math.abs(dx) < 1e-8 && Math.abs(dy) < 1e-8 && Math.abs(dz) < 1e-8 && Math.abs(dRy) < 1e-8) {
                continue;
            }

            // Is player standing on top of this instance?
            const floorY = this._scanFloors(user.x, user.z, user.getRadius(), Infinity, dc.floors, dc.floors.length).y;
            if (floorY === -Infinity || Math.abs(user.y - floorY) > 0.15) {
                continue;
            }

            const origX = user.x, origY = user.y, origZ = user.z;

            // Step 1: polar rotation — orbit user around previous platform center by dRy
            const prevCx = prevTf.position[0] + prevTf.deltaTranslate[0];
            const prevCz = prevTf.position[2] + prevTf.deltaTranslate[2];
            const relX   = user.x - prevCx;
            const relZ   = user.z - prevCz;
            const r      = Math.sqrt(relX*relX + relZ*relZ);
            const newAng = Math.atan2(relZ, relX) - dRy * DEG_TO_RAD;
            const rotX   = prevCx + r * Math.cos(newAng);
            const rotZ   = prevCz + r * Math.sin(newAng);
            const res1   = this._resolveStaticWalls(user, rotX - user.x, rotZ - user.z);
            user.x = res1.x; user.z = res1.z;

            // Step 2: platform translation drift (dx, dz)
            const res2 = this._resolveStaticWalls(user, dx, dz);
            user.x = res2.x; user.z = res2.z;

            // Y: clamp against static geometry so the player detaches when the platform
            // passes through a floor (descending) or a ceiling (ascending).
            const newY = user.y + dy;
            if (dy < 0) {
                const staticFloor = this._getStaticFloor(user.x, user.z, user.getRadius());
                user.y = ((staticFloor !== -Infinity) ? Math.max(newY, staticFloor) : newY);
            } else if (dy > 0) {
                const staticCeil = this._getStaticCeiling(user.x, user.z, user.getRadius(), user.y + user.getCurrentHeight());
                user.y = Math.min(newY, staticCeil - user.getCurrentHeight());
            } else {
                user.y = newY;
            }

            user.yaw += dRy;
            user.syncPositionTracking();

            dc._platformDeltaApplied = {x: user.x - origX, y: user.y - origY, z: user.z - origZ, yaw: dRy};
        }
    }

    // Step 5b — mover-caused pressure ('stall'/'reverse'), resolved BEFORE the
    // riding and the player's own movement: the mover is rolled back (and
    // possibly reversed) while the player has not moved yet, so his movement
    // resolution never sees the mover's advanced (overlapping) pose.
    resolveMoverPressure(user) {
        for (const dc of this._dynamic) {
            if (!dc.instance.isCollidable()) {
                continue;
            }
            if (dc.instance.getBlockedBehavior() === 'crush') {
                continue;
            }
            this._resolveSolidPressure(user, dc, dc.instance.getPreviousTransform());
        }
        this._prevUserPos = {x: user.x, y: user.y, z: user.z};
    }

    // Step 8 — after riding and the player's movement: crush pressure (the
    // pinch depends on the player's final position) and the riding leftovers
    // of solid movers (a platform push that squeezed the player into one —
    // original behaviour, the mover's own move was already handled at 5b).
    resolveObjectPlayerBlockage(user) {
        for (const dc of this._dynamic) {
            if (!dc.instance.isCollidable()) {
                continue;
            }
            const prev = dc.instance.getPreviousTransform();
            if (dc.instance.getBlockedBehavior() === 'crush') {
                this._resolveCrushPressure(user, dc, prev);
                continue;
            }
            if (!this._instanceCylinderIntersects(user, dc)) {
                continue;
            }
            if (prev) {
                if (this._instanceCylinderIntersectsAtTransform(user, dc, prev)) {
                    continue;
                }
                dc.instance.rollbackTransform(prev);
                this._updateDynamicCollider(dc);
            }
            if (dc._platformDeltaApplied) {
                user.x   -= dc._platformDeltaApplied.x;
                user.y   -= dc._platformDeltaApplied.y;
                user.z   -= dc._platformDeltaApplied.z;
                user.yaw += dc._platformDeltaApplied.yaw;
                dc._platformDeltaApplied = null;
            }
        }
    }

    // Crush mover: no rollback. Pinch predicate (local floor/ceiling gap vs
    // player height — vanilla PIT_ChangeSector) instead of the cylinder/walls
    // test: a crush floor presses a player standing ON its top faces. The
    // pressure engages only when caused by the mover's own movement, then
    // lasts while the pinch does (a player trapped under a stopped crusher
    // stays in pressure, so the mover stays passable and he can always leave);
    // damage only ticks while the mover actually moves (EV_CeilingCrushStop).
    _resolveCrushPressure(user, dc, prev) {
        const inst = dc.instance;
        if (!this._userPinchedBy(user, dc)) {
            inst.setBlockedPressing(false);
            return;
        }
        const moved = ((prev !== null) && this._moverMovedSince(dc, prev));
        if ((inst.isBlockedPressing() === false) && (moved === false)) {
            return;
        }
        inst.setBlockedPressing(true);
        inst.setCrushActive(moved);
        // The crusher moves through the squeezed player: keep his head under
        // the static ceiling (the body sinks into the mover while the damage
        // does its work) — vanilla clips the body, it NEVER ejects it above
        // the map. Safe here: crush movers are never rolled back.
        const staticCeil = this._getStaticCeiling(user.x, user.z, user.getRadius(), user.y);
        if (staticCeil !== Infinity) {
            user.y = Math.min(user.y, staticCeil - user.getCurrentHeight());
        }
    }

    // Solid mover ('stall'/'reverse'): rollback when its movement causes the
    // overlap. The pre-existing-overlap guard is split into its real cases:
    // standing on top (riding artifact), mover at rest, overlap created by
    // the PLAYER's own move this frame (resolveWall's job) — anything else is
    // a chronic entrapment (missed frame) and the mover is stalled anyway
    // instead of walking through the player.
    _resolveSolidPressure(user, dc, prev) {
        const inst = dc.instance;
        if (!this._broadphaseXZ(user.x, user.z, user.getRadius(), dc)) {
            inst.setBlockedPressing(false);
            return;
        }
        if (this._standsOnInstance(user, dc)) {
            // Rider. Normal ride is the riding's job (step 6, the ride is not
            // applied yet at 5b) — but a rider squeezed between this mover's
            // rising floor and a ceiling IS a pressure (T_PlatRaise crushed):
            // the walls/ceilings cylinder test is blind to it (they are all
            // below his feet), hence the pinch predicate.
            if (!this._userPinchedBy(user, dc)) {
                inst.setBlockedPressing(false);
                return;
            }
            if ((prev === null) || (this._moverFrameDeltaY(dc, prev) <= 1e-8)) {
                return;   // not rising this frame (wait/descent): nothing to undo
            }
        } else {
            if (!this._instanceCylinderIntersects(user, dc)) {
                inst.setBlockedPressing(false);
                return;
            }
            if (prev === null) {
                return;
            }
            if (this._instanceCylinderIntersectsAtTransform(user, dc, prev)) {
                // Chronic-entrapment rescue: only for a mover coming DOWN onto
                // the player — a rising one is moving away (an opening door
                // overlapped by a wedged player must keep opening and free him).
                if (this._moverFrameDeltaY(dc, prev) >= -1e-8) {
                    return;
                }
                if ((this._prevUserPos === null)
                    || !this._cylinderIntersectsAtTransform(this._prevUserPos.x, this._prevUserPos.y,
                            this._prevUserPos.z, user.getRadius(), user.getCurrentHeight(), dc, prev)) {
                    return;
                }
            }
        }
        inst.rollbackTransform(prev);
        this._updateDynamicCollider(dc);
        inst.setBlockedPressing(true);
        if (inst.getBlockedBehavior() === 'reverse') {
            inst.reverseBlocked();
        }
    }

    // Local vertical gap at the player's position vs his height (the vanilla
    // "thing does not fit" of PIT_ChangeSector). Unfiltered lists on purpose:
    // the pressing (passable) mover itself must keep counting in the gap.
    _userPinchedBy(user, dc) {
        if (!this._broadphaseXZ(user.x, user.z, user.getRadius(), dc)) {
            return false;
        }
        const r = user.getRadius();
        // 0.15 above the feet: at 5b the ride is not applied yet, the mover's
        // top may be up to a frame of travel above them (same tolerance as
        // the standing test).
        const floorY = this._findFloor(user.x, user.z, r, user.y + 0.15, Collision.DYN_ALL).y;
        if (floorY === -Infinity) {
            return false;
        }
        const ceilY = this._findCeiling(user.x, user.z, r, floorY + 0.001, Collision.DYN_ALL);
        return ((ceilY - floorY) < (user.getCurrentHeight() - 1e-4));
    }

    // Same standing test as applyPlatformRiding (feet on the top faces)
    _standsOnInstance(user, dc) {
        const floorY = this._scanFloors(user.x, user.z, user.getRadius(), Infinity, dc.floors, dc.floors.length).y;
        return ((floorY !== -Infinity) && (Math.abs(user.y - floorY) <= 0.15));
    }

    // Frame delta of a mover between two transforms (shared scratch object)
    _transformDelta(cur, prev) {
        const d = this._tfDelta;
        d.dx  = (cur.position[0] + cur.deltaTranslate[0]) - (prev.position[0] + prev.deltaTranslate[0]);
        d.dy  = (cur.position[1] + cur.deltaTranslate[1]) - (prev.position[1] + prev.deltaTranslate[1]);
        d.dz  = (cur.position[2] + cur.deltaTranslate[2]) - (prev.position[2] + prev.deltaTranslate[2]);
        d.dRy = (cur.rotation[1] + cur.deltaRotate[1]) - (prev.rotation[1] + prev.deltaRotate[1]);
        return d;
    }

    _moverMovedSince(dc, prev) {
        const d = this._transformDelta(dc.instance.getTransform(), prev);
        return (Math.abs(d.dx) >= 1e-8 || Math.abs(d.dy) >= 1e-8 || Math.abs(d.dz) >= 1e-8 || Math.abs(d.dRy) >= 1e-8);
    }

    _moverFrameDeltaY(dc, prev) {
        return this._transformDelta(dc.instance.getTransform(), prev).dy;
    }

    // --- Private: collider builders ---

    _buildStaticCollider(obj) {
        const floors = [], ceilings = [], walls = [];
        for (const fc of obj.faceList) {
            if (fc.passableUser) {
                continue;
            }
            const A = obj.ptOrigin[fc.pts[0]], B = obj.ptOrigin[fc.pts[1]], C = obj.ptOrigin[fc.pts[2]];
            const tri = this._makeTri([A[0],A[1],A[2]], [B[0],B[1],B[2]], [C[0],C[1],C[2]]);
            if (!tri) {
                continue;
            }
            tri.passableShot = (fc.passableShot === true);
            this._classifyTri(tri, floors, ceilings, walls);
        }
        // Static geometry never moves, so it is indexed once here: without it
        // every query would scan the whole level (a floor lookup on a mid-size
        // map tests a few thousand triangles to keep three).
        const grids = {
            floors:   new SpatialGrid(floors),
            ceilings: new SpatialGrid(ceilings),
            walls:    new SpatialGrid(walls),
        };
        return { floors, ceilings, walls, grids };
    }

    _classifyTri(tri, floors, ceilings, walls) {
        if (tri.n[1] > 0.7) {
            floors.push(tri);
        } else if (tri.n[1] < -0.7) {
            ceilings.push(tri);
        } else {
            walls.push(tri);
        }
    }

    _makeTri(A, B, C) {
        const abx = B[0]-A[0], aby = B[1]-A[1], abz = B[2]-A[2];
        const acx = C[0]-A[0], acy = C[1]-A[1], acz = C[2]-A[2];
        let nx = aby*acz - abz*acy;
        let ny = abz*acx - abx*acz;
        let nz = abx*acy - aby*acx;
        const len = Math.sqrt(nx*nx + ny*ny + nz*nz);
        if (len < 1e-10) {
            return null;
        }
        nx /= len; ny /= len; nz /= len;
        return {
            pts: [A, B, C],
            n:   [nx, ny, nz],
            d:   nx*A[0] + ny*A[1] + nz*A[2],
            xMin: Math.min(A[0],B[0],C[0]), xMax: Math.max(A[0],B[0],C[0]),
            yMin: Math.min(A[1],B[1],C[1]), yMax: Math.max(A[1],B[1],C[1]),
            zMin: Math.min(A[2],B[2],C[2]), zMax: Math.max(A[2],B[2],C[2]),
        };
    }

    _updateDynamicCollider(dc) {
        const tf  = dc.instance.getTransform();
        const m   = Matrix.composeInstanceTransform(tf);
        const floors = [], ceilings = [], walls = [];
        for (const [la, lb, lc] of dc.localTris) {
            const wa = m.multiplyPosition([...la, 1]);
            const wb = m.multiplyPosition([...lb, 1]);
            const wc = m.multiplyPosition([...lc, 1]);
            const tri = this._makeTri([wa[0],wa[1],wa[2]], [wb[0],wb[1],wb[2]], [wc[0],wc[1],wc[2]]);
            if (!tri) {
                continue;
            }
            // Back-reference to the owning mover: a decal on a moving wall
            // (door/lift) rides it. Static map tris (built elsewhere) never
            // carry this, so hit.tri.instance === undefined marks a static wall.
            tri.instance = dc.instance;
            this._classifyTri(tri, floors, ceilings, walls);
        }
        dc.floors   = floors;
        dc.ceilings = ceilings;
        dc.walls    = walls;
        const lc = dc.centerLocal;
        const cw = m.multiplyPosition([lc[0], lc[1], lc[2], 1]);
        dc.centerWorld = [cw[0], cw[1], cw[2]];
    }

    // --- Private: wall resolution ---

    _resolveWallFrom(cx, cz, vx, vz, r, feetY, h, tris, count, stepHeight = 0) {
        const EPSILON = 1e-4;
        let C = [cx, cz], V = [vx, vz];
        let prevNx = null, prevNz = null;

        // Depenetration: push the circle out of any wall segment it already overlaps.
        // Without this, _sweptCircleVsSegment returns null for already-overlapping geometry
        // (t < 0), causing those faces to be ignored and the player to pass through.
        for (let i = 0; i < count; i++) {
            const tri = tris[i];
            if (feetY >= tri.yMax || feetY + h <= tri.yMin) {
                continue;
            }
            if (stepHeight > 0 && tri.yMax <= feetY + stepHeight) {
                continue;
            }
            const pts = tri.pts;
            for (let e = 0; e < 3; e++) {
                const P = pts[e], Q = pts[(e + 1) % 3];
                const sdx = Q[0]-P[0], sdz = Q[2]-P[2];
                const len2 = sdx*sdx + sdz*sdz;
                if (len2 < 1e-10) {
                    continue;
                }
                const t = Math.max(0, Math.min(1, ((C[0]-P[0])*sdx + (C[1]-P[2])*sdz) / len2));
                const ex = C[0] - (P[0] + t*sdx);
                const ez = C[1] - (P[2] + t*sdz);
                const dist = Math.sqrt(ex*ex + ez*ez);
                if (dist < r && dist > 1e-6) {
                    const push = r - dist;
                    C[0] += (ex / dist) * push;
                    C[1] += (ez / dist) * push;
                }
            }
        }

        for (let iter = 0; iter < 3; iter++) {
            if (Math.sqrt(V[0]*V[0] + V[1]*V[1]) < EPSILON) {
                break;
            }

            let tMin = 1.0, bestNx = 0, bestNz = 0, hit = false;

            const check = (tri) => {
                if (feetY >= tri.yMax || feetY + h <= tri.yMin) {
                    return;
                }
                if (stepHeight > 0 && tri.yMax <= feetY + stepHeight) {
                    return;
                }
                if (!this._aabbXZSweep(C[0], C[1], V[0], V[1], r, tri)) {
                    return;
                }
                const [A, B, Ct] = tri.pts;
                for (const [P, Q] of [[A,B],[B,Ct],[Ct,A]]) {
                    const res = this._sweptCircleVsSegment(C[0], C[1], V[0], V[1], P[0], P[2], Q[0], Q[2], r);
                    if (res && res.t < tMin) {
                        tMin = res.t; bestNx = res.nx; bestNz = res.nz; hit = true;
                    }
                }
            };
            for (let i = 0; i < count; i++) {
                check(tris[i]);
            }

            C[0] += (tMin - ((hit) ? EPSILON : 0)) * V[0];
            C[1] += (tMin - ((hit) ? EPSILON : 0)) * V[1];
            if (!hit) {
                break;
            }

            const vr0 = (1 - tMin) * V[0], vr1 = (1 - tMin) * V[1];
            const dot = vr0 * bestNx + vr1 * bestNz;
            V[0] = vr0 - dot * bestNx;
            V[1] = vr1 - dot * bestNz;

            if (prevNx !== null) {
                const dot2 = V[0]*prevNx + V[1]*prevNz;
                V[0] -= dot2 * prevNx;
                V[1] -= dot2 * prevNz;
            }
            prevNx = bestNx; prevNz = bestNz;
        }
        return { x: C[0], z: C[1] };
    }

    // --- Private: cylinder-instance intersection ---

    _instanceCylinderIntersects(user, dc) {
        const bpDx = user.x - dc.centerWorld[0], bpDz = user.z - dc.centerWorld[2];
        if (Math.sqrt(bpDx*bpDx + bpDz*bpDz) > user.getRadius() + dc.bRadius) {
            return false;
        }
        const h = user.getCurrentHeight();
        // Floors excluded: standing on an object's floor is normal (platform riding), not a block
        for (const tri of dc.walls) {
            if (user.y >= tri.yMax || user.y + h <= tri.yMin) {
                continue;
            }
            if (this._circleIntersectsTri(user.x, user.z, user.getRadius(), tri)) {
                return true;
            }
        }
        for (const tri of dc.ceilings) {
            if (user.y >= tri.yMax || user.y + h <= tri.yMin) {
                continue;
            }
            if (this._circleIntersectsTri(user.x, user.z, user.getRadius(), tri)) {
                return true;
            }
        }
        return false;
    }

    _instanceCylinderIntersectsAtTransform(user, dc, tf) {
        return this._cylinderIntersectsAtTransform(user.x, user.y, user.z, user.getRadius(), user.getCurrentHeight(), dc, tf);
    }

    _cylinderIntersectsAtTransform(px, py, pz, r, h, dc, tf) {
        const m  = Matrix.composeInstanceTransform(tf);
        const cw = m.multiplyPosition([dc.centerLocal[0], dc.centerLocal[1], dc.centerLocal[2], 1]);
        const bpDx = px - cw[0], bpDz = pz - cw[2];
        if (Math.sqrt(bpDx*bpDx + bpDz*bpDz) > r + dc.bRadius) {
            return false;
        }
        for (const [la, lb, lc] of dc.localTris) {
            const wa = m.multiplyPosition([la[0], la[1], la[2], 1]);
            const wb = m.multiplyPosition([lb[0], lb[1], lb[2], 1]);
            const wc = m.multiplyPosition([lc[0], lc[1], lc[2], 1]);
            const tri = this._makeTri([wa[0],wa[1],wa[2]], [wb[0],wb[1],wb[2]], [wc[0],wc[1],wc[2]]);
            if (!tri) {
                continue;
            }
            if (tri.n[1] > 0.7) {
                continue;
            }
            if (py >= tri.yMax || py + h <= tri.yMin) {
                continue;
            }
            if (this._circleIntersectsTri(px, pz, r, tri)) {
                return true;
            }
        }
        return false;
    }

    // --- Private: static-only floor/ceiling (used by platform riding Y clamp) ---

    _getStaticFloor(px, pz, r) {
        return this._findFloor(px, pz, r, Infinity, Collision.DYN_NONE).y;
    }

    _getStaticCeiling(px, pz, r, headY) {
        return this._findCeiling(px, pz, r, headY, Collision.DYN_NONE);
    }

    // --- Private: floor/ceiling queries (gather the candidates, then scan them) ---

    // {y, n, tri} of the highest floor — SHARED scratch, consume it immediately.
    _findFloor(px, pz, r, maxSearchY, dynamics) {
        const tris  = this._floorScratch;
        const count = this._gather('floors', px, pz, r, tris, dynamics);
        return this._scanFloors(px, pz, r, maxSearchY, tris, count);
    }

    _findCeiling(px, pz, r, headY, dynamics) {
        const tris  = this._ceilScratch;
        const count = this._gather('ceilings', px, pz, r, tris, dynamics);
        return this._scanCeilings(px, pz, r, headY, tris, count);
    }

    /**
     * Candidate triangles of a circle query on the given face slot ('floors' |
     * 'ceilings'), appended into `out`; returns how many. The static colliders
     * answer through their spatial index, the dynamic ones stay linear (a
     * handful of triangles each, rebuilt every frame). Static go FIRST: a height
     * tie must keep the static winner, which carries no owning instance.
     *
     * dynamics picks the movers — DYN_NONE (static world only), DYN_NEAR (those
     * whose broadphase circle is reached, minus a crush mover pressing the
     * player: its ceiling leaves his queries), DYN_ALL (everything, so a
     * pressing mover still counts in the pinch gap).
     */
    _gather(slot, px, pz, r, out, dynamics) {
        let n = 0;
        for (const sc of this._static) {
            n = sc.grids[slot].queryCircle(px, pz, r, out, n);
        }
        if (dynamics === Collision.DYN_NONE) {
            return n;
        }
        // A crush mover pressing the player is passable for him, so its CEILING
        // must leave his queries (no head clamp under it, lateral clearance
        // ignores it). Its floor still counts — he may be standing on it. Not
        // under DYN_ALL: the pinch predicate needs the pressing mover to keep
        // closing the gap.
        const skipCrushPassable = ((slot === 'ceilings') && (dynamics === Collision.DYN_NEAR));
        for (const dc of this._dynamic) {
            if (skipCrushPassable && dc.instance.isCrushPassable()) {
                continue;
            }
            if ((dynamics === Collision.DYN_NEAR) && !this._broadphaseXZ(px, pz, r, dc)) {
                continue;
            }
            n = Collision._append(dc[slot], out, n);
        }
        return n;
    }

    /**
     * Candidate wall triangles of a swept circle, appended into `out`. Movers
     * join in for the player's own movement — except a crush mover pressing him
     * (vanilla lateral escape) — but never for the platform-riding drift, which
     * resolves against the static world alone.
     *
     * The queried band is the sweep widened by the travel length AND by twice
     * the radius, not just by the radius: the resolution slides along what it
     * hits (so a wall met only after a deflection must already be in the set)
     * and the depenetration pass can push the circle out by up to one radius
     * before it even starts moving. A body buried DEEPER than its own radius
     * inside a block could still be walked past the band, but the physics never
     * lets one get there.
     */
    _gatherWalls(cx, cz, vx, vz, r, out, includeMovers) {
        const margin = 2 * r + Math.sqrt(vx * vx + vz * vz);
        let n = 0;
        for (const sc of this._static) {
            n = sc.grids.walls.querySegment(cx, cz, vx, vz, margin, out, n);
        }
        if (includeMovers !== true) {
            return n;
        }
        for (const dc of this._dynamic) {
            if (dc.instance.isCrushPassable()) {
                continue;
            }
            n = Collision._append(dc.walls, out, n);
        }
        return n;
    }

    // Player displacement resolved against the static world only (riding drift).
    _resolveStaticWalls(user, vx, vz) {
        const tris  = this._wallScratch;
        const count = this._gatherWalls(user.x, user.z, vx, vz, user.getRadius(), tris, false);
        return this._resolveWallFrom(user.x, user.z, vx, vz, user.getRadius(), user.y, user.getCurrentHeight(), tris, count);
    }

    static _append(list, out, n) {
        for (const tri of list) {
            out[n] = tri;
            n++;
        }
        return n;
    }

    // --- Private: floor/ceiling scans (single implementation behind every query) ---

    // Highest floor triangle under the (px, pz, r) circle at or below
    // maxSearchY, among the first `count` candidates: {y, n} — n is null when
    // nothing matched. The result object is reused across calls (one query is
    // always consumed before the next starts).
    _scanFloors(px, pz, r, maxSearchY, tris, count) {
        let maxY    = -Infinity;
        let bestN   = null;
        let bestTri = null;
        for (let i = 0; i < count; i++) {
            const tri = tris[i];
            if (!this._aabbXZ(px, pz, r, tri)) {
                continue;
            }
            if (!this._circleIntersectsTri(px, pz, r, tri)) {
                continue;
            }
            const y = (tri.d - tri.n[0]*px - tri.n[2]*pz) / tri.n[1];
            if (y > maxY && y <= maxSearchY) {
                maxY    = y;
                bestN   = tri.n;
                bestTri = tri;
            }
        }
        const hit = this._floorHit;
        hit.y   = maxY;
        hit.n   = bestN;
        hit.tri = bestTri;
        return hit;
    }

    // Lowest ceiling triangle strictly above headY, among the candidates.
    _scanCeilings(px, pz, r, headY, tris, count) {
        let minY = Infinity;
        for (let i = 0; i < count; i++) {
            const tri = tris[i];
            if (!this._aabbXZ(px, pz, r, tri)) {
                continue;
            }
            if (!this._circleIntersectsTri(px, pz, r, tri)) {
                continue;
            }
            const y = (tri.d - tri.n[0]*px - tri.n[2]*pz) / tri.n[1];
            if (y > headY && y < minY) {
                minY = y;
            }
        }
        return minY;
    }

    // --- Private: broadphase ---

    _broadphaseXZ(px, pz, r, dc) {
        const dx = px - dc.centerWorld[0], dz = pz - dc.centerWorld[2];
        return (Math.sqrt(dx*dx + dz*dz) <= r + dc.bRadius);
    }

    // --- Private: 2D XZ geometry ---

    _aabbXZ(px, pz, r, tri) {
        return (px + r >= tri.xMin && px - r <= tri.xMax
            && pz + r >= tri.zMin && pz - r <= tri.zMax);
    }

    _aabbXZSweep(cx, cz, vx, vz, r, tri) {
        const minX = Math.min(cx, cx+vx) - r, maxX = Math.max(cx, cx+vx) + r;
        const minZ = Math.min(cz, cz+vz) - r, maxZ = Math.max(cz, cz+vz) + r;
        return (maxX >= tri.xMin && minX <= tri.xMax
            && maxZ >= tri.zMin && minZ <= tri.zMax);
    }

    _cross2D(ux, uz, vx, vz) {
        return ux * vz - uz * vx;
    }

    _distToSegment(px, pz, ax, az, bx, bz) {
        const dx = bx - ax, dz = bz - az;
        const len2 = dx*dx + dz*dz;
        if (len2 < 1e-10) {
            return Math.sqrt((px-ax)**2 + (pz-az)**2);
        }
        const t = Math.max(0, Math.min(1, ((px-ax)*dx + (pz-az)*dz) / len2));
        return Math.sqrt((px-ax-t*dx)**2 + (pz-az-t*dz)**2);
    }

    _circleIntersectsTri(px, pz, r, tri) {
        const [A, B, C] = tri.pts;
        const d0 = this._cross2D(B[0]-A[0], B[2]-A[2], px-A[0], pz-A[2]);
        const d1 = this._cross2D(C[0]-B[0], C[2]-B[2], px-B[0], pz-B[2]);
        const d2 = this._cross2D(A[0]-C[0], A[2]-C[2], px-C[0], pz-C[2]);
        if ((d0>=0 && d1>=0 && d2>=0) || (d0<=0 && d1<=0 && d2<=0)) {
            return true;
        }
        return (this._distToSegment(px, pz, A[0],A[2], B[0],B[2]) < r
            || this._distToSegment(px, pz, B[0],B[2], C[0],C[2]) < r
            || this._distToSegment(px, pz, C[0],C[2], A[0],A[2]) < r);
    }

    // Same-side test on the triangle plane: the point (assumed coplanar, from a
    // ray-plane hit) is inside when it stays on one side of every edge.
    _pointInTri(px, py, pz, tri) {
        const [A, B, C] = tri.pts;
        const e0 = this._edgeSide(A, B, px, py, pz, tri.n);
        const e1 = this._edgeSide(B, C, px, py, pz, tri.n);
        const e2 = this._edgeSide(C, A, px, py, pz, tri.n);
        return ((e0 >= 0 && e1 >= 0 && e2 >= 0) || (e0 <= 0 && e1 <= 0 && e2 <= 0));
    }

    _edgeSide(P, Q, px, py, pz, n) {
        const ex = Q[0]-P[0], ey = Q[1]-P[1], ez = Q[2]-P[2];
        const wx = px-P[0],   wy = py-P[1],   wz = pz-P[2];
        const cx = ey*wz - ez*wy;
        const cy = ez*wx - ex*wz;
        const cz = ex*wy - ey*wx;
        return cx*n[0] + cy*n[1] + cz*n[2];
    }

    _sweptCircleVsSegment(cx, cz, vx, vz, ax, az, bx, bz, r) {
        const sdx = bx - ax, sdz = bz - az;
        const slen = Math.sqrt(sdx*sdx + sdz*sdz);
        if (slen < 1e-10) {
            return this._sweptCircleVsPoint(cx, cz, vx, vz, ax, az, r);
        }

        const nix = -sdz / slen, niz = sdx / slen;
        const dist = nix * (cx - ax) + niz * (cz - az);
        const vn   = nix * vx + niz * vz;
        if (Math.abs(vn) > 1e-10) {
            const sn = ((dist >= 0) ? 1 : -1);
            const t  = (sn * r - dist) / vn;
            if (t >= 0 && t <= 1) {
                const s = (cx + t*vx - ax) * (sdx/slen) + (cz + t*vz - az) * (sdz/slen);
                if (s >= 0 && s <= slen) {
                    return { t, nx: sn * nix, nz: sn * niz };
                }
            }
        }

        const ra = this._sweptCircleVsPoint(cx, cz, vx, vz, ax, az, r);
        const rb = this._sweptCircleVsPoint(cx, cz, vx, vz, bx, bz, r);
        if (ra && rb) {
            return ((ra.t < rb.t) ? ra : rb);
        }
        return ra || rb;
    }

    _sweptCircleVsPoint(cx, cz, vx, vz, sx, sz, r) {
        const a = vx*vx + vz*vz;
        if (a < 1e-10) {
            return null;
        }
        const b    = 2 * (vx*(cx-sx) + vz*(cz-sz));
        const c    = (cx-sx)**2 + (cz-sz)**2 - r*r;
        const disc = b*b - 4*a*c;
        if (disc < 0) {
            return null;
        }
        const t = (-b - Math.sqrt(disc)) / (2*a);
        if (t < 0 || t > 1) {
            return null;
        }
        const hx = cx + t*vx - sx, hz = cz + t*vz - sz;
        const hlen = Math.sqrt(hx*hx + hz*hz);
        if (hlen < 1e-10) {
            return null;
        }
        return { t, nx: hx/hlen, nz: hz/hlen };
    }
}

// Which dynamic movers join a circle query (see _gather)
Collision.DYN_NONE = 0;
Collision.DYN_NEAR = 1;
Collision.DYN_ALL  = 2;
