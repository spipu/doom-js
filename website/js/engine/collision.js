class Collision {
    constructor() {
        this._static      = [];                            // [{floors, ceilings, walls, grids}] — grids index the three lists
        this._dynamic     = [];                            // [{instance, localTris, bRadius, centerLocal, floors, ceilings, walls, centerWorld, platformDeltas}]
        this._boxes       = [];                            // [{instance, cx, cz, half, yBottom, yTop}] — axis-aligned square blockers
        this._users       = [];                            // user bodies, square blockers of one another
        this._prevUserPos = new Map();                     // user → position at the end of the previous pressure pass
        this._tfDelta     = {dx: 0, dy: 0, dz: 0, dRy: 0}; // scratch of _transformDelta
        // One candidate buffer per family: the pinch test gathers floors then
        // ceilings and must not overwrite the set it is still scanning.
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

        // A box its owner moves or removes must be re-synced through
        // syncBoxFor / removeBoxFor; one riding a moving floor follows on its own.
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
            localTris.push([[A[0],A[1],A[2]], [B[0],B[1],B[2]], [C[0],C[1],C[2]], Collision._refusesDecal(fc)]);
        }
        const dc = {
            instance,
            localTris,
            bRadius:               obj.getBoundingRadius(),
            centerLocal:           obj.getCenter(),
            floors: [], ceilings: [], walls: [],
            centerWorld:           [0, 0, 0],
            platformDeltas:        new Map(),   // user → the move this platform gave that user this turn
        };
        this._dynamic.push(dc);
        this._updateDynamicCollider(dc);
    }

    updateDynamicColliders() {
        for (const dc of this._dynamic) {
            this._updateDynamicCollider(dc);
        }
    }

    // Box blockers riding a moving floor re-read the position their instance
    // already followed (Instance._syncRide).
    syncRidingBoxes() {
        for (const box of this._boxes) {
            if (box.instance.getRideOn() !== null) {
                this._refreshBox(box);
            }
        }
    }

    // A user body blocks the other users like a square blocker (vanilla players
    // are solid to one another); moving bodies of the game layer keep their own rules.
    addUser(user) {
        this._users.push(user);
    }

    removeUser(user) {
        this._users = this._users.filter((other) => (other !== user));
        this._prevUserPos.delete(user);
        for (const dc of this._dynamic) {
            dc.platformDeltas.delete(user);
        }
    }

    syncBoxFor(instance) {
        for (const box of this._boxes) {
            if (box.instance === instance) {
                this._refreshBox(box);
                return;
            }
        }
    }

    hasBoxFor(instance) {
        return this._boxes.some((box) => (box.instance === instance));
    }

    // Safe on an instance with no box
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
        const tri   = found.tri;

        return {y: found.y, instance: ((tri !== null) ? (tri.instance ?? null) : null)};
    }

    getCeiling(px, pz, r, headY) {
        return this._findCeiling(px, pz, r, headY, Collision.DYN_NEAR);
    }

    // Nearest hit along a normalised direction: {point, dist, normal, tri} or
    // null. Walls always; opts {floors, ceilings, dynamic, includeShotPassable}.
    raycast(ox, oy, oz, dx, dy, dz, maxDist = Infinity, opts = {}) {
        const tris  = this._rayScratch;
        const count = this._gatherRay(ox, oz, dx, dz, maxDist, tris, opts);
        let best    = null;
        let bestT   = maxDist;
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
            if ((t < 0) || (t > bestT)) {
                continue;
            }
            const px = ox + t*dx, py = oy + t*dy, pz = oz + t*dz;
            // AABB slackened on every axis: a flat triangle has a zero-thickness
            // box, and the ray/plane solve lands an ulp off it.
            const eps = Collision.RAY_AABB_EPSILON;
            if ((px < tri.xMin - eps) || (px > tri.xMax + eps)
                || (py < tri.yMin - eps) || (py > tri.yMax + eps)
                || (pz < tri.zMin - eps) || (pz > tri.zMax + eps)) {
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

    // Candidates of a ray, appended into `out`; returns how many.
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
    // blocker (which sits at its own centre and would pin it in place); a
    // registered user passed there is also blocked by the other users.
    resolveWall(cx, cz, vx, vz, r, feetY, h, stepHeight = 0, ignoreBoxOf = null) {
        const tris  = this._wallScratch;
        let count   = this._gatherWalls(cx, cz, vx, vz, r, tris, true);
        const res   = this._resolveWallFrom(cx, cz, vx, vz, r, feetY, h, tris, count, stepHeight);
        const boxed = this._resolveBoxes(res.x, res.z, r, feetY, h, ignoreBoxOf);

        const ejectX = boxed.x - res.x;
        const ejectZ = boxed.z - res.z;
        if ((ejectX === 0) && (ejectZ === 0)) {
            return boxed;
        }
        // The box ejection is itself wall-resolved, or it could shove a squeezed
        // body through a wall; any overlap left is cleared on later frames.
        count = this._gatherWalls(res.x, res.z, ejectX, ejectZ, r, tris, true);
        return this._resolveWallFrom(res.x, res.z, ejectX, ejectZ, r, feetY, h, tris, count, stepHeight);
    }

    // Push the cylinder out of each overlapping box along the axis of least
    // penetration, which keeps the tangential motion (sliding along faces).
    _resolveBoxes(x, z, r, feetY, h, ignoreBoxOf = null) {
        const users = this._blockingUsers(ignoreBoxOf);
        const body  = { x, z };
        if ((this._boxes.length === 0) && (users.length === 0)) {
            return body;
        }
        const headY = feetY + h;
        for (let pass = 0; pass < 3; pass++) {
            let moved = false;
            for (const box of this._boxes) {
                if (box.instance === ignoreBoxOf) {
                    continue;
                }
                moved = (Collision._pushOutOfBox(body, r, feetY, headY, box.cx, box.cz, box.half, box.yBottom, box.yTop) || moved);
            }
            for (const user of users) {
                moved = (Collision._pushOutOfBox(body, r, feetY, headY, user.x, user.z, user.getRadius(), user.y, user.y + user.getCurrentHeight()) || moved);
            }
            if (!moved) {
                break;
            }
        }
        return body;
    }

    // The living users that block this one; none for any other body.
    _blockingUsers(ignoreBoxOf) {
        if ((this._users.length < 2) || !this._users.includes(ignoreBoxOf)) {
            return Collision.NO_USERS;
        }
        return this._users.filter((user) => ((user !== ignoreBoxOf) && !user.isDead()));
    }

    // Moves the body out of the box along the axis of least penetration;
    // returns whether it moved.
    static _pushOutOfBox(body, r, feetY, headY, cx, cz, half, yBottom, yTop) {
        if ((feetY >= yTop) || (headY <= yBottom)) {
            return false;
        }
        const reach    = half + r;
        const overlapX = reach - Math.abs(body.x - cx);
        const overlapZ = reach - Math.abs(body.z - cz);
        if ((overlapX <= 0) || (overlapZ <= 0)) {
            return false;
        }
        if (overlapX < overlapZ) {
            body.x += ((body.x >= cx) ? overlapX : -overlapX);
            return true;
        }
        body.z += ((body.z >= cz) ? overlapZ : -overlapZ);
        return true;
    }

    // --- Platform riding & object blocking ---

    applyPlatformRiding(user) {
        for (const dc of this._dynamic) {
            dc.platformDeltas.delete(user);
            if (!dc.instance.isCollidable()) {
                continue;
            }
            const prevTf = dc.instance.getPreviousTransform();
            if (!prevTf) {
                continue;
            }
            const {dx, dy, dz, dRy} = this._transformDelta(dc.instance.getTransform(), prevTf);

            if ((Math.abs(dx) < 1e-8) && (Math.abs(dy) < 1e-8) && (Math.abs(dz) < 1e-8) && (Math.abs(dRy) < 1e-8)) {
                continue;
            }

            const floorY = this._scanFloors(user.x, user.z, user.getRadius(), Infinity, dc.floors, dc.floors.length).y;
            if ((floorY === -Infinity) || (Math.abs(user.y - floorY) > 0.15)) {
                continue;
            }

            const origX = user.x, origY = user.y, origZ = user.z;

            // Orbit around the platform's previous centre, then follow its drift
            const prevCx  = prevTf.position[0] + prevTf.deltaTranslate[0];
            const prevCz  = prevTf.position[2] + prevTf.deltaTranslate[2];
            const relX    = user.x - prevCx;
            const relZ    = user.z - prevCz;
            const r       = Math.sqrt(relX*relX + relZ*relZ);
            const newAng  = Math.atan2(relZ, relX) - dRy * DEG_TO_RAD;
            const rotX    = prevCx + r * Math.cos(newAng);
            const rotZ    = prevCz + r * Math.sin(newAng);
            const orbited = this._resolveStaticWalls(user, rotX - user.x, rotZ - user.z);
            user.x = orbited.x; user.z = orbited.z;

            const drifted = this._resolveStaticWalls(user, dx, dz);
            user.x = drifted.x; user.z = drifted.z;

            // Clamped to the static world: the player detaches when the platform
            // passes through a floor or a ceiling.
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

            dc.platformDeltas.set(user, {x: user.x - origX, y: user.y - origY, z: user.z - origZ, yaw: dRy});
        }
    }

    // World.update step 5b, before riding and the users' moves: rolling the
    // mover back first keeps its advanced (overlapping) pose out of their resolution.
    resolveMoverPressure(users) {
        for (const dc of this._dynamic) {
            if (!dc.instance.isCollidable()) {
                continue;
            }
            if (dc.instance.getBlockedBehavior() === 'crush') {
                continue;
            }
            this._resolveSolidPressure(users, dc, dc.instance.getPreviousTransform());
        }
        for (const user of users) {
            this._prevUserPos.set(user, {x: user.x, y: user.y, z: user.z});
        }
    }

    // World.update step 8: crush pressure (the pinch needs the users' final
    // positions) and the riding leftovers of solid movers.
    resolveObjectUserBlockage(users) {
        for (const dc of this._dynamic) {
            if (!dc.instance.isCollidable()) {
                continue;
            }
            const prev = dc.instance.getPreviousTransform();
            if (dc.instance.getBlockedBehavior() === 'crush') {
                this._resolveCrushPressure(users, dc, prev);
                continue;
            }
            const blocked = users.some((user) => (this._instanceCylinderIntersects(user, dc)
                && !(prev && this._instanceCylinderIntersectsAtTransform(user, dc, prev))));
            if (!blocked) {
                continue;
            }
            if (prev) {
                dc.instance.rollbackTransform(prev);
                this._updateDynamicCollider(dc);
            }
            // The platform went back: so do the users it carried this turn.
            for (const [user, delta] of dc.platformDeltas) {
                user.x   -= delta.x;
                user.y   -= delta.y;
                user.z   -= delta.z;
                user.yaw += delta.yaw;
            }
            dc.platformDeltas.clear();
        }
    }

    // No rollback, and a pinch test (PIT_ChangeSector) rather than the cylinder
    // one. Engaged by the mover's own move, kept while a pinch lasts so a user
    // under a stopped crusher can still leave; damage only while it moves.
    _resolveCrushPressure(users, dc, prev) {
        const inst    = dc.instance;
        const pinched = users.filter((user) => this._userPinchedBy(user, dc));
        if (pinched.length === 0) {
            inst.setBlockedPressing(false);
            return;
        }
        const moved = ((prev !== null) && this._moverMovedSince(dc, prev));
        if ((inst.isBlockedPressing() === false) && (moved === false)) {
            return;
        }
        inst.setBlockedPressing(true);
        inst.setCrushActive(moved);
        inst.setCrushVictims(pinched);
        // Vanilla clips the squeezed body into the mover, never ejecting it
        // above the map: only the static ceiling bounds the head.
        for (const user of pinched) {
            const staticCeil = this._getStaticCeiling(user.x, user.z, user.getRadius(), user.y);
            if (staticCeil !== Infinity) {
                user.y = Math.min(user.y, staticCeil - user.getCurrentHeight());
            }
        }
    }

    // The mover rolls back once when its own move pressed any user; it is
    // released only when no user keeps it pressing.
    _resolveSolidPressure(users, dc, prev) {
        const inst = dc.instance;
        let pushed = false;
        let kept   = false;
        for (const user of users) {
            const verdict = this._solidPressureOn(user, dc, prev);
            if (verdict === Collision.PRESS_PUSH) {
                pushed = true;
                break;
            }
            kept = (kept || (verdict === Collision.PRESS_KEEP));
        }
        if (!pushed) {
            if (!kept) {
                inst.setBlockedPressing(false);
            }
            return;
        }
        inst.rollbackTransform(prev);
        this._updateDynamicCollider(dc);
        inst.setBlockedPressing(true);
        if (inst.getBlockedBehavior() === 'reverse') {
            inst.reverseBlocked();
        }
    }

    // Whether the mover's own move pressed this user (PUSH: roll it back), left
    // the pressure as it was (KEEP) or is clear of the user (CLEAR). An overlap
    // that already existed only pushes if the user was trapped there last turn
    // too: the mover then stalls rather than walking through the body.
    _solidPressureOn(user, dc, prev) {
        if (!this._broadphaseXZ(user.x, user.z, user.getRadius(), dc)) {
            return Collision.PRESS_CLEAR;
        }
        if (this._standsOnInstance(user, dc)) {
            // A rider squeezed between this rising floor and a ceiling is a
            // pressure (T_PlatRaise) the cylinder test cannot see.
            if (!this._userPinchedBy(user, dc)) {
                return Collision.PRESS_CLEAR;
            }
            // Not rising this turn (wait/descent): nothing to undo.
            return (((prev === null) || (this._moverFrameDeltaY(dc, prev) <= 1e-8)) ? Collision.PRESS_KEEP : Collision.PRESS_PUSH);
        }
        if (!this._instanceCylinderIntersects(user, dc)) {
            return Collision.PRESS_CLEAR;
        }
        if (prev === null) {
            return Collision.PRESS_KEEP;
        }
        if (!this._instanceCylinderIntersectsAtTransform(user, dc, prev)) {
            return Collision.PRESS_PUSH;
        }
        // Only a mover coming down: an opening door must keep opening to free
        // a wedged user.
        if (this._moverFrameDeltaY(dc, prev) >= -1e-8) {
            return Collision.PRESS_KEEP;
        }
        const last = (this._prevUserPos.get(user) ?? null);
        if ((last === null)
            || !this._cylinderIntersectsAtTransform(last.x, last.y, last.z, user.getRadius(), user.getCurrentHeight(), dc, prev)) {
            return Collision.PRESS_KEEP;
        }
        return Collision.PRESS_PUSH;
    }

    // Local vertical gap at the player's position vs his height (the vanilla
    // "thing does not fit" of PIT_ChangeSector). Unfiltered lists on purpose:
    // the pressing (passable) mover itself must keep counting in the gap.
    _userPinchedBy(user, dc) {
        if (!this._broadphaseXZ(user.x, user.z, user.getRadius(), dc)) {
            return false;
        }
        const r = user.getRadius();
        // 0.15 above the feet: at 5b the ride is not applied yet, so the mover's
        // top may still be a frame of travel above them.
        const floorY = this._findFloor(user.x, user.z, r, user.y + 0.15, Collision.DYN_ALL).y;
        if (floorY === -Infinity) {
            return false;
        }
        const ceilY = this._findCeiling(user.x, user.z, r, floorY + 0.001, Collision.DYN_ALL);
        return ((ceilY - floorY) < (user.getCurrentHeight() - 1e-4));
    }

    // Same standing test as applyPlatformRiding
    _standsOnInstance(user, dc) {
        const floorY = this._scanFloors(user.x, user.z, user.getRadius(), Infinity, dc.floors, dc.floors.length).y;
        return ((floorY !== -Infinity) && (Math.abs(user.y - floorY) <= 0.15));
    }

    // Returns the shared scratch object
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
        return ((Math.abs(d.dx) >= 1e-8) || (Math.abs(d.dy) >= 1e-8) || (Math.abs(d.dz) >= 1e-8) || (Math.abs(d.dRy) >= 1e-8));
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
            tri.noDecal      = Collision._refusesDecal(fc);
            this._classifyTri(tri, floors, ceilings, walls);
        }
        // Static geometry never moves, so it is indexed once
        const grids = {
            floors:   new SpatialGrid(floors),
            ceilings: new SpatialGrid(ceilings),
            walls:    new SpatialGrid(walls),
        };
        return { floors, ceilings, walls, grids };
    }

    static _refusesDecal(fc) {
        return ((fc.noDecal === true) || (fc.collisionOnly === true));
    }

    // The kind is kept on the triangle so a raycast hit can tell its surface
    _classifyTri(tri, floors, ceilings, walls) {
        if (tri.n[1] > Collision.HORIZONTAL_NY) {
            tri.kind = Collision.KIND_FLOOR;
            floors.push(tri);
        } else if (tri.n[1] < -Collision.HORIZONTAL_NY) {
            tri.kind = Collision.KIND_CEILING;
            ceilings.push(tri);
        } else {
            tri.kind = Collision.KIND_WALL;
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
        const tf     = dc.instance.getTransform();
        const m      = Matrix.composeInstanceTransform(tf);
        const floors = [], ceilings = [], walls = [];
        for (const [la, lb, lc, noDecal] of dc.localTris) {
            const wa = m.multiplyPosition([...la, 1]);
            const wb = m.multiplyPosition([...lb, 1]);
            const wc = m.multiplyPosition([...lc, 1]);
            const tri = this._makeTri([wa[0],wa[1],wa[2]], [wb[0],wb[1],wb[2]], [wc[0],wc[1],wc[2]]);
            if (!tri) {
                continue;
            }
            // Lets a decal ride its mover; static tris leave it undefined.
            tri.instance = dc.instance;
            tri.noDecal  = noDecal;
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

        // Iterated: in an acute corner the push out of one wall lands in the other
        for (let pass = 0; pass < Collision.DEPENETRATION_PASSES; pass++) {
            let pushed = false;
            for (let i = 0; i < count; i++) {
                const tri = tris[i];
                if ((feetY >= tri.yMax) || (feetY + h <= tri.yMin)) {
                    continue;
                }
                if ((stepHeight > 0) && (tri.yMax <= feetY + stepHeight)) {
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
                    if ((dist < r) && (dist > 1e-6)) {
                        const push = r - dist;
                        C[0] += (ex / dist) * push;
                        C[1] += (ez / dist) * push;
                        pushed = (pushed || (push > EPSILON));
                    }
                }
            }
            if (!pushed) {
                break;
            }
        }

        for (let iter = 0; iter < 3; iter++) {
            if (Math.sqrt(V[0]*V[0] + V[1]*V[1]) < EPSILON) {
                break;
            }

            let tMin = 1.0, bestNx = 0, bestNz = 0, hit = false;

            const sweepTri = (tri) => {
                if ((feetY >= tri.yMax) || (feetY + h <= tri.yMin)) {
                    return;
                }
                if ((stepHeight > 0) && (tri.yMax <= feetY + stepHeight)) {
                    return;
                }
                if (!this._aabbXZSweep(C[0], C[1], V[0], V[1], r, tri)) {
                    return;
                }
                const [A, B, Ct] = tri.pts;
                for (const [P, Q] of [[A,B],[B,Ct],[Ct,A]]) {
                    const res = this._sweptCircleVsSegment(C[0], C[1], V[0], V[1], P[0], P[2], Q[0], Q[2], r);
                    if (res && (res.t < tMin)) {
                        tMin = res.t; bestNx = res.nx; bestNz = res.nz; hit = true;
                    }
                }
            };
            for (let i = 0; i < count; i++) {
                sweepTri(tris[i]);
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
        // Floors excluded: standing on a mover is riding it, not being blocked
        for (const tri of dc.walls) {
            if ((user.y >= tri.yMax) || (user.y + h <= tri.yMin)) {
                continue;
            }
            if (this._circleIntersectsTri(user.x, user.z, user.getRadius(), tri)) {
                return true;
            }
        }
        for (const tri of dc.ceilings) {
            if ((user.y >= tri.yMax) || (user.y + h <= tri.yMin)) {
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
        const m    = Matrix.composeInstanceTransform(tf);
        const cw   = m.multiplyPosition([dc.centerLocal[0], dc.centerLocal[1], dc.centerLocal[2], 1]);
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
            if ((py >= tri.yMax) || (py + h <= tri.yMin)) {
                continue;
            }
            if (this._circleIntersectsTri(px, pz, r, tri)) {
                return true;
            }
        }
        return false;
    }

    // --- Private: static-only floor/ceiling ---

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

    // Candidates of a circle query on 'floors' or 'ceilings', appended into
    // `out`; returns how many. Static first: a height tie keeps the static winner.
    _gather(slot, px, pz, r, out, dynamics) {
        let n = 0;
        for (const sc of this._static) {
            n = sc.grids[slot].queryCircle(px, pz, r, out, n);
        }
        if (dynamics === Collision.DYN_NONE) {
            return n;
        }
        // A pressing crush mover's ceiling leaves the player's queries (he may
        // still stand on its floor); DYN_ALL keeps it for the pinch gap.
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

    // Candidate walls of a swept circle, appended into `out`. The band is widened
    // by the travel length and twice the radius: the slide can meet walls after
    // a deflection, and depenetration can move the circle by one radius first.
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

    // Highest floor under the circle at or below maxSearchY: {y, n, tri}, n and
    // tri null when nothing matched. The result object is shared across calls.
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
            if ((y > maxY) && (y <= maxSearchY)) {
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
            if ((y > headY) && (y < minY)) {
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
        return ((px + r >= tri.xMin) && (px - r <= tri.xMax)
            && (pz + r >= tri.zMin) && (pz - r <= tri.zMax));
    }

    _aabbXZSweep(cx, cz, vx, vz, r, tri) {
        const minX = Math.min(cx, cx+vx) - r, maxX = Math.max(cx, cx+vx) + r;
        const minZ = Math.min(cz, cz+vz) - r, maxZ = Math.max(cz, cz+vz) + r;
        return ((maxX >= tri.xMin) && (minX <= tri.xMax)
            && (maxZ >= tri.zMin) && (minZ <= tri.zMax));
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
        if (((d0>=0) && (d1>=0) && (d2>=0)) || ((d0<=0) && (d1<=0) && (d2<=0))) {
            return true;
        }
        return ((this._distToSegment(px, pz, A[0],A[2], B[0],B[2]) < r)
            || (this._distToSegment(px, pz, B[0],B[2], C[0],C[2]) < r)
            || (this._distToSegment(px, pz, C[0],C[2], A[0],A[2]) < r));
    }

    // Point assumed coplanar (a ray-plane hit)
    _pointInTri(px, py, pz, tri) {
        const [A, B, C] = tri.pts;
        const e0 = this._edgeSide(A, B, px, py, pz, tri.n);
        const e1 = this._edgeSide(B, C, px, py, pz, tri.n);
        const e2 = this._edgeSide(C, A, px, py, pz, tri.n);
        return (((e0 >= 0) && (e1 >= 0) && (e2 >= 0)) || ((e0 <= 0) && (e1 <= 0) && (e2 <= 0)));
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

        const nix  = -sdz / slen, niz = sdx / slen;
        const dist = nix * (cx - ax) + niz * (cz - az);
        const vn   = nix * vx + niz * vz;
        if (Math.abs(vn) > 1e-10) {
            const sn = ((dist >= 0) ? 1 : -1);
            // A circle already in contact (or overlapping) and pushing into the
            // wall is a hit at t = 0: the exact-contact case would otherwise give
            // a rounding-sign t and let the whole move pass through the wall.
            const t  = ((((sn * dist) <= r) && ((sn * vn) < 0)) ? 0 : (sn * r - dist) / vn);
            if ((t >= 0) && (t <= 1)) {
                const s = (cx + t*vx - ax) * (sdx/slen) + (cz + t*vz - az) * (sdz/slen);
                if ((s >= 0) && (s <= slen)) {
                    return { t, nx: sn * nix, nz: sn * niz };
                }
            }
        }

        const ra = this._sweptCircleVsPoint(cx, cz, vx, vz, ax, az, r);
        const rb = this._sweptCircleVsPoint(cx, cz, vx, vz, bx, bz, r);
        if (ra && rb) {
            return ((ra.t < rb.t) ? ra : rb);
        }
        return (ra || rb);
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
        // Already touching the point and moving toward it (b < 0): hit at t = 0.
        const t = (((c <= 0) && (b < 0)) ? 0 : (-b - Math.sqrt(disc)) / (2*a));
        if ((t < 0) || (t > 1)) {
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

Collision.DEPENETRATION_PASSES = 4;
// Which movers join a circle query: none, those within broadphase reach, all
Collision.DYN_NONE = 0;
Collision.DYN_NEAR = 1;
Collision.DYN_ALL  = 2;
// |normal.y| from which a triangle is a floor or a ceiling rather than a wall
Collision.HORIZONTAL_NY = 0.7;
// Slack of the raycast AABB test (world units)
Collision.RAY_AABB_EPSILON = 1e-6;
Collision.KIND_FLOOR    = 'floor';
Collision.KIND_CEILING  = 'ceiling';
Collision.KIND_WALL     = 'wall';
// Pressure verdicts of a solid mover on one user (see _solidPressureOn).
Collision.PRESS_CLEAR = 'clear';
Collision.PRESS_KEEP  = 'keep';
Collision.PRESS_PUSH  = 'push';
// Shared empty blocker list: most resolutions have no other user to test.
Collision.NO_USERS = Object.freeze([]);
